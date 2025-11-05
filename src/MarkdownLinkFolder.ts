import * as vscode from 'vscode';
import { URLClassifier, AssetType, AssetTypeColors } from './UrlClassifier';
import { Link } from './Link';
import { sharedIndex2 } from './Index2';

const LANG_SELECTOR: vscode.DocumentSelector = [{ language: 'markdown', scheme: '*' }];

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
                if (ed && e.document === ed.document) this.scheduleUpdate();
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

        return AssetTypeColors[classification.assetType]

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
        if (!editor || editor.document.languageId !== 'markdown') return;

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

        const selection = editor.selection;
        const selStart = doc.offsetAt(selection.start);
        const selEnd = doc.offsetAt(selection.end);
        const cursorLine = editor.selection.active.line;

        // Pattern for standard markdown links: [text](url)
        const markdownRx = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

        // Pattern for wikimarkdown links: [[text]]
        const wikiRx = /\[\[([^\]]+)\]\]/g;

        // Process standard markdown links
        for (let m: RegExpExecArray | null = markdownRx.exec(text); m; m = markdownRx.exec(text)) {
            const linkTextStart = m.index + 1; // After the opening [
            const linkTextEnd = m.index + m[1].length + 1; // Position after link text

            const urlStartOffset = m.index + m[0].indexOf(m[2]);
            const urlEndOffset = urlStartOffset + m[2].length;

            const urlRange = new vscode.Range(doc.positionAt(urlStartOffset), doc.positionAt(urlEndOffset));
            const linkTextRange = new vscode.Range(doc.positionAt(linkTextStart), doc.positionAt(linkTextEnd));

            if (urlRange.start.line === cursorLine || urlRange.end.line === cursorLine) continue;

            hidden.push({ range: urlRange });

            const url = m[2];
            const color = this.getUrlColor(url);
            if (!coloredByHex.has(color)) {
                coloredByHex.set(color, []);
            }
            coloredByHex.get(color)!.push({
                range: linkTextRange,
            });
        }

        // Process wikimarkdown links
        for (let m: RegExpExecArray | null = wikiRx.exec(text); m; m = wikiRx.exec(text)) {
            const openBracketStart = m.index; // Position of [[
            const openBracketEnd = m.index + 2; // After [[
            const closeBracketStart = m.index + m[0].length - 2; // Before ]]
            const closeBracketEnd = m.index + m[0].length; // After ]]

            const linkRaw = m[1];
            const contentStart = openBracketEnd;
            const contentEnd = closeBracketStart;

            const openBracketRange = new vscode.Range(doc.positionAt(openBracketStart), doc.positionAt(openBracketEnd));
            const closeBracketRange = new vscode.Range(doc.positionAt(closeBracketStart), doc.positionAt(closeBracketEnd));
            const contentRange = new vscode.Range(doc.positionAt(contentStart), doc.positionAt(contentEnd));

            if (openBracketRange.start.line === cursorLine || closeBracketRange.end.line === cursorLine) continue;

            weak.push({ range: openBracketRange });
            weak.push({ range: closeBracketRange });


            const color = this.getLinkColor(linkRaw);
            if (!coloredByHex.has(color)) {
                coloredByHex.set(color, []);
            }
            coloredByHex.get(color)!.push({
                range: contentRange,
            });
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
    if (n <= 0) throw new Error("n must be > 0");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0) % n;
}