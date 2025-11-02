#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Import existing ZMA modules
import { Index2, sharedIndex2, reindex2 } from './src/Index2.js';
import { Link } from './src/Link.js';
import { ScoringUtils } from './src/ScoringUtils.js';
import { getLastEdit } from './src/LastEditHandler.js';

/**
 * ZMA Notes MCP Server
 * 
 * This Model Context Protocol (MCP) server provides tools for interacting with ZMA notes.
 * ZMA is a VS Code extension for managing markdown-based notes with advanced linking,
 * task management, and organization features.
 * 
 * Notes Structure:
 * - Notes are stored as markdown files in a 'pages' directory
 * - Each note can contain:
 *   - [[Links]] to other notes (wiki-style linking)
 *   - #hashtags for categorization
 *   - Tasks with [ ] and [x] checkboxes
 *   - Aliases for alternative note names
 *   - Backlinks showing where the note is referenced
 * 
 * File Organization:
 * - All notes are stored in {workspace}/pages/ directory
 * - File names become note names (without .md extension)
 * - Links are resolved relative to the pages directory
 * - Last edit times are tracked in lastEdit.txt file
 * 
 * Search and Discovery:
 * - Fuzzy search matches partial text and scores by relevance
 * - Regex search supports pattern matching
 * - Scoring considers recency, frequency, and text match quality
 * - Notes are sorted by last edit time for recency
 */

const server = new Server(
  {
    name: 'zma-notes',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Schemas for tool parameters
const FetchNoteSchema = z.object({
  name: z.string().describe('The name of the note to fetch (without .md extension)'),
});

const SearchNotesSchema = z.object({
  query: z.string().describe('Search query for notes'),
  type: z.enum(['fuzzy', 'regex']).default('fuzzy').describe('Type of search: fuzzy for partial matching, regex for pattern matching'),
  limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return'),
});

const ListNotesSchema = z.object({
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of notes to return'),
  sortBy: z.enum(['lastEdited', 'name']).default('lastEdited').describe('Sort notes by last edited time or name'),
});

// Helper function to ensure index is available
function ensureIndex(): Index2 {
  try {
    return sharedIndex2();
  } catch (error) {
    throw new Error('ZMA index not available. Make sure the ZMA extension is running and workspace is indexed.');
  }
}

// Helper function to read file content
function readNoteContent(noteName: string): string {
  const link = Link.fromRawLink(noteName);
  const filePath = link.filePath();
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Note '${noteName}' not found`);
  }
  
  return fs.readFileSync(filePath, 'utf-8');
}

// Helper function for fuzzy search
function fuzzySearchNotes(query: string, limit: number): Array<{name: string, score: number, lastEdited: Date}> {
  const index = ensureIndex();
  const allLinks = index.allLink();
  
  const scoredResults = allLinks
    .map(link => ({
      name: link.linkName(),
      score: ScoringUtils.scoreSearchInLinks(query, link.linkName()),
      lastEdited: getLastEdit(link.linkName(), false)
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
    
  return scoredResults;
}

// Helper function for regex search
function regexSearchNotes(pattern: string, limit: number): Array<{name: string, matches: number, lastEdited: Date}> {
  const index = ensureIndex();
  const allFiles = index.allFiles();
  
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'gi');
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error.message}`);
  }
  
  const results = allFiles
    .map(file => {
      const matches = (file.content.match(regex) || []).length;
      return {
        name: file.link.linkName(),
        matches,
        lastEdited: getLastEdit(file.link.linkName(), false)
      };
    })
    .filter(result => result.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .slice(0, limit);
    
  return results;
}

// Register tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'fetch_note',
        description: 'Fetch the content of a specific note by name',
        inputSchema: FetchNoteSchema,
      },
      {
        name: 'search_notes',
        description: 'Search notes using fuzzy matching or regex patterns',
        inputSchema: SearchNotesSchema,
      },
      {
        name: 'list_notes',
        description: 'List notes sorted by last edited time or name',
        inputSchema: ListNotesSchema,
      },
    ],
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'fetch_note': {
        const { name: noteName } = FetchNoteSchema.parse(args);
        const content = readNoteContent(noteName);
        const lastEdited = getLastEdit(noteName, false);
        
        return {
          content: [
            {
              type: 'text',
              text: `# ${noteName}\n\n**Last edited:** ${lastEdited.toISOString()}\n\n${content}`,
            },
          ],
        };
      }
      
      case 'search_notes': {
        const { query, type, limit } = SearchNotesSchema.parse(args);
        
        if (type === 'fuzzy') {
          const results = fuzzySearchNotes(query, limit);
          const resultText = results.length > 0 
            ? results.map(r => `- **${r.name}** (score: ${r.score.toFixed(2)}, last edited: ${r.lastEdited.toLocaleDateString()})`).join('\n')
            : 'No notes found matching the query.';
            
          return {
            content: [
              {
                type: 'text',
                text: `# Fuzzy Search Results for "${query}"\n\nFound ${results.length} notes:\n\n${resultText}`,
              },
            ],
          };
        } else {
          const results = regexSearchNotes(query, limit);
          const resultText = results.length > 0
            ? results.map(r => `- **${r.name}** (${r.matches} matches, last edited: ${r.lastEdited.toLocaleDateString()})`).join('\n')
            : 'No notes found matching the regex pattern.';
            
          return {
            content: [
              {
                type: 'text',
                text: `# Regex Search Results for "${query}"\n\nFound ${results.length} notes:\n\n${resultText}`,
              },
            ],
          };
        }
      }
      
      case 'list_notes': {
        const { limit, sortBy } = ListNotesSchema.parse(args);
        const index = ensureIndex();
        const allFiles = index.allFiles();
        
        let sortedFiles = [...allFiles];
        if (sortBy === 'lastEdited') {
          sortedFiles.sort((a, b) => {
            const aDate = getLastEdit(a.link.linkName(), false);
            const bDate = getLastEdit(b.link.linkName(), false);
            return bDate.getTime() - aDate.getTime();
          });
        } else {
          sortedFiles.sort((a, b) => a.link.linkName().localeCompare(b.link.linkName()));
        }
        
        const limitedFiles = sortedFiles.slice(0, limit);
        const resultText = limitedFiles
          .map(file => {
            const lastEdited = getLastEdit(file.link.linkName(), false);
            return `- **${file.link.linkName()}** (last edited: ${lastEdited.toLocaleDateString()})`;
          })
          .join('\n');
          
        return {
          content: [
            {
              type: 'text',
              text: `# Notes List (sorted by ${sortBy})\n\nShowing ${limitedFiles.length} of ${allFiles.length} notes:\n\n${resultText}`,
            },
          ],
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // This will keep the server running
  console.error('ZMA Notes MCP Server started');
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});