import * as vscode from 'vscode';
import { Disposable, QuickPickItem, Uri, window } from 'vscode';
import { shortToHref } from './HrefShortener';
import { getLastEdit } from './LastEditHandler';
import { Link } from './Link';
import { ScoringUtils } from './ScoringUtils';
import { sharedIndex2 } from './Index2';

class LinkItem implements QuickPickItem {
  label: string;
  link: Link;
  description: string;

  constructor(link: Link, href: string) {
    this.label = link.linkName();
    this.link = link;
    this.description = href;
  }
}

export async function quickOpenHref() {
  const uri = await pickHref();
  if (uri) {
    await vscode.env.openExternal(uri);
  }
}

async function pickHref() {
  const disposables: Disposable[] = [];

  const allLinkItem: LinkItem[] = Array.from(sharedIndex2().allLinksRaw())
    .map(linkRaw => {

      const link = Link.fromRawLink(linkRaw);
      const shortHrefs = sharedIndex2().linkLocations().filter(ll => ll.url && ll.link.linkName() === linkRaw).map(ll => ll.url!);
      if (!shortHrefs || shortHrefs.length === 0) {
        return null;
      }
      const href = shortToHref(shortHrefs[0]);
      if (!href) {
        return null;
      }
      return new LinkItem(link, href);
    })
    .filter((v) => v !== null)
    .map((v) => v!)
    .sort((a: LinkItem, b: LinkItem) => getLastEdit(b.label).getTime() - getLastEdit(a.label).getTime());

  const convertToSorted = (items: LinkItem[]): LinkItem[] => {
    return items.map((item, index) => {
      const sortPrefix = String(index + 1).padStart(2, '0') + ". ";
      const clonedItem = new LinkItem(item.link, item.description);
      clonedItem.label = sortPrefix + item.label;
      return clonedItem;
    });
  }


  try {
    return await new Promise<Uri | undefined>((resolve) => {
      const input = window.createQuickPick<LinkItem>();
      input.placeholder = 'Type to search for href';
      input.items = convertToSorted(allLinkItem.slice(0, 50));
      input.matchOnDescription = true;
      disposables.push(
        input.onDidChangeValue((value) => {
          let hrefScored: [LinkItem, number][] = allLinkItem.map((link) => {
            const score = ScoringUtils.scoreSearchInHref(value, link.link.linkName());
            let hrefMatchScore = 0;

            if (value.length > 7) {
              hrefMatchScore = link.description.includes(value) ? 100 : 0;
            }

            return [link, Math.max(score, hrefMatchScore)];
          });

          hrefScored = hrefScored.sort((a, b) => b[1] - a[1]).slice(0, 50);

          input.items = convertToSorted(hrefScored.map(([link]) => link));
        }),
        input.onDidChangeSelection(() => {
          const item = input.activeItems[0];
          if (item instanceof LinkItem) {
            resolve(Uri.parse(item.description));
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
