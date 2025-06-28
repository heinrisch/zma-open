import * as vscode from 'vscode';
import * as path from 'path';
import { Link } from './Link';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { sharedIndex2 } from './Index2';
import { LinkType } from './LinkLocation';

type Entry = [string, Date];
let fileEdited: Entry[] = [];
const lastEditIndexFile = 'lastEdit.txt';

const separator = ';,;';

const _cleanFileEdited = () => {
  fileEdited.sort((a: Entry, b: Entry) => {
    if (a[1] > b[1]) {
      return 1;
    } else if (a[1] < b[1]) {
      return -1;
    }
    return 0;
  });

  const visited = new Set<string>();

  fileEdited = fileEdited
    .reverse()
    .filter((entry) => {
      if (visited.has(entry[0])) {
        return false;
      }
      visited.add(entry[0]);
      return true;
    })
    .reverse();
};

export const remakeLastEditIndex = async () => {
  reindexLastEdit();

  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);
  fs.writeFileSync(lastEditFilePath, '');

  const allLinks = Array.from(sharedIndex2().allLinksRaw()).map((raw) => Link.fromRawLink(raw));

  const progressIncrease = (1 / allLinks.length) * 100;

  await vscode.window.withProgress(
    {
      cancellable: true,
      location: vscode.ProgressLocation.Notification,
      title: 'Indexing'
    },
    async (progress, token) => {
      for (const link of allLinks) {
        if (token.isCancellationRequested) {
          return;
        }
        await new Promise((r) => setTimeout(r, 2));
        progress.report({ message: link.linkName(), increment: progressIncrease });

        const filePath = link.filePath();
        const fileExists = fs.existsSync(filePath);

        const current = getLastEditedIndexed(link.linkName());
        if (fileExists) {
          const gitEdited = getLastMeaningfulEditDate(filePath);
          if (gitEdited && (!current || gitEdited.getTime() !== current.getTime()) && dateIsValid(gitEdited)) {
            fileEdited = fileEdited.filter(([a]) => a !== link.linkName());
            fileEdited.push([link.linkName(), gitEdited]);
            console.log(link, 'New date:', gitEdited, 'Old date:', current);
          }
        } else {
          const backLinkDate = dateFromBacklink(link.linkName());
          if (backLinkDate && (!current || backLinkDate.getTime() !== current.getTime()) && dateIsValid(backLinkDate)) {
            fileEdited = fileEdited.filter(([a]) => a !== link.linkName());
            fileEdited.push([link.linkName(), backLinkDate]);
            console.log(link, 'New date:', backLinkDate, 'Old date:', current);
          }
        }
      }
    }
  );

  writeLastEditToFile();
};

export const getLastEditedIndexed = (linkName: string): Date | undefined => {
  return fileEdited.find((e: Entry) => e[0] === linkName)?.[1];
};

export const onSavedFile = (document: vscode.TextDocument) => {
  if (path.extname(document.fileName) === '.md') {
    const filePath = document.fileName;
    const link = Link.fromFilePath(filePath);
    const linkName = link.linkName();

    addLastEditedToFile(linkName, new Date());

    fileEdited.push([linkName, new Date()]);
  }
};

const addLastEditedToFile = (linkName: string, date: Date) => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);
  const content = `${linkName}${separator}${date.toISOString()}\n`;

  fs.appendFileSync(lastEditFilePath, content);
};

const dateIsValid = (date: Date | null | undefined) => {
  if (date === null || date === undefined) {
    return false;
  }

  try {
    date.toISOString();
    return true;
  } catch {
    return false;
  }
};

const dateFromBacklink = (linkName: string): Date | undefined => {
  const ll = sharedIndex2().linkLocations().filter(ll => ll.link.linkName() === linkName);
  if (!ll) {
    return undefined;
  }

  const bl = ll.filter((v) => v.type !== LinkType.UNLINKED).map((v) => v.location.link.linkName());
  const blDates = bl
    .map((v) => getLastEditedIndexed(v))
    .filter((v) => v !== undefined && v !== null)
    .sort((a, b) => b!.getTime() - a!.getTime());

  if (blDates.length > 0) {
    return blDates[0];
  }

  return undefined;
};

export const getLastEdit = (linkName: string, updateWithNow: boolean = true): Date => {
  let stored: Date | undefined = getLastEditedIndexed(linkName);

  if (dateIsValid(stored)) {
    return stored!;
  }

  let newDate = false;

  const filePath = Link.fromRawLink(linkName).filePath();
  const fileExists = fs.existsSync(filePath);
  if (!dateIsValid(stored) && fileExists) {
    stored = getLastMeaningfulEditDate(filePath);
    newDate = true;
  }

  if (!dateIsValid(stored) && !fileExists) {
    stored = dateFromBacklink(linkName);
    newDate = true;
  }

  if (!dateIsValid(stored) && updateWithNow) {
    stored = new Date();
    newDate = true;
  }

  if (newDate) {
    addLastEditedToFile(linkName, stored!);
    fileEdited.push([linkName, stored!]);
  }
  return stored!;
};

function getLastMeaningfulEditDate(filePath: string): Date | undefined {
  try {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    const gitLogCommand = `git log -p -- "${filePath}"`;
    const logOutput = childProcess.execSync(gitLogCommand, { cwd: folder }).toString().trim();

    const commits = logOutput.split(/^commit\s/gm).filter(Boolean);

    for (const commit of commits) {
      const diff = commit.split('\n').slice(5).join('\n');
      const addedLines = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;

      if (addedLines > 3) {
        // Arbitrary threshold for "meaningful" change
        const dateMatch = commit.match(/Date:\s+(.+)/);
        if (dateMatch && dateMatch[1]) {
          return new Date(dateMatch[1]);
        }
      }
    }
    if (commits.length > 0) {
      const dateMatch = commits[0].match(/Date:\s+(.+)/);
      if (dateMatch && dateMatch[1]) {
        return new Date(dateMatch[1]);
      }
    }
    return undefined;
  } catch (error) {
    console.error('Error fetching git history:', error);
    return undefined;
  }
}

export const reindexLastEdit = () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);

  fileEdited = [];
  try {
    const content = fs.readFileSync(lastEditFilePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      const [linkName, dateStr] = line.split(separator);
      const date = new Date(dateStr);
      if (linkName && dateStr && !isNaN(date.getTime())) {
        fileEdited.push([linkName, date]);
      }
    });
  } catch (error) {
    console.error(error);
  }

  writeLastEditToFile();

  console.log('Read file index');
};

const writeLastEditToFile = () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);
  let content = '';

  _cleanFileEdited();

  fileEdited.forEach(([linkName, date]) => {
    content += `${linkName}${separator}${date.toISOString()}\n`;
  });

  fs.writeFileSync(lastEditFilePath, content);
};
