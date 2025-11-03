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
                contentText: '…',
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
        return AssetTypeColors[classification.assetType];
    }

    private getLinkColor(rawLink: string): string {
        const urls = sharedIndex2().urlsForLinkRaw(rawLink);
        if (urls.length === 0) {
            return AssetTypeColors[AssetType.Unclassified];
        }

        const url = urls[0];
        const classification = this.urlClassifier.classify(url);
        return AssetTypeColors[classification.assetType];
    }

    private willUrlWrap(editor: vscode.TextEditor, urlRange: vscode.Range, url: string): boolean {
        const startPos = urlRange.start;
        const endPos = urlRange.end;
        
        // If URL spans multiple document lines, it definitely wraps
        if (startPos.line !== endPos.line) return true;
        
        // Get editor configuration for word wrap
        const config = vscode.workspace.getConfiguration('editor');
        const wordWrapColumn = config.get<number>('wordWrapColumn') || 80;
        const rulers = config.get<number[]>('rulers') || [];
        const effectiveWrapColumn = rulers.length > 0 ? Math.min(...rulers) : wordWrapColumn;
        
        // Check if URL is long enough to likely cause wrapping
        const lineText = editor.document.lineAt(startPos.line).text;
        const urlStartChar = startPos.character;
        const urlLength = url.length;
        
        // If URL would extend beyond typical wrap point, it likely wraps
        return (urlStartChar + urlLength) > effectiveWrapColumn || url.length > 50;
    }

    private handleLongUrl(url: string, urlRange: vscode.Range, linkTextRange: vscode.Range): vscode.DecorationOptions {
        // For long URLs that might wrap, create abbreviated version
        const maxDisplayLength = 30;
        let displayUrl = url;
        
        if (url.length > maxDisplayLength) {
            const start = url.substring(0, 15);
            const end = url.substring(url.length - 10);
            displayUrl = `${start}…${end}`;
        }
        
        return {
            range: urlRange,
            renderOptions: {
                after: {
                    contentText: `${displayUrl})`,
                    color: new vscode.ThemeColor('editor.foreground'),
                    opacity: '0.8',
                    fontStyle: 'italic'
                }
            }
        };
    }

    private addColoredDecoration(coloredByHex: Map<string, vscode.DecorationOptions[]>, color: string, range: vscode.Range) {
        if (!coloredByHex.has(color)) {
            coloredByHex.set(color, []);
        }
        coloredByHex.get(color)!.push({ range });
    }

    private clearAllDecorations(editor: vscode.TextEditor) {
        editor.setDecorations(this.hiddenDeco, []);
        editor.setDecorations(this.weakRevealDeco, []);
        this.coloredDecos.forEach((deco) => editor.setDecorations(deco, []));
    }

    private update() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') return;

        const doc = editor.document;
        if (!this.enabled) {
            this.clearAllDecorations(editor);
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

            const url = m[2];
            
            // Check if URL will likely wrap and handle accordingly
            if (this.willUrlWrap(editor, urlRange, url)) {
                // For long/wrapping URLs, use abbreviated display instead of simple hiding
                const decoration = this.handleLongUrl(url, urlRange, linkTextRange);
                hidden.push(decoration);
            } else {
                // Normal short URL - hide completely
                hidden.push({ range: urlRange });
            }

            const color = this.getUrlColor(url);
            this.addColoredDecoration(coloredByHex, color, linkTextRange);
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
            this.addColoredDecoration(coloredByHex, color, contentRange);
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