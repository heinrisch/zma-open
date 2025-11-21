# ZMA MCP Notes Server

A read-only Model Context Protocol (MCP) server that provides access to your ZMA notes through HTTP Server-Sent Events (SSE).

## Features

- **HTTP SSE Transport**: Runs on port 3356 with SSE for real-time communication
- **Read-Only Access**: Safe, non-destructive access to your notes
- **Search Functionality**: Full-text search across all notes
- **Tag Management**: List and search notes by tags
- **Backlink Analysis**: Find all notes linking to a specific note
- **Auto-Start**: Launches automatically when the extension activates

## Available Tools

### `search_notes`
Search for notes by query string.

**Parameters:**
- `query` (string): Search query string

**Returns:**
- List of matching notes with link, file path, preview, and tags

### `get_note`
Get the full content of a specific note.

**Parameters:**
- `link` (string): The link name of the note (without brackets)

**Returns:**
- Full note content, link, file path, tags, and aliases

### `get_backlinks`
Get all notes that link to a specific note.

**Parameters:**
- `link` (string): The link name to find backlinks for

**Returns:**
- List of backlinks with source note, type, and location

### `list_tags`
List all unique tags used across all notes.

**Returns:**
- Arrays of file tags and hashtags

### `search_by_tag`
Find all notes that have a specific tag.

**Parameters:**
- `tag` (string): The tag to search for (without #)

**Returns:**
- List of notes with the specified tag

## Connection Details

- **Protocol**: HTTP with Server-Sent Events
- **Port**: 3356
- **SSE Endpoint**: `http://localhost:3356/sse`
- **Message Endpoint**: `http://localhost:3356/message`

## Configuration Example

To use this MCP server with a client, configure it as follows:

```json
{
  "mcpServers": {
    "zma-notes": {
      "url": "http://localhost:3356/sse",
      "transport": "sse"
    }
  }
}
```

## Architecture

- Uses `@modelcontextprotocol/sdk` for MCP protocol implementation
- HTTP server with SSE for bi-directional communication
- Integrates with existing ZMA Index2 for data access
- Starts automatically when extension activates
- Gracefully handles port conflicts (if already running)

## Development

The server is implemented in `src/mcp/McpNotesServer.ts` and integrates with the extension lifecycle in `src/extension.ts`.
