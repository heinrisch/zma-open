import * as vscode from 'vscode';
import { DocumentSelector, ExtensionContext, languages } from 'vscode';
import { processMdFile } from './Index2';
import { linkEndOffset, LinkType } from './LinkLocation';

const Document_Selector_Markdown: DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'untitled' },
];

const SYMBOL_TYPES = [LinkType.LINK, LinkType.PERSON, LinkType.HREF];

export function activateDocumentSymbolProvider(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider(Document_Selector_Markdown, new ZmaDocumentSymbolProvider())
  );
}

class ZmaDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
    // Parse the current document the same way the index does, so [[links]],
    // @[persons] and [hrefs](url) all appear in the outline.
    const text = document.getText();
    const zmaFile = processMdFile(text, document.uri.path);

    const symbols: vscode.DocumentSymbol[] = [];

    for (const ll of zmaFile.linkLocations) {
      if (!SYMBOL_TYPES.includes(ll.type)) { continue; }

      const start = document.offsetAt(new vscode.Position(ll.location.row, ll.location.column));
      const end = linkEndOffset(ll, text, start);

      const startPos = document.positionAt(start);
      const endPos = document.positionAt(end);

      const symbol = new vscode.DocumentSymbol(
        ll.link.linkName(),
        text.slice(start, end), // e.g. [[Name]], @[Name], [title](url)
        vscode.SymbolKind.Enum,
        new vscode.Range(startPos, endPos),
        new vscode.Range(startPos, endPos)
      );
      symbols.push(symbol);
    }

    return symbols.sort((a, b) => a.range.start.compareTo(b.range.start));
  }
}
