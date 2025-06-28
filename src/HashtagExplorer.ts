
import * as vscode from 'vscode';
import { getLastEdit } from './LastEditHandler';
import path = require('path');
import { sharedIndex2 } from './Index2';
import { LinkLocation, LinkType } from './LinkLocation';

export class HashTagProvider implements vscode.TreeDataProvider<HashTagLink | HashTagGroup> {
  private _onDidChangeTreeData: vscode.EventEmitter<HashTagLink | HashTagGroup | undefined | void> = new vscode.EventEmitter<
    HashTagLink | HashTagGroup | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<HashTagLink | HashTagGroup | undefined | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HashTagLink): vscode.TreeItem {
    return element;
  }

  allHashtagBacklinksSorted(): LinkLocation[] {
    return Object.values(sharedIndex2().linkLocations())
      .filter((ll: LinkLocation) => ll.type === LinkType.HASHTAG)
      .sort((a: LinkLocation, b: LinkLocation) => {
        const aLastEdit = getLastEdit(a.location.link.linkName());
        const bLastEdit = getLastEdit(b.location.link.linkName());
        return bLastEdit.getTime() - aLastEdit.getTime();
      });
  }

  createHashTagGroups(): Thenable<HashTagGroup[]> {
    const groups = this.allHashtagBacklinksSorted()
      .map((ll: LinkLocation) => ll.link.linkName());
    const uniqueGroups = groups.filter((value, index, self) => self.indexOf(value) === index);
    const namedGroups = uniqueGroups.map((group: string) => {
      return new HashTagGroup(group, '', 'link.svg');
    });
    return Promise.resolve(namedGroups);
  }

  getChildren(element?: HashTagLink): Thenable<HashTagLink[] | HashTagGroup[]> {
    if (element === null || element === undefined) {
      return this.createHashTagGroups();
    }

    if (!(element instanceof HashTagGroup)) {
      throw new Error('Invalid element type: ' + element);
    }

    const filter = (element as HashTagGroup).label;

    const children = this.allHashtagBacklinksSorted()
      .filter(ll => ll.link.linkName() === filter)
      .map((ll: LinkLocation) => {
        if (ll.type !== LinkType.HASHTAG) {
          return null;
        }

        return new HashTagLink(
          '#' + ll.link.linkName(),
          ll.context.row,
          vscode.TreeItemCollapsibleState.None,
          {
            title: 'Open File',
            command: 'zma.openfile',
            arguments: [
              vscode.Uri.file(ll.location.link.filePath()),
              ll.link.linkName(),
              ll.location.row,
              ll.location.column
            ]
          },
          'link.svg',
          vscode.Uri.file(ll.link.filePath())
        );
      })
      .filter((x) => x !== null) as HashTagLink[];

    return Promise.resolve(children.reverse());
  }
}

export class HashTagGroup extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly context: string,
    public readonly icon?: string,
    resourceUri?: vscode.Uri
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = this.context;
    this.resourceUri = resourceUri;

    this.iconPath = {
      light: vscode.Uri.file(path.join(__filename, '..', '..', 'media', icon || 'link.svg')),
      dark: vscode.Uri.file(path.join(__filename, '..', '..', 'media', icon || 'link.svg')),
    };
  }

  contextValue = 'HashTagGroup';
}

export class HashTagLink extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    private readonly context: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly icon?: string,
    resourceUri?: vscode.Uri
  ) {
    super(label, collapsibleState);

    this.tooltip = `${this.label}-${this.context}`;
    this.description = this.context;
    this.resourceUri = resourceUri;

    this.iconPath = {
      light: vscode.Uri.file(path.join(__filename, '..', '..', 'media', icon || 'link.svg')),
      dark: vscode.Uri.file(path.join(__filename, '..', '..', 'media', icon || 'link.svg')),
    };
  }

  contextValue = 'HashTaglink';
}
