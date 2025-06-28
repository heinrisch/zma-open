import * as vscode from 'vscode';
import { DocumentSelector, ExtensionContext, Uri, languages } from 'vscode';
import { bestAlias } from './Alias';
import { createFileIfNotExists } from './QuickOpenLink';
import { sharedIndex2 } from './Index2';
import { Link } from './Link';

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
      const wordPattern = /(\[{1,}[^\]]*\]{1,})/;
      const wordRange = document.getWordRangeAtPosition(position, wordPattern);
      if (!wordRange) {
        reject();
        return;
      }
      const word = document.getText(wordRange);
      let rawLink = word.replace(/\[+/, '').replace(/\]+/, '');
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
