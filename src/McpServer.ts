import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Use z from the SDK if available, or just rely on runtime validation.
// The MCP SDK exports z as part of its types usually, or we need to ensure versions match.
// For now, let's try to not use zod directly in the registerTool inputSchema if possible, or cast it.
// Actually, the issue is likely due to strict checking of the inputSchema type.
// The MCP SDK expects a specific Zod version or a JSON Schema.
// Let's try to import z from zod and cast the schema to any to bypass the deep type check error,
// while keeping the runtime behavior correct.
import { z } from "zod";
import * as http from "http";
import * as crypto from "crypto";
import { sharedIndex2, isIndexReady } from "./Index2";
import { SemanticSearch, loadEmbeddingConfig } from "./SemanticSearch";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getTaskData, TaskState } from "./Tasks";

interface McpConfig {
    startMcpServer: boolean;
    port?: number;
    verbose?: boolean;
}

// Module-level state for the MCP server
let mcpServer: McpServer | null = null;
let httpServer: http.Server | null = null;
let transports: Map<string, StreamableHTTPServerTransport> = new Map();
let semanticSearch: SemanticSearch | null = null;
let fileWatcherDisposable: vscode.Disposable | null = null;
let serverDisposable: vscode.Disposable | null = null;
let extensionContext: vscode.ExtensionContext | null = null;
let verbose: boolean = false;

const log = (msg: string, ...args: any[]) => {
    if (verbose) {
        console.log(`[MCP] ${msg}`, ...args);
    }
};

export function isMcpServerRunning(): boolean {
    return mcpServer !== null && httpServer !== null;
}

export async function startMcpServer(context: vscode.ExtensionContext) {
    const config = loadMcpConfig();
    if (!config || !config.startMcpServer) {
        console.log("MCP Server disabled in config");
        return;
    }

    await startMcpServerManual(context);
}

export async function startMcpServerManual(context: vscode.ExtensionContext) {
    if (isMcpServerRunning()) {
        vscode.window.showWarningMessage("MCP Server is already running");
        return;
    }

    extensionContext = context;
    const config = loadMcpConfig();
    if (!config) {
        vscode.window.showErrorMessage("Failed to load MCP config");
        return;
    }

    verbose = config.verbose ?? false;

    log("Starting MCP Server...");

    mcpServer = new McpServer({
        name: "zma-notes",
        version: "1.0.0"
    }, {
        instructions: `You are an intelligent assistant for a note-taking system.
Your goal is to help users find, understand, and synthesize information from their notes.

**Note Structure & Syntax:**
- **Format**: Notes are written in Markdown.
- **Links**: Internal links are denoted by \`[[Note Name]]\`. External links use standard Markdown \`[Text](URL)\`.
- **Tags**: Tags are used for categorization, appearing as \`#tag\` inline or \`tags:: tag1, tag2\` in metadata headers.
- **Tasks**:
  - \`TODO\`: \`- [ ] Task description\`
  - \`DOING\`: \`- [/] Task description\`
  - \`DONE\`: \`- [x] Task description\`

**Tools & Workflow:**
1.  **Searching**:
    - Use \`semantic_search\` for natural language queries to find relevant contexts and concepts. This is preferred for understanding intent.
    - Use \`search_notes\` for exact keyword matching or finding specific tags/titles.
2.  **Reading**:
    - Once you identify relevant notes (via search), use \`read_note\` to retrieve their full content, including tasks, links, and metadata.
    - Always read the full note content before answering specific questions about it to ensure accuracy.
3.  **Tasks**:
    - Use \`get_tasks\` to list or filter tasks by status. This is useful for project management queries.

**Response Guidelines:**
- When citing information, reference the source note name (e.g., 'According to [[Project Alpha]]...').
- If a search yields multiple relevant notes, synthesize the information across them.
- If you cannot find information, suggest related topics based on the search results.`,
    });

    const embeddingConfig = loadEmbeddingConfig();
    if (embeddingConfig) {
        log("Initializing Semantic Search...");
        semanticSearch = new SemanticSearch(embeddingConfig);
        void semanticSearch.generateEmbeddings();
    }

    mcpServer.registerResource(
        "note",
        new ResourceTemplate("note://{name}", { list: undefined }),
        {
            mimeType: "text/markdown"
        },
        async (uri, { name }) => {
            log(`Resource requested: note://${name}`);
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

    // Cast the schema object to any to avoid "excessively deep type instantiation" errors
    // caused by mismatched Zod versions or complex type inference in the MCP SDK.
    mcpServer.registerTool(
        "search_notes",
        {
            description: "Search for notes by content, title, or tags",
            inputSchema: {
                query: z.string()
            } as any
        },
        async (args: any) => {
            const { query } = args;
            log(`Tool called: search_notes with query "${query}"`);
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
        mcpServer.registerTool(
            "semantic_search",
            {
                description: "Search for notes using semantic embeddings based on link contexts. Results are ordered by relevance.",
                inputSchema: {
                    query: z.string(),
                    limit: z.number().optional(),
                    offset: z.number().optional()
                } as any
            },
            async (args: any) => {
                const { query, limit, offset } = args;
                log(`Tool called: semantic_search with query "${query}"`);
                if (!semanticSearch) return { content: [{ type: "text", text: "Semantic search not configured" }] };
                const results = await semanticSearch.search(query, limit || 50, offset || 0);

                // Simplify results as requested: only context and source
                const simplified = results.map(r => ({
                    context: r.context,
                    source: r.sourceLink
                }));

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(simplified, null, 2)
                    }]
                };
            }
        );
    }

    mcpServer.registerTool(
        "read_note",
        {
            description: "Read the content of a note by its name (link name)",
            inputSchema: {
                name: z.string()
            } as any
        },
        async (args: any) => {
            const { name } = args;
            log(`Tool called: read_note for "${name}"`);
            if (!isIndexReady()) {
                return { content: [{ type: "text", text: "Index not ready" }] };
            }
            const index = sharedIndex2();
            const file = index.allFiles().find(f => f.link.linkName() === name);
            if (!file) {
                return { isError: true, content: [{ type: "text", text: `Note not found: ${name}` }] };
            }

            const noteData = {
                name: file.link.linkName(),
                content: file.content,
                tags: file.tags,
                aliases: file.aliases,
                tasks: file.tasks.map(t => {
                    const td = getTaskData(t.id);
                    return {
                        state: t.state,
                        title: t.taskWithoutState,
                        priority: t.prio(),
                        snoozeUntil: td.snoozeUntil,
                        createdAt: td.createdAt,
                        doneAt: td.doneAt
                    };
                })
            };

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(noteData, null, 2)
                }]
            };
        }
    );

    mcpServer.registerTool(
        "get_tasks",
        {
            description: "Get tasks, optionally filtered by status (TODO, DOING, DONE)",
            inputSchema: {
                status: z.enum(["TODO", "DOING", "DONE"]).optional()
            } as any
        },
        async (args: any) => {
            const { status } = args;
            log(`Tool called: get_tasks with status "${status}"`);
            if (!isIndexReady()) {
                return { content: [{ type: "text", text: "Index not ready" }] };
            }
            const index = sharedIndex2();
            let tasks = index.allFiles().flatMap(f => f.tasks);

            if (status) {
                tasks = tasks.filter(t => t.state === status);
            }

            const result = tasks.map(t => {
                const td = getTaskData(t.id);
                return {
                    id: t.id,
                    title: t.taskWithoutState,
                    state: t.state,
                    priority: t.prio(),
                    sourceNote: t.location.link.linkName(),
                    createdAt: td.createdAt,
                    doneAt: t.state === TaskState.Done ? td.doneAt : undefined,
                    snoozeUntil: td.snoozeUntil
                };
            });

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    httpServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        log(`Incoming request: ${req.method} ${url.pathname}`);

        if (url.pathname === "/sse" || url.pathname === "/messages" || url.pathname === "/mcp") {
            // Get or create transport for this session
            const sessionId = req.headers['mcp-session-id'] as string | undefined;

            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports.has(sessionId)) {
                // Reuse existing transport for this session
                transport = transports.get(sessionId)!;
                log(`Reusing transport for session: ${sessionId}`);
            } else {
                // Create new transport for new session
                const newSessionId = crypto.randomUUID();
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => newSessionId,
                    enableJsonResponse: true
                });

                // Connect the transport to the MCP server
                await mcpServer!.connect(transport);

                transports.set(newSessionId, transport);
                log(`Created new transport for session: ${newSessionId} (total sessions: ${transports.size})`);
            }

            await transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    const port = config.port || 42461;

    httpServer.listen(port, () => {
        console.log(`MCP Server running on port ${port}`);
        log(`MCP Server listening on port ${port}`);
        vscode.window.showInformationMessage(`MCP Server started on port ${port}`);
    });

    serverDisposable = {
        dispose: () => {
            log("Stopping MCP Server...");
            if (httpServer) {
                httpServer.close();
            }
            // Close all transports
            for (const [sessionId, transport] of transports.entries()) {
                log(`Closing transport for session: ${sessionId}`);
                transport.close();
            }
            transports.clear();
        }
    };

    context.subscriptions.push(serverDisposable);

    if (semanticSearch) {
        fileWatcherDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId === 'markdown' || document.fileName.endsWith('.md')) {
                log(`Updating semantic search for file: ${document.fileName}`);
                await semanticSearch!.updateForFile(document.fileName, document.getText());
            }
        });
        context.subscriptions.push(fileWatcherDisposable);
    }

    log("MCP Server started successfully");
}

export async function stopMcpServer() {
    if (!isMcpServerRunning()) {
        vscode.window.showWarningMessage("MCP Server is not running");
        return;
    }

    log("Stopping MCP Server...");

    // Stop semantic search embedding generation
    if (semanticSearch) {
        log("Stopping semantic search...");
        semanticSearch.stopGeneration();
        semanticSearch = null;
    }

    // Dispose file watcher
    if (fileWatcherDisposable) {
        fileWatcherDisposable.dispose();
        fileWatcherDisposable = null;
    }

    // Close HTTP server
    if (httpServer) {
        httpServer.close(() => {
            log("HTTP Server closed");
        });
        httpServer = null;
    }

    // Close all transports
    log(`Closing ${transports.size} transport(s)...`);
    for (const [sessionId, transport] of transports.entries()) {
        log(`Closing transport for session: ${sessionId}`);
        transport.close();
    }
    transports.clear();

    // Clear server instance
    mcpServer = null;

    // Remove from extension subscriptions if possible
    if (serverDisposable && extensionContext) {
        const index = extensionContext.subscriptions.indexOf(serverDisposable);
        if (index > -1) {
            extensionContext.subscriptions.splice(index, 1);
        }
        serverDisposable = null;
    }

    console.log("MCP Server stopped");
    vscode.window.showInformationMessage("MCP Server stopped");
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
            port: 42461,
            verbose: false
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
