import * as vscode from 'vscode';
import { sharedIndex2 } from './Index2';
import { Link } from './Link';
import { RegexPatterns } from './RegexPatterns';

export function activateRenameProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(
            { language: 'markdown', scheme: 'file' },
            new ZmaRenameProvider()
        )
    );
}

class ZmaRenameProvider implements vscode.RenameProvider {
    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | null> {
        const range = document.getWordRangeAtPosition(position, RegexPatterns.RE_LINKS());
        if (!range) {
            return null;
        }

        const oldText = document.getText(range);
        // Extract the link content from [[...]]
        const oldLinkName = oldText.replace(/^\[\[/, '').replace(/\]\]$/, '');

        // Check if newName contains invalid characters or if it's just 'newName' (user didn't change it)
        if (newName === oldLinkName) {
            return null;
        }

        const edit = new vscode.WorkspaceEdit();
        const locations = sharedIndex2().linkLocations().filter(ll => ll.link.linkName() === oldLinkName);

        // 1. Rename all references
        for (const loc of locations) {
            const uri = vscode.Uri.file(loc.location.link.filePath());
            const range = new vscode.Range(
                new vscode.Position(loc.location.row, loc.location.column),
                new vscode.Position(loc.location.row, loc.location.column + oldText.length)
            );

            // Preserve original brackets, just replace the name
            // If the original was [[oldName]], replace with [[newName]]
            edit.replace(uri, range, `[[${newName}]]`);
        }

        // 2. Rename the file if it exists
        const oldLinkObj = Link.fromRawLink(oldLinkName);
        if (oldLinkObj.fileExists()) {
            const oldFilePath = oldLinkObj.filePath();
            const newLinkObj = Link.fromRawLink(newName);
            const newFilePath = newLinkObj.filePath();

            edit.renameFile(
                vscode.Uri.file(oldFilePath),
                vscode.Uri.file(newFilePath),
                { overwrite: false }
            );
        }

        return edit;
    }
    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Range | { range: vscode.Range, placeholder: string }> {
        const range = document.getWordRangeAtPosition(position, RegexPatterns.RE_LINKS());
        if (!range) {
            throw new Error('Cannot rename this element');
        }

        const oldText = document.getText(range);

        const innerRange = new vscode.Range(
            range.start.translate(0, 2),
            range.end.translate(0, -2)
        );
        const innerText = oldText.replace(/^\[\[/, '').replace(/\]\]$/, '');

        return { range: innerRange, placeholder: innerText };
    }
}
