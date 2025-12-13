
import * as vscode from 'vscode';
import { sharedLinkShortener } from './HrefShortener';

export function activateShortLinkProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(
            { language: 'markdown' },
            new ShortLinkProvider()
        )
    );
}

class ShortLinkProvider implements vscode.DocumentLinkProvider {
    public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
        const links: vscode.DocumentLink[] = [];
        const text = document.getText();
        const regex = /\]\((&[a-zA-Z0-9]+)\)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const short = match[1]; // includes &

            // Skip ](&...) pattern check inside the shortener, pass raw short string
            const fullUrl = sharedLinkShortener().getHref(short);

            if (fullUrl) {
                // Format: [Title](&shortCode)
                // match.index points to ']'
                // ] ( & . . . )
                // 0 1 2 3
                // We want the range to be the short code part: &shortCode

                const startOffset = match.index + 2; // skip ']('
                const endOffset = startOffset + short.length;

                const startPos = document.positionAt(startOffset);
                const endPos = document.positionAt(endOffset);
                const range = new vscode.Range(startPos, endPos);

                const link = new vscode.DocumentLink(range, vscode.Uri.parse(fullUrl));
                link.tooltip = fullUrl;
                links.push(link);
            }
        }
        return links;
    }
}
