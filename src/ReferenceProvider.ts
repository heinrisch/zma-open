import * as vscode from 'vscode';
import { DocumentSelector, ExtensionContext, Uri, languages } from "vscode";
import { getLastEdit } from "./LastEditHandler";
import { processMdFile, sharedIndex2 } from './Index2';
import { findLinkAtCursor, LinkType } from './LinkLocation';



const Document_Selector_Markdown: DocumentSelector = [
    { language: "markdown", scheme: "file" },
    { language: "markdown", scheme: "untitled" },
];

export function activateReferenceProvider(context: ExtensionContext) {
    context.subscriptions.push(
        languages.registerReferenceProvider(
            Document_Selector_Markdown, new ZmaReferenceProvider()));
}

class ZmaReferenceProvider implements vscode.ReferenceProvider {
    public provideReferences(
        document: vscode.TextDocument, position: vscode.Position):
        Thenable<vscode.Location[]> {
            return new Promise<vscode.Location[]>((resolve, reject) => {
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

                const rawLink = atCursor.link.linkName();
                const ll = sharedIndex2().linkLocations().filter(ll => ll.link.linkName() === rawLink);

                if (!ll || ll.length === 0) {
                    reject();
                    return;
                }

                const locations = ll
                    .sort((a, b) => {
                        const aLastEdit = getLastEdit(a.location.link.linkName());
                        const bLastEdit = getLastEdit(b.location.link.linkName());
                        return bLastEdit.getTime() - aLastEdit.getTime();
                    })
                    .map(ll => {
                        const filePath = ll.location.link.filePath();
                        return new vscode.Location(Uri.file(filePath), new vscode.Position(ll.location.row, ll.location.column));
                    });


                resolve(locations);
            });
    }
}
