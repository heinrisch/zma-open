import * as vscode from 'vscode';
import { URLClassifier, AssetType, AssetTypeColors } from './UrlClassifier';
import { LinkType } from './LinkLocation';
import { processMdFile, sharedIndex2 } from './Index2';

export class MarkdownInlineUrlFold implements vscode.Disposable {
    private hiddenDeco: vscode.TextEditorDecorationType;
    private weakRevealDeco: vscode.TextEditorDecorationType;
    private coloredDecos: Map<string, vscode.TextEditorDecorationType> = new Map();
    private disposables: vscode.Disposable[] = [];
    private enabled = true;
    private throttle?: NodeJS.Timeout;
    private urlClassifier: URLClassifier;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.urlClassifier = new URLClassifier();

        this.hiddenDeco = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
            textDecoration: 'none; opacity: 0;',
            letterSpacing: '-1em',
            after: {
                contentText: '-',
                color: new vscode.ThemeColor('editor.foreground'),
                margin: '0',
            },
        });

        this.weakRevealDeco = vscode.window.createTextEditorDecorationType({
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
            textDecoration: 'none; opacity: 0;',
            letterSpacing: '-1em',
            after: {
                contentText: '',
            },
        });

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
            vscode.workspace.onDidChangeTextDocument(e => {
                const ed = vscode.window.activeTextEditor;
                if (ed && e.document === ed.document) { this.scheduleUpdate(); }
            }),
            vscode.window.onDidChangeTextEditorSelection(() => this.scheduleUpdate()),
            vscode.workspace.onDidOpenTextDocument(() => this.scheduleUpdate()),
            vscode.commands.registerCommand('zma.inlineFold.toggleMarkdownUrls', () => {
                this.enabled = !this.enabled;
                this.scheduleUpdate(true);
            }),
        );

        this.scheduleUpdate();
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.hiddenDeco.dispose();
        this.weakRevealDeco.dispose();
        this.coloredDecos.forEach(deco => deco.dispose());
    }

    private scheduleUpdate(flush = false) {
        if (flush && this.throttle) {
            clearTimeout(this.throttle);
            this.throttle = undefined;
        }

        if (!this.throttle) {
            this.throttle = setTimeout(() => {
                this.throttle = undefined;
                this.update();
            }, 120);
        }
    }

    private getOrCreateColorDeco(color: string): vscode.TextEditorDecorationType {
        if (!this.coloredDecos.has(color)) {
            const deco = vscode.window.createTextEditorDecorationType({
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
                color: color,
                fontWeight: 'bold',
            });
            this.coloredDecos.set(color, deco);
        }
        return this.coloredDecos.get(color)!;
    }

    private getUrlColor(url: string): string {

        const classification = this.urlClassifier.classify(url);

        if (classification.assetType === AssetType.Unclassified) {
            return colorForString(url);
        }

        return AssetTypeColors[classification.assetType];

    }

    private getLinkColor(rawLink: string): string {
        const urls = sharedIndex2().urlsForLinkRaw(rawLink);
        if (urls.length === 0) {
            return colorForString(rawLink);
        }

        const url = urls[0];
        return this.getUrlColor(url);
    }

    private update() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') { return; }

        const doc = editor.document;
        if (!this.enabled) {
            editor.setDecorations(this.hiddenDeco, []);
            editor.setDecorations(this.weakRevealDeco, []);
            this.coloredDecos.forEach((deco) => editor.setDecorations(deco, []));
            return;
        }

        const text = doc.getText();
        const hidden: vscode.DecorationOptions[] = [];
        const weak: vscode.DecorationOptions[] = [];
        const coloredByHex: Map<string, vscode.DecorationOptions[]> = new Map();

        const cursorLine = editor.selection.active.line;

        const zmaFile = processMdFile(text, doc.uri.path);

        const addColored = (color: string, range: vscode.Range) => {
            if (!coloredByHex.has(color)) {
                coloredByHex.set(color, []);
            }
            coloredByHex.get(color)!.push({ range });
        };

        for (const ll of zmaFile.linkLocations) {
            const row = ll.location.row;
            const column = ll.location.column;
            const startOffset = doc.offsetAt(new vscode.Position(row, column));

            // Don't fold the line the cursor is on so links stay editable
            if (row === cursorLine) { continue; }

            switch (ll.type) {
                case LinkType.HREF: {
                    // [text](url): hide the URL, color the link text
                    const linkTextStart = startOffset + 1; // After the opening [
                    const titleEnd = text.indexOf(']', linkTextStart);
                    const urlStart = titleEnd + 2; // After ](
                    const urlEnd = urlStart + (ll.url || '').length;

                    hidden.push({ range: new vscode.Range(doc.positionAt(urlStart), doc.positionAt(urlEnd)) });
                    addColored(this.getUrlColor(ll.url || ''), new vscode.Range(doc.positionAt(linkTextStart), doc.positionAt(titleEnd)));
                    break;
                }
                case LinkType.LINK: {
                    // [[text]]: show the brackets dimly, color the content
                    const openBracketStart = startOffset;
                    const openBracketEnd = startOffset + 2;
                    const closeBracketStart = text.indexOf(']]', openBracketEnd);
                    const closeBracketEnd = closeBracketStart + 2;

                    weak.push({ range: new vscode.Range(doc.positionAt(openBracketStart), doc.positionAt(openBracketEnd)) });
                    weak.push({ range: new vscode.Range(doc.positionAt(closeBracketStart), doc.positionAt(closeBracketEnd)) });

                    addColored(this.getLinkColor(ll.link.linkName()), new vscode.Range(doc.positionAt(openBracketEnd), doc.positionAt(closeBracketStart)));
                    break;
                }
                case LinkType.PERSON: {
                    // @[text]: show the @ and brackets dimly, color the content
                    const openBracketStart = startOffset; // The @
                    const openBracketEnd = startOffset + 2; // After @[
                    const closeBracketStart = text.indexOf(']', openBracketEnd);
                    const closeBracketEnd = closeBracketStart + 1;

                    weak.push({ range: new vscode.Range(doc.positionAt(openBracketStart), doc.positionAt(openBracketEnd)) });
                    weak.push({ range: new vscode.Range(doc.positionAt(closeBracketStart), doc.positionAt(closeBracketEnd)) });

                    addColored(this.getLinkColor(ll.link.linkName()), new vscode.Range(doc.positionAt(openBracketEnd), doc.positionAt(closeBracketStart)));
                    break;
                }
                case LinkType.DATE: {
                    // ![date]: show the ! and brackets dimly, color the date
                    const openBracketStart = startOffset; // The !
                    const openBracketEnd = startOffset + 2; // After ![
                    const closeBracketStart = text.indexOf(']', openBracketEnd);
                    const closeBracketEnd = closeBracketStart + 1;

                    weak.push({ range: new vscode.Range(doc.positionAt(openBracketStart), doc.positionAt(openBracketEnd)) });
                    weak.push({ range: new vscode.Range(doc.positionAt(closeBracketStart), doc.positionAt(closeBracketEnd)) });

                    addColored(this.getLinkColor(ll.link.linkName()), new vscode.Range(doc.positionAt(openBracketEnd), doc.positionAt(closeBracketStart)));
                    break;
                }
                // HASHTAG and HEADING links are left as-is
            }
        }

        editor.setDecorations(this.hiddenDeco, hidden);
        editor.setDecorations(this.weakRevealDeco, weak);

        coloredByHex.forEach((decorations, hex) => {
            const deco = this.getOrCreateColorDeco(hex);
            editor.setDecorations(deco, decorations);
        });

        this.coloredDecos.forEach((deco, hex) => {
            if (!coloredByHex.has(hex)) {
                editor.setDecorations(deco, []);
            }
        });
    }
}

export function registerMarkdownInlineUrlFold(context: vscode.ExtensionContext) {
    const feature = new MarkdownInlineUrlFold(context);
    context.subscriptions.push(feature);
    return feature;
}

function colorForString(s: string): string {
    const hexColors: string[] = [
        "#f97316", "#ea580c", // orange 500–600
        "#f59e0b", "#d97706", // amber 500–600
        "#eab308", "#ca8a04", // yellow 500–600
    ];

    const index = stringToIndex(s, hexColors.length);
    return hexColors[index];

}

export function stringToIndex(s: string, n: number): number {
    if (n <= 0) { throw new Error("n must be > 0"); }
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0) % n;
}