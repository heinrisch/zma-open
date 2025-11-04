import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CliAction } from './CliAction';

interface DocumentInsertData {
    title: string;
    url: string;
    content: string;
    cliAction?: string;
}

export function activateInsertDocument(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('zma.insertDocument', async () => {
        const insertData = await showDocumentInsertDialog();
        if (!insertData) {
            return;
        }

        await insertDocumentIntoWorkspace(insertData);
    });

    context.subscriptions.push(disposable);
}

async function showDocumentInsertDialog(): Promise<DocumentInsertData | undefined> {
    // Get title
    const title = await vscode.window.showInputBox({
        prompt: 'Enter document title',
        placeHolder: 'Document title',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Title is required';
            }
            return null;
        }
    });
    
    if (!title) {
        return undefined;
    }

    // Get URL
    const url = await vscode.window.showInputBox({
        prompt: 'Enter document URL (optional)',
        placeHolder: 'https://example.com/document'
    });

    // Get content
    const content = await vscode.window.showInputBox({
        prompt: 'Enter document content',
        placeHolder: 'Document content or paste text here',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Content is required';
            }
            return null;
        }
    });
    
    if (!content) {
        return undefined;
    }

    // Get CLI action (optional)
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    let cliAction: string | undefined;
    
    if (folder) {
        const cliActionsPath = path.join(folder, "cli-actions");
        const actions = loadCliActions(cliActionsPath);
        
        if (actions.length > 0) {
            const selectedAction = await vscode.window.showQuickPick(
                [
                    { label: '$(clear-all) None', description: 'No CLI action', value: undefined },
                    ...actions.map(action => ({
                        label: `$(tools) ${action.name}`,
                        description: action.description,
                        value: action.name
                    }))
                ],
                { 
                    placeHolder: 'Select CLI action to run on content (optional)',
                    ignoreFocusOut: true
                }
            );
            
            if (selectedAction) {
                cliAction = selectedAction.value;
            }
        }
    }

    return {
        title: title.trim(),
        url: url?.trim() || '',
        content: content.trim(),
        cliAction
    };
}

async function insertDocumentIntoWorkspace(insertData: DocumentInsertData): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    // Create docs folder if it doesn't exist
    const docsPath = path.join(folder, 'docs');
    if (!fs.existsSync(docsPath)) {
        fs.mkdirSync(docsPath, { recursive: true });
    }

    // Generate filename from title
    const filename = generateFilename(insertData.title);
    const filePath = path.join(docsPath, `${filename}.md`);

    // Process content with CLI action if specified
    let processedContent = insertData.content;
    if (insertData.cliAction) {
        try {
            processedContent = await runCliActionOnContent(insertData.content, insertData.cliAction, folder);
        } catch (error) {
            vscode.window.showWarningMessage(`CLI action failed: ${error instanceof Error ? error.message : String(error)}. Using original content.`);
        }
    }

    // Create document content
    const documentContent = createDocumentContent(insertData.title, insertData.url, processedContent);

    // Write file
    fs.writeFileSync(filePath, documentContent, 'utf8');

    // Open the created document
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage(`Document "${insertData.title}" created in docs folder`);
}

function generateFilename(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

function createDocumentContent(title: string, url: string, content: string): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    let documentContent = `# ${title}\n\n`;
    
    if (url) {
        documentContent += `**Source:** [${url}](${url})\n\n`;
    }
    
    documentContent += `**Added:** ${timestamp}\n\n`;
    documentContent += `---\n\n`;
    documentContent += content;
    
    return documentContent;
}

async function runCliActionOnContent(content: string, actionName: string, workspaceFolder: string): Promise<string> {
    const cliActionsPath = path.join(workspaceFolder, "cli-actions");
    const actions = loadCliActions(cliActionsPath);
    const action = actions.find(a => a.name === actionName);
    
    if (!action) {
        throw new Error(`CLI action "${actionName}" not found`);
    }

    // Create temp directory and file
    const tempDir = path.join(workspaceFolder, ".cli-action-temp");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputFilePath = path.join(tempDir, `insert-doc-input.txt`);
    fs.writeFileSync(inputFilePath, content, 'utf8');

    try {
        // Run pre-step commands if any
        if (action.preStep) {
            const preStepCommands = action.preStep.map(cmd =>
                cmd.replace(/\${text_file}/g, inputFilePath)
            );
            await runCommand(preStepCommands.join(' '));
        }

        // Clean HTML if specified
        if (action.cleanHtml) {
            const fileContent = fs.readFileSync(inputFilePath, 'utf8');
            const processedText = cleanHtmlForMarkdown(fileContent);
            fs.writeFileSync(inputFilePath, processedText, 'utf8');
        }

        // Run main action
        const processedArgs = action.args.map(arg =>
            arg.replace(/\${text_file}/g, inputFilePath)
        );
        
        const result = await runCommand(processedArgs.join(' '));
        return result.trim();
        
    } finally {
        // Cleanup temp file
        try {
            if (fs.existsSync(inputFilePath)) {
                fs.unlinkSync(inputFilePath);
            }
        } catch (error) {
            console.error('Failed to delete temp file:', error);
        }
    }
}

// Reuse types and functions from CliAction.ts
interface CliAction {
    name: string;
    description: string;
    args: string[];
    preStep?: string[];
    cleanHtml?: boolean;
}

function loadCliActions(actionsPath: string): CliAction[] {
    if (!fs.existsSync(actionsPath)) {
        return [];
    }

    const actions: CliAction[] = [];
    const files = fs.readdirSync(actionsPath);

    for (const file of files) {
        if (path.extname(file) === '.json') {
            try {
                const actionContent = fs.readFileSync(path.join(actionsPath, file), 'utf8');
                actions.push(JSON.parse(actionContent));
            } catch (error) {
                console.error(`Error loading CLI action from ${file}:`, error);
            }
        }
    }

    return actions;
}

function runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const cp = require('child_process');
        const shellCommand = `bash -c "${command}"`;
        
        const process = cp.exec(shellCommand, {
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024
        });

        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data: string) => {
            stdout += data;
        });

        process.stderr?.on('data', (data: string) => {
            stderr += data;
        });

        process.on('close', (code: number) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Command failed with code ${code}${stderr ? `: ${stderr}` : ''}`));
            }
        });

        process.on('error', (error: Error) => {
            reject(error);
        });
    });
}

function cleanHtmlForMarkdown(html: string): string {
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