import * as vscode from 'vscode';
import * as path from 'path';
import { Link } from './Link';
import * as fs from 'fs';

type TagEntry = [string, string[]];
const tagIndexFile = 'tags.txt';

const separator = ';,;';

const tagIndex = new Map<string, string[]>();

const writeTagIndexToFile = () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const tagFilePath = path.join(folder || '', tagIndexFile);
  let content = '';

  const sortedEntries: TagEntry[] = Array.from(tagIndex.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sortedEntries.forEach(([linkName, tags]) => {
    if (tags.length > 0) {
      content += `${linkName}${separator}${tags.join(',')}\n`;
    }
  });

  fs.writeFileSync(tagFilePath, content);
};

export const readTagIndexFromFile = () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const tagFilePath = path.join(folder || '', tagIndexFile);

  tagIndex.clear();

  try {
    if (!fs.existsSync(tagFilePath)) {
      return;
    }

    const content = fs.readFileSync(tagFilePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      const parts = line.split(separator);
      if (parts.length === 2) {
        const linkName = parts[0];
        const tags = parts[1].split(',').filter(t => t.trim().length > 0);
        if (linkName && tags.length > 0) {
          tagIndex.set(linkName, tags);
        }
      }
    });
  } catch (error) {
    console.error('Error reading tag index file:', error);
  }
};

export const getTagsForLink = (linkName: string): string[] => {
  return tagIndex.get(linkName) || [];
};

export const setTagsForLink = (linkName: string, tags: string[], writeToFile: boolean = true): void => {
  if (tags.length > 0) {
    tagIndex.set(linkName, tags);
  } else {
    tagIndex.delete(linkName);
  }
  
  if (writeToFile) {
    writeTagIndexToFile();
  }
};

export const removeTagsForLink = (linkName: string, writeToFile: boolean = true): void => {
  tagIndex.delete(linkName);
  
  if (writeToFile) {
    writeTagIndexToFile();
  }
};

export const getAllTags = (): Set<string> => {
  const allTags = new Set<string>();
  tagIndex.forEach((tags) => {
    tags.forEach(tag => allTags.add(tag));
  });
  return allTags;
};

export const getLinksWithTag = (tag: string): string[] => {
  const links: string[] = [];
  tagIndex.forEach((tags, linkName) => {
    if (tags.includes(tag)) {
      links.push(linkName);
    }
  });
  return links;
};
