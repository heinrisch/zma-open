import * as path from 'path';
import { AutocompleteItem, buildAutocompleteItems } from './Autocomplete';
import { Link } from './Link';
import { LinkLocation, LinkType } from './LinkLocation';
import { RegexPatterns } from './RegexPatterns';
import { Stopwatch } from './Stopwatch';
import { findAndCreateTasks, Task, TaskState } from './Tasks';
import { escapeRegExp } from './Util';
import { readLastEditIndexFromFile } from './LastEditHandler';

// Abstraction layer for file system operations
export interface FileSystemAdapter {
  saveAll?(): Promise<void>;
  readDirectory(uri: string): Promise<[string, FileType][]>;
  readFile(uri: string): Promise<Uint8Array>;
  writeFile(uri: string, content: Uint8Array): Promise<void>;
  joinPath(base: string, ...paths: string[]): string;
  showErrorMessage?(message: string): Promise<void>;
  executeCommand?(command: string): Promise<void>;
}

export enum FileType {
  File = 1,
  Directory = 2
}

// Workspace abstraction
export interface WorkspaceAdapter {
  workspaceFolders?: { uri: { fsPath: string } }[];
  getWorkspacePath(): string | null;
}

class ZmaFile {
  constructor(
    public link: Link,
    public content: string,
    public linkLocations: LinkLocation[] = [],
    public aliases: [string, string][] = [],
    public tasks: Task[] = [],
    public embeddings: Map<LinkLocation, number[]> = new Map()
  ) {
  }
}

export class Index2 {
  public isCompleted: boolean = false;
  private files: Map<string, ZmaFile> = new Map();
  public workspaceFilePath: string = '';
  public pagesFilePath: string = '';

  private _allLinkLocations: Array<LinkLocation> | null = null;

  public addFile(zmaFile: ZmaFile) {
    this.files.set(zmaFile.link.linkName(), zmaFile);

    this.clearCache();
  }

  public allFiles(): ZmaFile[] {
    return Array.from(this.files.values());
  }

  public linkLocations(): LinkLocation[] {
    if (this._allLinkLocations === null) {
      this._allLinkLocations = this.allFiles().flatMap(file => {
        return file.linkLocations;
      });
    }

    return this._allLinkLocations;
  }

  public fileForFilePath(filePath: string): ZmaFile | null {
    return this.allFiles().find(f => f.link.filePath() === filePath) || null;
  }

  private _allLinksRaw: Set<string> | null = null;

  public allLinksRaw(): Set<string> {
    if (this._allLinksRaw === null) {
      const all = new Set<string>();
      this.files.forEach(f => all.add(f.link.linkName()));
      this.linkLocations().filter(ll => ll.type !== LinkType.HEADING).forEach(ll => all.add(ll.link.linkName()));

      this._allLinksRaw = all;
    }
    return this._allLinksRaw;
  }

  private _allLinks: Link[] | null = null;

  public allLink(): Link[] {
    if (this._allLinks === null) {
      this._allLinks = Array.from(this.allLinksRaw()).map(raw => Link.fromRawLink(raw));
    }
    return this._allLinks;
  }

  public alias(word: string): string[] {
    const alias = this.allFiles().flatMap(f => {
      const matches = f.aliases.filter(a => a[0] === word || a[1] === word);
      return matches.flatMap(a => [a[0], a[1]]);
    });

    alias.push(word);

    return Array.from(new Set(alias));
  }

  private _autoCompleteItems: AutocompleteItem[] | null = null;

  public autoCompleteItems(): AutocompleteItem[] {
    if (this._autoCompleteItems === null) {
      this._autoCompleteItems = buildAutocompleteItems(this);
    }
    return this._autoCompleteItems!;
  }

  private _linkRawOccurances: Map<string, number> | null = null;

  public linkRawOccurances(linkRaw: string): number {
    if (this._linkRawOccurances === null) {
      this._linkRawOccurances = new Map();
      this.linkLocations().forEach(ll => {
        const linkRaw = ll.link.linkName();
        const count = this._linkRawOccurances!.get(linkRaw) || 0;
        this._linkRawOccurances!.set(linkRaw, count + 1);
      });
    }
    return this._linkRawOccurances.get(linkRaw) || 0;
  }

  private _linkScoringOccurances: number | null = null;

  public linkScoringOccurances(): number {
    if (this._linkScoringOccurances === null) {
      let allOccurancesSorted = Array.from(this._linkRawOccurances!.values()).sort((a, b) => b - a);
      allOccurancesSorted.slice(0, Math.floor(allOccurancesSorted.length / 10)); // Top 10%
      this._linkScoringOccurances = allOccurancesSorted
        .reduce((a, b) => a + b, 0) / allOccurancesSorted.length;
    }
    return this._linkScoringOccurances!;
  }

  private _allActiveTasks: Task[] | null = null;
  
  public allActiveTasks(): Task[] {
    if (this._allActiveTasks === null) {
      this._allActiveTasks = this.allFiles().flatMap(f => f.tasks.filter(t => t.state !== TaskState.Done));
    }
    return this._allActiveTasks;
  }

  private _urlForLinkRaw: Map<string, string[]> | null = null;

  public urlsForLinkRaw(linkRaw: string): string[] {
    if (this._urlForLinkRaw === null) {
      this._urlForLinkRaw = new Map();
      this.linkLocations().filter(ll => ll.url).forEach(ll => {
        const linkRaw = ll.link.linkName();
        const urls = this._urlForLinkRaw!.get(linkRaw) || [];
        urls.push(ll.url!);
        this._urlForLinkRaw!.set(linkRaw, urls);
      });
    }
    return this._urlForLinkRaw.get(linkRaw) || [];
  }

  public clearCache() {
    this._allLinkLocations = null;
    this._allLinksRaw = null;
    this._allLinks = null;
    this._autoCompleteItems = null;
    this._linkRawOccurances = null;
    this._linkScoringOccurances = null;
    this._allActiveTasks = null;
    this._urlForLinkRaw = null;
  }

}

let globalIndex2: Index2 = new Index2();

export const isIndexReady = () => {
  return globalIndex2 !== null;
};

export const sharedIndex2 = () => {
  return globalIndex2!;
};

export async function reindex2(fs: FileSystemAdapter, workspace: WorkspaceAdapter) {
  console.log('Starting Reindex 2');
  const stopwatch = new Stopwatch('Reindex 2');

  if (fs.saveAll) {
    await fs.saveAll();
  }

  const index = new Index2();

  const workspacePath = workspace.getWorkspacePath();
  if (!workspacePath) {
    const errorMessage = 'No workspace selected';
    if (fs.showErrorMessage) {
      await fs.showErrorMessage(errorMessage);
    } else {
      console.error(errorMessage);
    }
    return;
  }

  index.workspaceFilePath = workspacePath;

  stopwatch.lap('Initialized');

  const folderPaths: { subfolder: string; filePath: string }[] = [];
  try {
    const entries = await fs.readDirectory(workspacePath);
    for (const [subfolder, fileType] of entries) {
      if (['pages'].includes(subfolder) && fileType === FileType.Directory) {
        const filePath = fs.joinPath(workspacePath, subfolder);
        folderPaths.push({ subfolder, filePath });
      }
    }
  } catch (error) {
    const errorMessage = `Error reading workspace directory: ${error}`;
    if (fs.showErrorMessage) {
      await fs.showErrorMessage(errorMessage);
    } else {
      console.error(errorMessage);
    }
    return;
  }

  for (const { subfolder, filePath } of folderPaths) {
    if (subfolder === 'pages') {
      index.pagesFilePath = filePath;
    }
  }

  if (!index.pagesFilePath) {
    const errorMessage = 'Pages folder not found';
    if (fs.showErrorMessage) {
      await fs.showErrorMessage(errorMessage);
    } else {
      console.error(errorMessage);
    }
    return;
  }

  await traverseFolder(index.pagesFilePath, index, fs, workspacePath);
  stopwatch.lap('Traversed pages');

  readLastEditIndexFromFile();
  stopwatch.lap('Reindexed lastEdit');

  if (fs.executeCommand) {
    await fs.executeCommand('zma.refreshexplorers');
  }

  index.isCompleted = true;
  globalIndex2 = index;

  index.allLinksRaw().forEach(lookForLinkRaw => {
    index.allFiles()
      .filter(file => file.content.includes(lookForLinkRaw))
      .forEach(file => {
        const regex = new RegExp(`(?<!\\[)${escapeRegExp(lookForLinkRaw)}(?!\\])`, 'g');

        const matches = regexMatches(regex, file.content);

        matches.forEach(match => {
          file.linkLocations.push(LinkLocation.create(file.content, Link.fromRawLink(lookForLinkRaw), file.link, match.row, match.column, LinkType.UNLINKED));
        });
      });
  });

  index.clearCache();

  stopwatch.lap('Added backlinks for unlinked links');

  await addLinkAndAliasHeaders(index, fs);

  stopwatch.lap('link:: headers');

  const memoryUsage = process.memoryUsage();
  const heapUsage = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  console.log(`Reindex completed (${heapUsage} MB heap memory)`);

  stopwatch.stop();
  stopwatch.printResults();
}

async function traverseFolder(folderPath: string, index: Index2, fs: FileSystemAdapter, workspacePath: string): Promise<void> {
  try {
    const entries = await fs.readDirectory(folderPath);

    for (const [entryName, entryType] of entries) {
      const entryPath = fs.joinPath(folderPath, entryName);

      if (entryType === FileType.File) {
        if (['.md', '.markdown'].includes(path.extname(entryName).toLowerCase())) {
          try {
            const fileBuffer = await fs.readFile(entryPath);
            const fileContent = new TextDecoder().decode(fileBuffer);

            const preprocessedContent = await preprocessMdFile(fileContent, entryPath, fs);
            const zmaFile = await processMdFile(preprocessedContent, entryPath, workspacePath);
            index.addFile(zmaFile);
          } catch (fileReadError) {
            const errorMessage = `Error processing file ${entryName}: ${fileReadError}`;
            if (fs.showErrorMessage) {
              await fs.showErrorMessage(errorMessage);
            } else {
              console.error(errorMessage);
            }
          }
        }
      } else if (entryType === FileType.Directory) {
        await traverseFolder(entryPath, index, fs, workspacePath);
      }
    }
  } catch (error) {
    const errorMessage = `Error traversing folder: ${error}`;
    if (fs.showErrorMessage) {
      await fs.showErrorMessage(errorMessage);
    } else {
      console.error(errorMessage);
    }
  }
}

async function preprocessMdFile(fileContent: string, filePath: string, fs: FileSystemAdapter): Promise<string> {
  let editedFileContent = fileContent;

  if (editedFileContent !== fileContent) {
    await fs.writeFile(filePath, new TextEncoder().encode(editedFileContent));
  }

  return editedFileContent;
}

export async function processMdFile(fileContent: string, filePath: string, workspacePath?: string): Promise<ZmaFile> {
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

  zmaFile.tasks = findAndCreateTasks(link, fileContent, workspacePath);

  return zmaFile;
}

async function addLinkAndAliasHeaders(index: Index2, fs: FileSystemAdapter) {
  const linkLocationsWithUrls = index.linkLocations().filter(ll => ll.type === LinkType.HREF && ll.url).filter(ll => ll.link.fileExists());
  
  for (const ll of linkLocationsWithUrls) {
    try {
      const link = ll.link;
      const url = ll.url;
      const filePath = ll.link.filePath();
      const content = await fs.readFile(filePath);
      let contentString = new TextDecoder().decode(content);

      const linkHeader = `link:: [${link.linkName()}](${url})`;
      if (!contentString.includes(linkHeader)) {
        contentString = linkHeader + '\n' + contentString;
      }

      if (contentString !== new TextDecoder().decode(content)) {
        await fs.writeFile(filePath, new TextEncoder().encode(contentString));
      }
    } catch (error) {
      const errorMessage = `Error adding link header: ${error}`;
      if (fs.showErrorMessage) {
        await fs.showErrorMessage(errorMessage);
      } else {
        console.error(errorMessage);
      }
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