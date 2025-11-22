import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as http from "http";
import * as crypto from "crypto";
import { sharedIndex2, isIndexReady } from "./Index2";
import * as vscode from 'vscode';

export async function startMcpServer(context: vscode.ExtensionContext) {
    const server = new McpServer({
        name: "zma-notes",
        version: "1.0.0"
    });

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
            return {
                contents: [{
                    uri: uri.href,
                    text: file.content
                }]
            };
        }
    );

    server.registerTool(
        "search_notes",
        {
            description: "Search for notes by content or title",
            inputSchema: {
                query: z.string().describe("The search query")
            }
        },
        async ({ query }) => {
            if (!isIndexReady()) {
                return { content: [{ type: "text", text: "Index not ready" }] };
            }
            const index = sharedIndex2();
            const results = index.allFiles()
                .filter(f => f.content.toLowerCase().includes(query.toLowerCase()) || f.link.linkName().toLowerCase().includes(query.toLowerCase()))
                .slice(0, 20)
                .map(f => ({
                    name: f.link.linkName(),
                    preview: f.content.slice(0, 100).replace(/\n/g, ' ') + "..."
                }));

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(results, null, 2)
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

    httpServer.listen(0, () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') {
            console.log(`MCP Server running on port ${addr.port}`);
            // vscode.window.showInformationMessage(`MCP Server running on port ${addr.port}`);
        }
    });

    context.subscriptions.push({
        dispose: () => {
            httpServer.close();
            transport.close();
        }
    });
}
