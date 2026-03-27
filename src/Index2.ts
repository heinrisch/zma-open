import * as path from 'path';
import * as vscode from 'vscode';
import { AutocompleteItem, buildAutocompleteItems } from './Autocomplete';
import { Link } from './Link';
import { LinkLocation, LinkType } from './LinkLocation';
import { RegexPatterns } from './RegexPatterns';
import { Stopwatch } from './Stopwatch';
import { findAndCreateTasks, Task, TaskState } from './Tasks';
import { escapeRegExp } from './Util';
import { readLastEditIndexFromFile } from './LastEditHandler';
import { readTagIndexFromFile, getTagsForLink, removeTagsForLink } from './TagHandler';
import {  sharedLinkShortener } from './HrefShortener';

export class ZmaFile {
  constructor(
    public link: Link,
    public content: string,
    public linkLocations: LinkLocation[] = [],
    public aliases: [string, string][] = [],
    public tasks: Task[] = [],
    public tags: string[] = []
  ) {
  }
}

export class Index2 {
  public isCompleted: boolean = false;
  private files: Map<string, ZmaFile> = new Map();
  private cache = new Map<string, any>();

  private cached<T>(key: string, compute: () => T): T {
    if (!this.cache.has(key)) {
      this.cache.set(key, compute());
    }
    return this.cache.get(key) as T;
  }

  public addFile(zmaFile: ZmaFile) {
    this.files.set(zmaFile.link.linkName(), zmaFile);
    this.clearCache();
  }

  public allFiles(): ZmaFile[] {
    return Array.from(this.files.values());
  }

  public linkLocations(): LinkLocation[] {
    return this.cached('linkLocations', () =>
      this.allFiles().flatMap(file => file.linkLocations)
    );
  }

  public fileForFilePath(filePath: string): ZmaFile | null {
    return this.allFiles().find(f => f.link.filePath() === filePath) || null;
  }

  public allLinksRaw(): Set<string> {
    return this.cached('allLinksRaw', () => {
      const all = new Set<string>();
      this.files.forEach(f => all.add(f.link.linkName()));
      this.linkLocations().filter(ll => ll.type !== LinkType.HEADING).forEach(ll => all.add(ll.link.linkName()));
      return all;
    });
  }

  public allLink(): Link[] {
    return this.cached('allLinks', () =>
      Array.from(this.allLinksRaw()).map(raw => Link.fromRawLink(raw))
    );
  }

  public alias(word: string): string[] {
    const alias = this.allFiles().flatMap(f => {
      const matches = f.aliases.filter(a => a[0] === word || a[1] === word);
      return matches.flatMap(a => [a[0], a[1]]);
    });

    alias.push(word);

    return Array.from(new Set(alias));
  }

  public autoCompleteItems(): AutocompleteItem[] {
    return this.cached('autoCompleteItems', () => buildAutocompleteItems(this));
  }

  public linkRawOccurances(linkRaw: string): number {
    return this.cached('linkRawOccurances', () => {
      const map = new Map<string, number>();
      this.linkLocations().forEach(ll => {
        const linkRaw = ll.link.linkName();
        map.set(linkRaw, (map.get(linkRaw) || 0) + 1);
      });
      return map;
    }).get(linkRaw) || 0;
  }

  public linkScoringOccurances(): number {
    return this.cached('linkScoringOccurances', () => {
      let allOccurancesSorted = Array.from(this.cached<Map<string, number>>('linkRawOccurances', () => new Map()).values()).sort((a, b) => b - a);
      allOccurancesSorted = allOccurancesSorted.slice(0, Math.floor(allOccurancesSorted.length / 10)); // Top 10%
      return allOccurancesSorted.reduce((a, b) => a + b, 0) / allOccurancesSorted.length;
    });
  }

  public allActiveTasks(): Task[] {
    return this.cached('allActiveTasks', () =>
      this.allFiles().flatMap(f => f.tasks.filter(t => t.state !== TaskState.Done))
    );
  }

  public urlsForLinkRaw(linkRaw: string): string[] {
    return this.cached('urlsForLinkRaw', () => {
      const map = new Map<string, string[]>();
      this.linkLocations().filter(ll => ll.url).forEach(ll => {
        const linkRaw = ll.link.linkName();
        const urls = map.get(linkRaw) || [];
        urls.push(ll.url!);
        map.set(linkRaw, urls);
      });
      return map;
    }).get(linkRaw) || [];
  }

  public clearCache() {
    this.cache.clear();
  }

  public findUnlinkedMentions(linkName: string): LinkLocation[] {
    const results: LinkLocation[] = [];
    const regex = new RegExp(`(?<!\\[)${escapeRegExp(linkName)}(?!\\])`, 'g');

    this.allFiles()
      .filter(file => file.content.includes(linkName))
      .forEach(file => {
        const matches = regexMatches(regex, file.content);
        matches.forEach(match => {
          results.push(LinkLocation.create(file.content, Link.fromRawLink(linkName), file.link, match.row, match.column, LinkType.LINK));
        });
      });

    return results;
  }

  public getStats() {
    const files = this.allFiles();
    const linkLocations = this.linkLocations();

    const totalFiles = files.length;
    const totalExplicitLinks = linkLocations.filter(ll => ll.type === LinkType.LINK).length;

    // Group explicit links by source file
    const fileLinkCountMap = new Map<string, number>();
    linkLocations.filter(ll => ll.type === LinkType.LINK).forEach(ll => {
      const name = ll.location.link.linkName();
      fileLinkCountMap.set(name, (fileLinkCountMap.get(name) || 0) + 1);
    });

    const topFilesByLinks = Array.from(fileLinkCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const memoryUsage = process.memoryUsage();

    return {
      totalFiles,
      totalExplicitLinks,
      topFilesByLinks,
      memory: {
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
        rss: (memoryUsage.rss / 1024 / 1024).toFixed(2)
      }
    };
  }
}

export function workspaceFolderPath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const workspaceFolder = workspaceFolders[0];

  return workspaceFolder.uri.fsPath;
}

export function pagesFolderPath(): string | undefined {
  const wsPath = workspaceFolderPath();
  if (!wsPath) {
    return undefined;
  }
  return path.join(wsPath, 'pages');
}


let globalIndex2: Index2 = new Index2();

export const isIndexReady = () => {
  return globalIndex2 !== null;
};

export const sharedIndex2 = () => {
  return globalIndex2!;
};

export async function reindex2() {
  const stopwatch = new Stopwatch('Reindex 2');

  await vscode.workspace.saveAll();

  const index = new Index2();

  const pagesFolderUri = vscode.Uri.file(pagesFolderPath()!);

  stopwatch.lap('Initialized');

  await traverseFolder(pagesFolderUri, index);
  stopwatch.lap('Traversed pages');

  readLastEditIndexFromFile();
  stopwatch.lap('Reindexed lastEdit');

  readTagIndexFromFile();
  stopwatch.lap('Reindexed tags');

  index.isCompleted = true;
  globalIndex2 = index;

  await addLinkAliasAndTagHeaders(index);

  stopwatch.lap('link:: and tags:: headers');

  const memoryUsage = process.memoryUsage();
  const heapUsage = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  console.log(`Reindex completed (${heapUsage} MB heap memory)`);

  stopwatch.stop();
  stopwatch.printResults();
}

async function traverseFolder(folderPath: vscode.Uri, index: Index2): Promise<void> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(folderPath);

    for (const [entryName, entryType] of entries) {
      const entryPath = vscode.Uri.joinPath(folderPath, entryName);

      if (entryType === vscode.FileType.File) {
        if (['.md', '.markdown'].includes(path.extname(entryName).toLowerCase())) {
          try {
            const fileBuffer = await vscode.workspace.fs.readFile(entryPath);
            const fileContent = new TextDecoder().decode(fileBuffer);

            const preprocessedContent = await preprocessMdFile(fileContent, entryPath.fsPath);
            const zmaFile = await processMdFile(preprocessedContent, entryPath.fsPath);
            index.addFile(zmaFile);
          } catch (fileReadError) {
            void vscode.window.showErrorMessage(`Error processing file ${entryName}: ${fileReadError}`);
          }
        }
      } else if (entryType === vscode.FileType.Directory) {
        await traverseFolder(entryPath, index);
      }
    }
  } catch (error) {
    void vscode.window.showErrorMessage(`Error traversing folder: ${error}`);
  }
}

async function preprocessMdFile(fileContent: string, filePath: string): Promise<string> {
  let editedFileContent = fileContent;

  editedFileContent = sharedLinkShortener().shortenContent(editedFileContent);

  if (editedFileContent !== fileContent) {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), new TextEncoder().encode(editedFileContent));
  }

  return editedFileContent;
}

export async function processMdFile(fileContent: string, filePath: string): Promise<ZmaFile> {
  const link = Link.fromFilePath(filePath);
  const zmaFile = new ZmaFile(link, fileContent);

  const linkMatches = regexMatches(RegexPatterns.RE_LINKS(), fileContent);
  linkMatches.forEach(match => {
    const rawLink = match.fullMatch.replace(/\[\[|\]\]/g, '').trim();
    const ll = LinkLocation.create(fileContent, Link.fromRawLink(rawLink), link, match.row, match.column, LinkType.LINK);
    zmaFile.linkLocations.push(ll);
  });

  const hrefMatches = regexMatches(RegexPatterns.RE_HREF(), fileContent);
  hrefMatches.forEach(match => {
    const [title, url] = match.groups;
    const rawLink = title.trim();

    const ll = LinkLocation.create(fileContent, Link.fromRawLink(rawLink), link, match.row, match.column, LinkType.HREF, url);
    zmaFile.linkLocations.push(ll);
  });

  const aliasMatches = regexMatches(RegexPatterns.RE_ALIAS(), fileContent);
  aliasMatches.forEach(match => {
    const [a, b] = match.groups.map(group => group.trim());
    zmaFile.aliases.push([a, b]);
  });

  const hashtagMatches = regexMatches(RegexPatterns.RE_HASHTAG(), fileContent);
  hashtagMatches.forEach(match => {
    const rawTag = match.groups[0];
    const tag = rawTag.replace(/#/g, '').replace(/_/g, ' ').trim();

    const ll = LinkLocation.create(
      fileContent,
      Link.fromRawLink(tag),
      link,
      match.row,
      match.column,
      LinkType.HASHTAG
    );
    zmaFile.linkLocations.push(ll);
  });

  const headingMatches = regexMatches(RegexPatterns.RE_HEADING(), fileContent);
  headingMatches.forEach(match => {
    const rawHeading = match.groups[0];

    const ll = LinkLocation.create(fileContent, Link.fromRawLink(rawHeading), link, match.row, match.column, LinkType.HEADING);
    zmaFile.linkLocations.push(ll);
  });

  const tagMatches = regexMatches(RegexPatterns.RE_TAGS(), fileContent);
  if (tagMatches.length > 0) {
    const tagsString = tagMatches[0].groups[0];
    zmaFile.tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  zmaFile.tasks = findAndCreateTasks(link, fileContent);

  return zmaFile;
}

async function addLinkAliasAndTagHeaders(index: Index2) {
  index.linkLocations().filter(ll => ll.type === LinkType.HREF && ll.url).filter(ll => ll.link.fileExists()).forEach(async ll => {
    const link = ll.link;
    const url = ll.url;
    const uri = vscode.Uri.file(ll.link.filePath());
    const content = await vscode.workspace.fs.readFile(uri);
    let contentString = content.toString();

    const linkHeader = `link:: [${link.linkName()}](${url})`;
    if (!contentString.includes(linkHeader)) {
      contentString = linkHeader + '\n' + contentString;
    }

    if (contentString !== content.toString()) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(contentString));
    }
  });

  for (const file of index.allFiles()) {
    const linkName = file.link.linkName();
    const tagsInFile = file.tags;

    const tagsFromIndex = getTagsForLink(linkName);

    if (tagsFromIndex.length > 0) {
      const uri = vscode.Uri.file(file.link.filePath());
      const content = await vscode.workspace.fs.readFile(uri);
      let contentString = content.toString();

      const allTags = Array.from(new Set([...tagsInFile, ...tagsFromIndex]));

      const tagsHeader = `tags:: ${allTags.join(', ')}`;

      const existingTagsMatch = contentString.match(RegexPatterns.RE_TAGS());

      if (existingTagsMatch) {
        contentString = contentString.replace(RegexPatterns.RE_TAGS(), tagsHeader);
      } else {
        contentString = tagsHeader + '\n' + contentString;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(contentString));

      removeTagsForLink(linkName, true);
    }
  }
}

export function regexMatches(regex: RegExp, fileContent: string): Array<{
  fullMatch: string;
  groups: string[];
  row: number;
  column: number;
}> {
  const matches: Array<{
    fullMatch: string;
    groups: string[];
    row: number;
    column: number;
  }> = [];

  let match;
  while ((match = regex.exec(fileContent)) !== null) {
    const fullMatch = match[0];
    const groups = match.slice(1);
    const linkLocation = match.index;
    const beforeMatch = fileContent.slice(0, linkLocation);
    const row = (beforeMatch.match(/\n/g) || []).length;
    const column = beforeMatch.slice(beforeMatch.lastIndexOf('\n') + 1).length;

    matches.push({
      fullMatch,
      groups,
      row,
      column
    });
  }

  return matches;
}