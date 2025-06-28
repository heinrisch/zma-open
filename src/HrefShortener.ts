import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { DocumentSelector, ExtensionContext, Uri, languages } from 'vscode';
import { RegexPatterns } from './RegexPatterns';

type ShortenedHref = {
  href: string;
  short: string;
};

let hrefInventory: ShortenedHref[] | null = null;

export const hrefToShort = (href: string): string | null => {
  if (!hrefInventory) {
    load();
  }
  return hrefInventory!.find((entry) => entry.href === href)?.short || null;
};

export const shortToHref = (short: string): string | null => {
  if (!hrefInventory) {
    load();
  }
  return hrefInventory!.find((entry) => entry.short === short)?.href || null;
};

function load() {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const hrefInventoryFilePath = path.join(folder || '', 'hrefInventory.txt');

  hrefInventory = [];
  let content = '';

  if (fs.existsSync(hrefInventoryFilePath)) {
    content = fs.readFileSync(hrefInventoryFilePath, 'utf-8');
  }
  const lines = content.split('\n');
  lines.forEach((line) => {
    const [short, href] = line.split('||');
    if (hrefInventory!.find((entry) => entry.short === short)) {
      const error = `Duplicate short ID: ${short}`;
      console.error(error);
      void vscode.window.showErrorMessage(error);
    }
    hrefInventory!.push({ href, short });
  });
}

export const addHrefToShortened = async (href: string) => {
  const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  const hrefInventoryFilePath = path.join(folder || '', 'hrefInventory.txt');

  const short = generateNewShortID();
  const content = `${short}||${href}\n`;

  try {
    fs.appendFileSync(hrefInventoryFilePath, content);
  } catch (err) {
    console.error(err);
  }

  load();
};

function generateNewShortID(): string {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charsetSize = charset.length;

  const idForIndex = (index: number) => {
    var shortID = '';
    while (index > 0) {
      shortID = charset[index % charsetSize] + shortID;
      index = Math.floor(index / charsetSize);
    }
    return shortID || '0';
  };

  load();

  let index = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const short = idForIndex(index);
    if (shortToHref(short) === null) {
      return short;
    }
    index++;
  }
}

const Document_Selector_Markdown: DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'untitled' },
];

export function activateLinkProvider(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDocumentLinkProvider(Document_Selector_Markdown, new ZmaDocumentLinkProvider())
  );
}

class ZmaDocumentLinkProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks(
    document: vscode.TextDocument
  ): Thenable<vscode.DocumentLink[]> {
    return new Promise<vscode.DocumentLink[]>((resolve) => {
      const links: vscode.DocumentLink[] = [];
      const text = document.getText();
      const linkPattern = RegexPatterns.RE_SHORTENED_HREF();
      let match;
      while ((match = linkPattern.exec(text))) {
        const short = match[1];
        const href = shortToHref(short);
        if (href) {
          const offset = match[0].lastIndexOf(short);
          const startPos = document.positionAt(match.index + offset);
          const endPos = document.positionAt(match.index + offset + short.length);
          const range = new vscode.Range(startPos, endPos);
          const documentLink = new vscode.DocumentLink(range, Uri.parse(href));
          documentLink.tooltip = href;
          links.push(documentLink);
        }
      }
      resolve(links);
    });
  }
}
