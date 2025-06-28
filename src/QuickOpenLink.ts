import * as vscode from 'vscode';
import { Disposable, QuickPickItem, Uri, window, workspace } from 'vscode';
import { bestAlias } from './Alias';
import { Link } from './Link';
import { ScoringUtils } from './ScoringUtils';
import { reindex2, sharedIndex2 } from './Index2';

export const createFileIfNotExists = async (uri: Uri) => {
  try {
    await vscode.workspace.fs.readFile(uri);
  } catch {
    await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    await reindex2();
  }
};

export async function quickOpenLink() {
  const rawLink = await quickPickRawLink(true);

  if (rawLink) {
    let link = Link.fromRawLink(rawLink);
    const bestRaw = bestAlias(rawLink);
    if (bestRaw !== link.linkName()) {
      link = Link.fromRawLink(bestRaw);
    }

    const uri = Uri.file(link.filePath());

    if (uri) {
      await createFileIfNotExists(uri);
      const document = await workspace.openTextDocument(uri);
      await window.showTextDocument(document);
    }
  }
}

class LinkItem implements QuickPickItem {
  label: string;
  link: Link;
  picked?: boolean | undefined;

  constructor(link: Link) {
    this.label = link.linkName();
    this.link = link;

    this.picked = false;
  }
}

export async function quickPickRawLink(onlyAutoSelect: boolean): Promise<string | undefined> {
  const disposables: Disposable[] = [];
  try {
    return await new Promise((resolve) => {
      const input = window.createQuickPick<LinkItem>();
      input.placeholder = 'Type to search for links';
      input.canSelectMany = false;
      (input as any).sortByLabel = false;
      disposables.push(
        input.onDidChangeValue((value) => {
          const allLinks = sharedIndex2().allLink();
          const linksScored: [Link, number][] = allLinks.map((link) => [link, ScoringUtils.scoreSearchInLinks(value, link.linkName())]);
          linksScored.sort((a, b) => b[1] - a[1]);
          let allItems = linksScored.slice(0, 10).map(([link]) => new LinkItem(link));
          if (!onlyAutoSelect && input.value && input.value !== '') {
            allItems.unshift(new LinkItem(Link.fromRawLink(input.value)));
          }
          input.items = allItems;
        }),
        input.onDidChangeSelection(() => {
          const search =
            input.selectedItems[0]?.link.linkName() || input.activeItems[0]?.link.linkName() || input.value;
          resolve(search);
          input.hide();
        }),
        input.onDidAccept(() => {
          if (!onlyAutoSelect && input.value && input.value !== '') {
            resolve(input.value);
            input.hide();
          }
        })
      );
      input.show();
    });
  } finally {
    disposables.forEach((d) => d.dispose());
  }
}
