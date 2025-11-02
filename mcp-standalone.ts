#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

/**
 * ZMA Notes MCP Server (Standalone Version)
 * 
 * This Model Context Protocol (MCP) server provides tools for interacting with ZMA notes
 * without requiring VSCode extension context.
 * 
 * Notes Structure:
 * - Notes are stored as markdown files in a 'pages' directory
 * - Each note can contain:
 *   - [[Links]] to other notes (wiki-style linking)
 *   - #hashtags for categorization
 *   - Tasks with [ ] and [x] checkboxes
 *   - Aliases for alternative note names
 *   - Backlinks showing where the note is referenced
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

// Configuration
const WORKSPACE_ROOT = process.env.ZMA_WORKSPACE_ROOT || process.cwd();
const PAGES_DIR = path.join(WORKSPACE_ROOT, 'pages');
const LAST_EDIT_FILE = path.join(WORKSPACE_ROOT, 'lastEdit.txt');

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

const CreateNoteSchema = z.object({
  name: z.string().describe('The name of the note to create (without .md extension)'),
  content: z.string().describe('The markdown content of the note'),
});

const UpdateNoteSchema = z.object({
  name: z.string().describe('The name of the note to update (without .md extension)'),
  content: z.string().describe('The new markdown content of the note'),
});

// Interfaces
interface NoteInfo {
  name: string;
  filePath: string;
  lastModified: Date;
  content?: string;
}

// Utility functions
function ensurePagesDirectory(): void {
  if (!fs.existsSync(PAGES_DIR)) {
    fs.mkdirSync(PAGES_DIR, { recursive: true });
  }
}

function getNotePath(noteName: string): string {
  return path.join(PAGES_DIR, `${noteName}.md`);
}

function getAllNotes(): NoteInfo[] {
  ensurePagesDirectory();
  const markdownFiles = glob.sync('*.md', { cwd: PAGES_DIR });
  
  return markdownFiles.map(file => {
    const filePath = path.join(PAGES_DIR, file);
    const stats = fs.statSync(filePath);
    const name = path.basename(file, '.md');
    
    return {
      name,
      filePath,
      lastModified: stats.mtime,
    };
  });
}

function readNoteContent(noteName: string): string {
  const filePath = getNotePath(noteName);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Note '${noteName}' not found`);
  }
  
  return fs.readFileSync(filePath, 'utf-8');
}

function writeNoteContent(noteName: string, content: string): void {
  ensurePagesDirectory();
  const filePath = getNotePath(noteName);
  fs.writeFileSync(filePath, content, 'utf-8');
  updateLastEdit(noteName);
}

function updateLastEdit(noteName: string): void {
  const timestamp = new Date().toISOString();
  const entry = `${noteName}:${timestamp}\n`;
  fs.appendFileSync(LAST_EDIT_FILE, entry, 'utf-8');
}

function getLastEditTimes(): Map<string, Date> {
  const lastEditMap = new Map<string, Date>();
  
  if (!fs.existsSync(LAST_EDIT_FILE)) {
    return lastEditMap;
  }
  
  const content = fs.readFileSync(LAST_EDIT_FILE, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const [name, timestamp] = line.split(':');
    if (name && timestamp) {
      lastEditMap.set(name, new Date(timestamp));
    }
  }
  
  return lastEditMap;
}

// Simple fuzzy matching function
function fuzzyScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  if (textLower.includes(queryLower)) {
    // Exact substring match gets high score
    const index = textLower.indexOf(queryLower);
    // Prefer matches at the beginning
    return 100 - index;
  }
  
  // Character-by-character fuzzy matching
  let score = 0;
  let queryIndex = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      score += 1;
      queryIndex++;
    }
  }
  
  // Return score only if all query characters were found
  return queryIndex === queryLower.length ? score : 0;
}

function fuzzySearchNotes(query: string, limit: number): Array<{name: string, score: number, lastEdited: Date}> {
  const notes = getAllNotes();
  const lastEditTimes = getLastEditTimes();
  
  const scoredResults = notes
    .map(note => ({
      name: note.name,
      score: fuzzyScore(query, note.name),
      lastEdited: lastEditTimes.get(note.name) || note.lastModified
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => {
      // Sort by score first, then by last edited
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.lastEdited.getTime() - a.lastEdited.getTime();
    })
    .slice(0, limit);
    
  return scoredResults;
}

function regexSearchNotes(pattern: string, limit: number): Array<{name: string, matches: number, lastEdited: Date}> {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'gi');
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error.message}`);
  }
  
  const notes = getAllNotes();
  const lastEditTimes = getLastEditTimes();
  
  const results = notes
    .map(note => {
      const content = fs.readFileSync(note.filePath, 'utf-8');
      const matches = (content.match(regex) || []).length;
      return {
        name: note.name,
        matches,
        lastEdited: lastEditTimes.get(note.name) || note.lastModified
      };
    })
    .filter(result => result.matches > 0)
    .sort((a, b) => {
      // Sort by matches first, then by last edited
      if (b.matches !== a.matches) {
        return b.matches - a.matches;
      }
      return b.lastEdited.getTime() - a.lastEdited.getTime();
    })
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
      {
        name: 'create_note',
        description: 'Create a new note with the given name and content',
        inputSchema: CreateNoteSchema,
      },
      {
        name: 'update_note',
        description: 'Update an existing note with new content',
        inputSchema: UpdateNoteSchema,
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
        const lastEditTimes = getLastEditTimes();
        const lastEdited = lastEditTimes.get(noteName) || new Date(fs.statSync(getNotePath(noteName)).mtime);
        
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
        const notes = getAllNotes();
        const lastEditTimes = getLastEditTimes();
        
        let sortedNotes = [...notes];
        if (sortBy === 'lastEdited') {
          sortedNotes.sort((a, b) => {
            const aDate = lastEditTimes.get(a.name) || a.lastModified;
            const bDate = lastEditTimes.get(b.name) || b.lastModified;
            return bDate.getTime() - aDate.getTime();
          });
        } else {
          sortedNotes.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        const limitedNotes = sortedNotes.slice(0, limit);
        const resultText = limitedNotes
          .map(note => {
            const lastEdited = lastEditTimes.get(note.name) || note.lastModified;
            return `- **${note.name}** (last edited: ${lastEdited.toLocaleDateString()})`;
          })
          .join('\n');
          
        return {
          content: [
            {
              type: 'text',
              text: `# Notes List (sorted by ${sortBy})\n\nShowing ${limitedNotes.length} of ${notes.length} notes:\n\n${resultText}`,
            },
          ],
        };
      }
      
      case 'create_note': {
        const { name: noteName, content } = CreateNoteSchema.parse(args);
        const filePath = getNotePath(noteName);
        
        if (fs.existsSync(filePath)) {
          throw new Error(`Note '${noteName}' already exists`);
        }
        
        writeNoteContent(noteName, content);
        
        return {
          content: [
            {
              type: 'text',
              text: `Successfully created note '${noteName}'`,
            },
          ],
        };
      }
      
      case 'update_note': {
        const { name: noteName, content } = UpdateNoteSchema.parse(args);
        const filePath = getNotePath(noteName);
        
        if (!fs.existsSync(filePath)) {
          throw new Error(`Note '${noteName}' not found`);
        }
        
        writeNoteContent(noteName, content);
        
        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated note '${noteName}'`,
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