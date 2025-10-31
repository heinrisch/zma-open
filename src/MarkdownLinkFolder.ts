import * as vscode from 'vscode';

const LANG_SELECTOR: vscode.DocumentSelector = [{ language: 'markdown', scheme: '*' }];

export class MarkdownInlineUrlFold implements vscode.Disposable {
    private hiddenDeco: vscode.TextEditorDecorationType;
    private weakRevealDeco: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];
    private enabled = true;
    private throttle?: NodeJS.Timeout;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.hiddenDeco = this.hiddenDeco = vscode.window.createTextEditorDecorationType({
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
            textDecoration: 'none; opacity: 0.55;',
            after: {
                contentText: ' ',
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

    private update() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') return;

        const doc = editor.document;
        if (!this.enabled) {
            editor.setDecorations(this.hiddenDeco, []);
            editor.setDecorations(this.weakRevealDeco, []);
            return;
        }

        const text = doc.getText();
        const rx = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

        const hidden: vscode.DecorationOptions[] = [];
        const weak: vscode.DecorationOptions[] = [];

        const selection = editor.selection;
        const selStart = doc.offsetAt(selection.start);
        const selEnd = doc.offsetAt(selection.end);

        for (let m: RegExpExecArray | null = rx.exec(text); m; m = rx.exec(text)) {
            const urlStartOffset = m.index + m[0].indexOf(m[2]);
            const urlEndOffset = urlStartOffset + m[2].length;

            const range = new vscode.Range(doc.positionAt(urlStartOffset), doc.positionAt(urlEndOffset));

            const intersects = !(urlEndOffset <= selStart || urlStartOffset >= selEnd);
            if (intersects) {
                weak.push({ range });
            } else {
                hidden.push({ range });
            }
        }

        editor.setDecorations(this.hiddenDeco, hidden);
        editor.setDecorations(this.weakRevealDeco, weak);
    }
}

export function registerMarkdownInlineUrlFold(context: vscode.ExtensionContext) {
    const feature = new MarkdownInlineUrlFold(context);
    context.subscriptions.push(feature);
    return feature;
}
