import * as path from 'path';
import * as vscode from 'vscode';
import { getLastEdit } from './LastEditHandler';
import { Link } from './Link';
import { sharedIndex2 } from './Index2';
import { Context, LinkLocation, LinkType } from './LinkLocation';

export class BacklinkProvider implements vscode.TreeDataProvider<BacklinkLink> {
  private _onDidChangeTreeData: vscode.EventEmitter<BacklinkLink | undefined | void> = new vscode.EventEmitter<
    BacklinkLink | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<BacklinkLink | undefined | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BacklinkLink): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BacklinkLink): Thenable<BacklinkLink[]> {
    const activeFile = vscode.window.activeTextEditor?.document.fileName;
    if (!activeFile) {
      return vscode.window.showInformationMessage('No active file').then(() => []);
    }

    let link = Link.fromFilePath(activeFile);

    if (element) {
      link = Link.fromRawLink(element.label);
    }

    const index = sharedIndex2();

    const aliases = index.alias(link.linkName());

    const graphChildren = aliases.flatMap(alias => index.linkLocations().filter(ll => ll.link.linkName() === alias));

    const children = [...graphChildren].map((ll: LinkLocation) => {
      if (ll.location.link.linkName() === link.linkName()) {
        return null;
      }

      return new BacklinkLink(
        ll.location.link.linkName(),
        ll.context,
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          title: 'Open File',
          command: 'zma.openfile',
          arguments: [
            vscode.Uri.file(ll.location.link.filePath()),
            ll.location.link.linkName(),
            ll.location.row,
            ll.location.column
          ]
        },
        ll.type !== LinkType.UNLINKED ? 'link.svg' : 'debug-disconnect.svg',
        vscode.Uri.file(ll.location.link.filePath())
      );
    }).filter((x) => x !== null) as BacklinkLink[];

    children.sort((a: BacklinkLink, b: BacklinkLink) => {
      const aLastEdit = getLastEdit(a.label);
      const bLastEdit = getLastEdit(b.label);
      return bLastEdit.getTime() - aLastEdit.getTime();
    });

    return Promise.resolve(children);
  }
}

export class BacklinkLink extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    private readonly context: Context,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly icon?: string,
    resourceUri?: vscode.Uri
  ) {
    super(label, collapsibleState);

    this.tooltip = new vscode.MarkdownString(this.context.fullContext);
    this.description = this.context.row.trim();
    this.resourceUri = resourceUri; 

    this.iconPath = {
      light: vscode.Uri.file(path.join(__filename, '..', '..', 'media', icon || 'link.svg')),
      dark: vscode.Uri.file(path.join(__filename, '..', '..', 'media', icon || 'link.svg'))
    };
  }

  contextValue = 'backlinklink';
}
