import * as vscode from 'vscode';
import * as path from 'path';
import { Link } from './Link';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { sharedIndex2 } from './Index2';
import { LinkType } from './LinkLocation';

type Entry = [string, Date];
const lastEditIndexFile = 'lastEdit.txt';

const separator = ';,;';

const lastEditIndex = new Map<string, Date>();

const writeLastEditIndexToFile = () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);
  let content = '';

  const sortedEntries: Entry[] = Array.from(lastEditIndex.entries()).sort((a, b) => a[1].getTime() - b[1].getTime());
  sortedEntries.forEach(([linkName, date]) => {
    content += `${linkName}${separator}${date.toISOString()}\n`;
  });

  fs.writeFileSync(lastEditFilePath, content);
};

export const readLastEditIndexFromFile = () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);

  lastEditIndex.clear();

  try {
    const content = fs.readFileSync(lastEditFilePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      const [linkName, dateStr] = line.split(separator);
      const date = new Date(dateStr);
      if (linkName && dateStr && !isNaN(date.getTime())) {
        lastEditIndex.set(linkName, date);
      }
    });
  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage('Error reading last edit index file.');
  }
};

export const remakeLastEditIndex = async () => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const lastEditFilePath = path.join(folder || '', lastEditIndexFile);
  fs.writeFileSync(lastEditFilePath, '');

  const allLinks = Array.from(sharedIndex2().allLinksRaw()).map((raw) => Link.fromRawLink(raw));

  lastEditIndex.clear();

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

        lastEditIndex.set(
          link.linkName(),
          getLastEdit(link.linkName(), false, false)
        );
      }
    }
  );

  writeLastEditIndexToFile();
};

export const getLastEditedIndexed = (linkName: string): Date | undefined => {
  return lastEditIndex.get(linkName);
};

export const onSavedFile = (document: vscode.TextDocument) => {
  if (path.extname(document.fileName) === '.md') {
    const filePath = document.fileName;
    const link = Link.fromFilePath(filePath);
    const linkName = link.linkName();

    lastEditIndex.set(linkName, new Date());

    writeLastEditIndexToFile();
  }
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

export const findFirstDate = (start: string): Date | null => {
  const visited = new Set<string>();
  const queue: string[] = [start];
  visited.add(start);

  while (queue.length) {
    const levelSize = queue.length;
    let levelBest: Date | null = null;

    for (let i = 0; i < levelSize; i++) {
      const curr = queue.shift()!;

      const lls = sharedIndex2().linkLocations().filter(ll => ll.link.linkName() === curr);

      for (const ll of lls) {
        const d = ll.location.link.getDate();
        if (d && (!levelBest || d.getTime() > levelBest.getTime())) {
          levelBest = d;
        }
      }

      if (levelBest) return levelBest;

      for (const ll of lls) {
        const next = ll.location.link.linkName();
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return null;
};


export const getLastEdit = (linkName: string, writeToFile: boolean = true, useIndexed: boolean = true): Date => {
  let stored: Date | undefined = undefined;

  if (useIndexed) {
    stored = getLastEditedIndexed(linkName);
  }

  if (dateIsValid(stored)) {
    return stored!;
  }

  const link = Link.fromRawLink(linkName);

  if (link.isDate()) {
    stored = link.getDate() || undefined;
  } else {
    stored = findFirstDate(linkName) || undefined;
  }

  if (!dateIsValid(stored)) {
    console.log('No date found for', linkName, 'using old as last edited date.');
    stored = new Date();
    stored.setFullYear(stored.getFullYear() - 10);
  }

  lastEditIndex.set(linkName, stored!);
  if (writeToFile) {
    writeLastEditIndexToFile();
  }

  return stored!;
}
