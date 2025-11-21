import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';
import { sharedIndex2, isIndexReady } from '../Index2';
import { Link } from '../Link';
import { LinkType } from '../LinkLocation';
import * as vscode from 'vscode';

export class McpNotesServer {
  private server: Server;
  private httpServer: http.Server | null = null;
  private readonly port: number = 3356;

  constructor() {
    this.server = new Server(
      {
        name: 'zma-notes-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!isIndexReady()) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Index not ready' }),
            },
          ],
        };
      }

      try {
        switch (name) {
          case 'search_notes':
            return await this.handleSearchNotes(args as { query: string });
          case 'get_note':
            return await this.handleGetNote(args as { link: string });
          case 'get_backlinks':
            return await this.handleGetBacklinks(args as { link: string });
          case 'list_tags':
            return await this.handleListTags();
          case 'search_by_tag':
            return await this.handleSearchByTag(args as { tag: string });
          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                },
              ],
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }),
            },
          ],
        };
      }
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'search_notes',
        description: 'Search for notes by query string. Returns matching notes with their content.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query string',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_note',
        description: 'Get the full content of a specific note by its link name.',
        inputSchema: {
          type: 'object',
          properties: {
            link: {
              type: 'string',
              description: 'The link name of the note (without brackets)',
            },
          },
          required: ['link'],
        },
      },
      {
        name: 'get_backlinks',
        description: 'Get all notes that link to a specific note.',
        inputSchema: {
          type: 'object',
          properties: {
            link: {
              type: 'string',
              description: 'The link name to find backlinks for',
            },
          },
          required: ['link'],
        },
      },
      {
        name: 'list_tags',
        description: 'List all unique tags used across all notes.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_by_tag',
        description: 'Find all notes that have a specific tag.',
        inputSchema: {
          type: 'object',
          properties: {
            tag: {
              type: 'string',
              description: 'The tag to search for (without #)',
            },
          },
          required: ['tag'],
        },
      },
    ];
  }

  private async handleSearchNotes(args: { query: string }) {
    const index = sharedIndex2();
    const query = args.query.toLowerCase();

    const results = index.allFiles().filter((file) => {
      const linkName = file.link.linkName().toLowerCase();
      const content = file.content.toLowerCase();
      return linkName.includes(query) || content.includes(query);
    });

    const formattedResults = results.map((file) => ({
      link: file.link.linkName(),
      filePath: file.link.filePath(),
      preview: file.content.substring(0, 200),
      tags: file.tags,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query: args.query,
            count: formattedResults.length,
            results: formattedResults,
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetNote(args: { link: string }) {
    const index = sharedIndex2();
    const link = Link.fromRawLink(args.link);

    const file = index.allFiles().find((f) => f.link.linkName() === link.linkName());

    if (!file) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Note not found: ${args.link}` }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            link: file.link.linkName(),
            filePath: file.link.filePath(),
            content: file.content,
            tags: file.tags,
            aliases: file.aliases,
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetBacklinks(args: { link: string }) {
    const index = sharedIndex2();
    const targetLink = Link.fromRawLink(args.link);
    const targetLinkName = targetLink.linkName();

    const backlinks = index
      .linkLocations()
      .filter((ll) => ll.link.linkName() === targetLinkName)
      .map((ll) => ({
        from: ll.fromLink.linkName(),
        type: LinkType[ll.type],
        row: ll.row,
        column: ll.column,
        url: ll.url,
      }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            link: args.link,
            count: backlinks.length,
            backlinks,
          }, null, 2),
        },
      ],
    };
  }

  private async handleListTags() {
    const index = sharedIndex2();

    const allTags = new Set<string>();
    index.allFiles().forEach((file) => {
      file.tags.forEach((tag) => allTags.add(tag));
    });

    const hashtags = new Set<string>();
    index
      .linkLocations()
      .filter((ll) => ll.type === LinkType.HASHTAG)
      .forEach((ll) => hashtags.add(ll.link.linkName()));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            fileTags: Array.from(allTags).sort(),
            hashtags: Array.from(hashtags).sort(),
          }, null, 2),
        },
      ],
    };
  }

  private async handleSearchByTag(args: { tag: string }) {
    const index = sharedIndex2();
    const searchTag = args.tag.toLowerCase();

    const results = index.allFiles().filter((file) => {
      return file.tags.some((tag) => tag.toLowerCase() === searchTag);
    });

    const formattedResults = results.map((file) => ({
      link: file.link.linkName(),
      filePath: file.link.filePath(),
      tags: file.tags,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tag: args.tag,
            count: formattedResults.length,
            results: formattedResults,
          }, null, 2),
        },
      ],
    };
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        if (req.url === '/sse' && req.method === 'GET') {
          const transport = new SSEServerTransport('/message', res);
          await this.server.connect(transport);
          console.log(`[MCP] Client connected via SSE`);
        } else if (req.url === '/message' && req.method === 'POST') {
          // SSE message endpoint - handled by transport
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          });
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`[MCP] Port ${this.port} already in use, server likely already running`);
          resolve();
        } else {
          reject(error);
        }
      });

      this.httpServer.listen(this.port, () => {
        console.log(`[MCP] Notes server listening on http://localhost:${this.port}/sse`);
        vscode.window.showInformationMessage(
          `ZMA MCP server started on port ${this.port}`
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[MCP] Notes server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
