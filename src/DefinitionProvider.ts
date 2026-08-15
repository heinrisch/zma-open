import * as vscode from 'vscode';
import { DocumentSelector, ExtensionContext, Uri, languages } from 'vscode';
import { bestAlias } from './Alias';
import { createFileIfNotExists } from './QuickOpenLink';
import { processMdFile, sharedIndex2 } from './Index2';
import { Link } from './Link';
import { findLinkAtCursor, LinkType } from './LinkLocation';

const Document_Selector_Markdown: DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'untitled' },
];

export function activateDefinitionProvider(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDefinitionProvider(Document_Selector_Markdown, new MarkdownDefinitionProvider())
  );
}

class MarkdownDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(document: vscode.TextDocument, position: vscode.Position): Thenable<vscode.Location> {
    return new Promise<vscode.Location>((resolve, reject) => {
      // Parse the current document the same way the index does, so
      // [[links]], @[persons] and [hrefs](url) are all recognized.
      const text = document.getText();
      const zmaFile = processMdFile(text, document.uri.path);

      const atCursor = findLinkAtCursor(zmaFile.linkLocations, document, position,
        [LinkType.LINK, LinkType.PERSON, LinkType.HREF]);

      if (!atCursor) {
        reject();
        return;
      }

      let rawLink = atCursor.link.linkName();
      rawLink = bestAlias(rawLink);

      const hasLink = sharedIndex2().allLinksRaw().has(rawLink);

      if (!hasLink) {
        reject();
        return;
      }

      const filePath = Link.fromRawLink(rawLink).filePath();
      createFileIfNotExists(Uri.file(filePath))
        .then(() => {
          const location = new vscode.Location(Uri.file(filePath), new vscode.Position(0, 0));
          resolve(location);
        })
        .catch(() => {
          reject();
        });
    });
  }
}
