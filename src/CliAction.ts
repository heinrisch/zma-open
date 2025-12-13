import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { sharedIndex2, workspaceFolderPath } from './Index2';

interface CliAction {
    name: string;
    description: string;
    args: string[];
    preStep?: string[];
    cleanHtml?: boolean;
}

export function activateCliActions(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('zma.runCliAction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection) || '';


        const actions = loadCliActions();

        if (actions.length === 0) {
            vscode.window.showErrorMessage('No text actions found');
            return;
        }

        const selectedAction = await vscode.window.showQuickPick(
            actions.map(action => ({
                label: action.name,
                description: action.description,
                action: action
            })),
            { placeHolder: 'Select a text action' }
        );

        if (!selectedAction) return;

        const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!folder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return [];
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running ${selectedAction.label}...`,
            cancellable: false
        }, async () => {
            try {
                const result = await runCliAction(selectedAction.action, text);

                editor.edit(editBuilder => {
                    editBuilder.replace(selection, result);
                });


            } catch (error: unknown) {
                vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

export async function runCliAction(cliAction: CliAction, text: string): Promise<string> {
    const folder = workspaceFolderPath() || '';
    const tempDir = path.join(folder, ".cli-action-temp");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputFilePath = path.join(tempDir, `input.txt`);
    fs.writeFileSync(inputFilePath, text, 'utf8');

    if (cliAction.preStep) {
        const preStepCommands = cliAction.preStep.map(cmd =>
            cmd.replace(/\${text_file}/g, inputFilePath)
        );
        console.log(`Running pre-step commands: ${preStepCommands.join(' ')}`);
        await runCommand(preStepCommands.join(' '));
    }

    if (cliAction.cleanHtml) {
        const fileContent = fs.readFileSync(inputFilePath, 'utf8');
        const processedText = cleanHtmlForMarkdown(fileContent);
        fs.writeFileSync(inputFilePath, processedText, 'utf8');
        // Write cleaned file for debugging
        fs.writeFileSync(inputFilePath + ".cleaned", processedText, 'utf8');
    }

    const processedArgs = cliAction.args.map(arg =>
        arg.replace(/\${text_file}/g, inputFilePath)
    );

    console.log(`Running command: ${processedArgs.join(' ')}`);

    const result = await runCommand(processedArgs.join(' '));

    try {
        if (fs.existsSync(inputFilePath)) {
            fs.unlinkSync(inputFilePath);
        }
    } catch (error) {
        console.error('Failed to delete temp file:', error);
    }

    return result;
}


export function cleanHtmlForMarkdown(html: string): string {
    let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)[^<]*)*<\/style>/gi, '');

    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

    cleaned = cleaned.replace(/<a\b([^>]*?)href="([^"]*)"([^>]*?)>/gi, '<a href="$2">');

    const allowedTags = ['a', 'strong', 'b', 'em', 'i', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'p', 'br'];

    allowedTags.forEach(tag => {
        if (tag !== 'a') {
            cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), `<${tag}>`);
        }
    });

    const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
    cleaned = cleaned.replace(tagRegex, (match, tagName) => {
        if (allowedTags.includes(tagName.toLowerCase())) {
            return match;
        }
        return '';
    });

    const entities: { [key: string]: string } = {
        '&nbsp;': ' ',
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&quot;': '"',
        '&apos;': "'",
        '&mdash;': '—',
        '&ndash;': '–',
        '&hellip;': '…'
    };

    Object.entries(entities).forEach(([entity, replacement]) => {
        cleaned = cleaned.replace(new RegExp(entity, 'g'), replacement);
    });

    cleaned = cleaned
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/g, '');

    const blockElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre'];
    blockElements.forEach(tag => {
        cleaned = cleaned
            .replace(new RegExp(`<${tag}>\\s*`, 'g'), `\n\n<${tag}>`)
            .replace(new RegExp(`\\s*<\/${tag}>`, 'g'), `<\/${tag}>\n\n`);
    });

    cleaned = cleaned
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return cleaned;
}


export function loadCliActions(): CliAction[] {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return [];
    }
    const actionsPath = path.join(folder, "cli-actions");
    if (!fs.existsSync(actionsPath)) {
        fs.mkdirSync(actionsPath, { recursive: true });
        const exampleAction: CliAction = {
            name: 'Summarize',
            description: 'Summarize the selected text',
            args: ["cat ${text_file} | head -n10"],
            cleanHtml: false
        };
        const htmlCleanAction: CliAction = {
            name: 'Clean HTML and Summarize',
            description: 'Clean HTML formatting and summarize',
            args: ["cat ${text_file} | head -n10"],
            cleanHtml: true
        };
        const preStepExample: CliAction = {
            name: 'Summarize clipboard',
            description: 'Take clipboard content and summarize',
            preStep: [
                "wl-paste -t text/html > ${text_file}",
            ],
            args: ["cat ${text_file} | head -n10"],
            cleanHtml: false
        };
        fs.writeFileSync(
            path.join(actionsPath, 'summarize.json'),
            JSON.stringify(exampleAction, null, 2)
        );
        fs.writeFileSync(
            path.join(actionsPath, 'clean-html-summarize.json'),
            JSON.stringify(htmlCleanAction, null, 2)
        );
        fs.writeFileSync(
            path.join(actionsPath, 'pre-process-summarize.json'),
            JSON.stringify(preStepExample, null, 2)
        );
    }

    const actions: CliAction[] = [];
    const files = fs.readdirSync(actionsPath);

    for (const file of files) {
        if (path.extname(file) === '.json') {
            try {
                actions.push(JSON.parse(fs.readFileSync(path.join(actionsPath, file), 'utf8')));
            } catch (error: unknown) {
                vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    return actions;
}

function runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        console.log(`Executing command: ${command}`);

        const shellCommand = `bash -c "${command}"`;
        console.log(`Full shell command: ${shellCommand}`);

        const process = cp.exec(shellCommand, {
            timeout: 60000, // 60 second timeout
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data) => {
            stdout += data;
        });

        process.stderr?.on('data', (data) => {
            stderr += data;
        });

        process.on('close', (code) => {
            if (code === 0) {
                console.log(`Command output: ${stdout}`);
                resolve(stdout);
            } else {
                const error = new Error(`Command failed with code ${code}${stderr ? `: ${stderr}` : ''}`);
                console.error(error);
                reject(error);
            }
        });

        process.on('error', (error) => {
            console.error(`Command error: ${error}`);
            reject(error);
        });

        process.on('timeout', () => {
            process.kill();
            const error = new Error(`Command timed out after 5 seconds`);
            console.error(error);
            reject(error);
        });
    });
}