import * as vscode from 'vscode';
import { DocumentSelector, ExtensionContext, languages } from 'vscode';
import { RegexPatterns } from './RegexPatterns';

const Document_Selector_Markdown: DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'untitled' },
];

export function activateDocumentSymbolProvider(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider(Document_Selector_Markdown, new ZmaDocumentSymbolProvider())
  );
}

class ZmaDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
    const text = document.getText();

    const symbols: vscode.DocumentSymbol[] = [];

    const regex = RegexPatterns.RE_LINKS();
    let match;
    while ((match = regex.exec(text)) !== null) {
      const rawLink = match[1];
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const symbol = new vscode.DocumentSymbol(rawLink, rawLink, vscode.SymbolKind.Enum, new vscode.Range(startPos, endPos), new vscode.Range(startPos, endPos));
      symbols.push(symbol);
    } 

    return symbols;
  }
}
