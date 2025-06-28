import * as vscode from 'vscode';
import { DocumentSelector, ExtensionContext, Uri, languages } from "vscode";
import { getLastEdit } from "./LastEditHandler";
import { sharedIndex2 } from './Index2';



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
                const wordPattern = /(\[\[[^\]]*\]\])/;
                const wordRange = document.getWordRangeAtPosition(position, wordPattern);
                if (!wordRange) {
                    reject();
                    return;
                }
                const word = document.getText(wordRange);
                const rawLink = word.replace(/\[\[/, '').replace(/\]\]/, '');

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