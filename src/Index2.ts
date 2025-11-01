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

export async function reindex2() {
  console.log('Starting Reindex 2');
  const stopwatch = new Stopwatch('Reindex 2');

  await vscode.workspace.saveAll();

  const index = new Index2();

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    await vscode.window.showErrorMessage('No workspace selected');
    return;
  }

  if (workspaceFolders.length > 1) {
    await vscode.window.showErrorMessage('More than one workspace selected');
    return;
  }

  const workspaceFolder = workspaceFolders[0];

  index.workspaceFilePath = workspaceFolder.uri.fsPath;

  stopwatch.lap('Initialized');


  const folderPaths = (await vscode.workspace.fs.readDirectory(workspaceFolder.uri))
    .filter(([subfolder]) => ['pages'].includes(subfolder))
    .map(([subfolder]) => {
      const filePath = vscode.Uri.joinPath(workspaceFolder.uri, subfolder).fsPath;
      return {
        subfolder,
        filePath
      };
    });

  for (const { subfolder, filePath } of folderPaths) {
    if (subfolder === 'pages') {
      index.pagesFilePath = filePath;
    }
  }

  await traverseFolder(vscode.Uri.file(index.pagesFilePath!), index);
  stopwatch.lap('Traversed pages');

  readLastEditIndexFromFile();
  stopwatch.lap('Reindexed lastEdit');

  void vscode.commands.executeCommand('zma.refreshexplorers');

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

  addLinkAndAliasHeaders(index);

  stopwatch.lap('link:: headers');

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

  zmaFile.tasks = findAndCreateTasks(link, fileContent);

  return zmaFile;
}

function addLinkAndAliasHeaders(index: Index2) {
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