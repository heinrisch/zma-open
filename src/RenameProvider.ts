import * as vscode from 'vscode';
import { processMdFile, sharedIndex2 } from './Index2';
import { Link } from './Link';
import { findLinkAtCursor, LinkType } from './LinkLocation';

const RENAME_TYPES = [LinkType.LINK, LinkType.PERSON, LinkType.HREF];

// Column offset of the name (inside the brackets) from the link's start column.
function namePrefixColumn(type: LinkType): number {
    return type === LinkType.HREF ? 1 : 2; // [name](url) vs [[name]] / @[name]
}

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
        // Parse the current document the same way the index does, so
        // [[links]], @[persons] and [hrefs](url) are all renameable.
        const text = document.getText();
        const zmaFile = processMdFile(text, document.uri.path);

        const atCursor = findLinkAtCursor(zmaFile.linkLocations, document, position, RENAME_TYPES);
        if (!atCursor) {
            return null;
        }

        const oldLinkName = atCursor.link.linkName();

        if (newName === oldLinkName) {
            return null;
        }

        const edit = new vscode.WorkspaceEdit();
        const locations = sharedIndex2().linkLocations().filter(ll => ll.link.linkName() === oldLinkName);

        // 1. Rename all references, preserving each reference's own bracket style
        for (const loc of locations) {
            if (!RENAME_TYPES.includes(loc.type)) { continue; }

            const nameStartColumn = loc.location.column + namePrefixColumn(loc.type);
            const nameEndColumn = nameStartColumn + oldLinkName.length;

            edit.replace(
                vscode.Uri.file(loc.location.link.filePath()),
                new vscode.Range(
                    new vscode.Position(loc.location.row, nameStartColumn),
                    new vscode.Position(loc.location.row, nameEndColumn)
                ),
                newName
            );
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
        const text = document.getText();
        const zmaFile = processMdFile(text, document.uri.path);

        const atCursor = findLinkAtCursor(zmaFile.linkLocations, document, position, RENAME_TYPES);
        if (!atCursor) {
            throw new Error('Cannot rename this element');
        }

        const nameStartColumn = atCursor.location.column + namePrefixColumn(atCursor.type);
        const nameEndColumn = nameStartColumn + atCursor.link.linkName().length;

        const range = new vscode.Range(
            new vscode.Position(atCursor.location.row, nameStartColumn),
            new vscode.Position(atCursor.location.row, nameEndColumn)
        );

        return { range, placeholder: atCursor.link.linkName() };
    }
}
