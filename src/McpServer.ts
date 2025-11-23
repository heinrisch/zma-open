import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as http from "http";
import * as crypto from "crypto";
import { sharedIndex2, isIndexReady } from "./Index2";
import { SemanticSearch, loadEmbeddingConfig } from "./SemanticSearch";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface McpConfig {
    startMcpServer: boolean;
    port?: number;
}

export async function startMcpServer(context: vscode.ExtensionContext) {
    const config = loadMcpConfig();
    if (!config || !config.startMcpServer) {
        console.log("MCP Server disabled in config");
        return;
    }

    const server = new McpServer({
        name: "zma-notes",
        version: "1.0.0"
    });

    const embeddingConfig = loadEmbeddingConfig();
    let semanticSearch: SemanticSearch | null = null;
    if (embeddingConfig) {
        semanticSearch = new SemanticSearch(embeddingConfig);
        void semanticSearch.generateEmbeddings();
    }

    server.registerResource(
        "note",
        new ResourceTemplate("note://{name}", { list: undefined }),
        {
            mimeType: "text/markdown"
        },
        async (uri, { name }) => {
            if (!isIndexReady()) {
                throw new Error("Index not ready");
            }
            const index = sharedIndex2();
            const file = index.allFiles().find(f => f.link.linkName() === name);
            if (!file) {
                throw new Error(`Note not found: ${name}`);
            }

            const tags = file.tags.length > 0 ? `\n\nTags: ${file.tags.join(', ')}` : '';

            return {
                contents: [{
                    uri: uri.href,
                    text: file.content + tags
                }]
            };
        }
    );

    server.registerTool(
        "search_notes",
        {
            description: "Search for notes by content, title, or tags",
            inputSchema: {
                query: z.string().describe("The search query")
            }
        },
        async ({ query }) => {
            if (!isIndexReady()) {
                return { content: [{ type: "text", text: "Index not ready" }] };
            }
            const index = sharedIndex2();
            const lowerQuery = query.toLowerCase();

            const results = index.allFiles()
                .filter(f => {
                    const contentMatch = f.content.toLowerCase().includes(lowerQuery);
                    const titleMatch = f.link.linkName().toLowerCase().includes(lowerQuery);
                    const tagMatch = f.tags.some(t => t.toLowerCase().includes(lowerQuery));
                    return contentMatch || titleMatch || tagMatch;
                })
                .slice(0, 20)
                .map(f => ({
                    name: f.link.linkName(),
                    preview: f.content.slice(0, 100).replace(/\n/g, ' ') + "...",
                    tags: f.tags
                }));

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(results, null, 2)
                }]
            };
        }
    );

    if (semanticSearch) {
        server.registerTool(
            "semantic_search",
            {
                description: "Search for notes using semantic embeddings based on link contexts",
                inputSchema: {
                    query: z.string().describe("The search query")
                }
            },
            async ({ query }) => {
                if (!semanticSearch) return { content: [{ type: "text", text: "Semantic search not configured" }] };
                const results = await semanticSearch.search(query);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(results, null, 2)
                    }]
                };
            }
        );
    }

    server.registerTool(
        "read_note",
        {
            description: "Read the content of a note by its name (link name)",
            inputSchema: {
                name: z.string().describe("The name of the note to read")
            }
        },
        async ({ name }) => {
            if (!isIndexReady()) {
                return { content: [{ type: "text", text: "Index not ready" }] };
            }
            const index = sharedIndex2();
            const file = index.allFiles().find(f => f.link.linkName() === name);
            if (!file) {
                return { isError: true, content: [{ type: "text", text: `Note not found: ${name}` }] };
            }

            const tags = file.tags.length > 0 ? `\n\nTags: ${file.tags.join(', ')}` : '';

            return {
                content: [{
                    type: "text",
                    text: file.content + tags
                }]
            };
        }
    );

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true
    });

    await server.connect(transport);

    const httpServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || "", `http://${req.headers.host}`);

        if (url.pathname === "/sse" || url.pathname === "/messages" || url.pathname === "/mcp") {
            await transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    const port = config.port || 42461;

    httpServer.listen(port, () => {
        console.log(`MCP Server running on port ${port}`);
        // vscode.window.showInformationMessage(`MCP Server running on port ${port}`);
    });

    context.subscriptions.push({
        dispose: () => {
            httpServer.close();
            transport.close();
        }
    });

    if (semanticSearch) {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                if (document.languageId === 'markdown' || document.fileName.endsWith('.md')) {
                    await semanticSearch!.updateForFile(document.fileName, document.getText());
                }
            })
        );
    }
}

function loadMcpConfig(): McpConfig | null {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        return null;
    }
    const configPath = path.join(folder, 'mcp-config.json');
    if (!fs.existsSync(configPath)) {
        const defaultConfig: McpConfig = {
            startMcpServer: false,
            port: 42461
        };
        fs.writeFileSync(
            configPath,
            JSON.stringify(defaultConfig, null, 2) + '\n'
        );
        return defaultConfig;
    }
    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData) as McpConfig;
    } catch (error) {
        console.error('Failed to load MCP config:', error);
        return null;
    }
}
