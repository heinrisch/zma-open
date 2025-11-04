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
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    let cliActions: CliAction[] = [];
    
    if (folder) {
        const cliActionsPath = path.join(folder, "cli-actions");
        cliActions = loadCliActions(cliActionsPath);
    }

    // Create input fields
    const titleInput = vscode.window.createInputBox();
    titleInput.title = 'Insert Document';
    titleInput.step = 1;
    titleInput.totalSteps = 4;
    titleInput.placeholder = 'Document title';
    titleInput.prompt = 'Enter document title';
    titleInput.ignoreFocusOut = true;

    const urlInput = vscode.window.createInputBox();
    urlInput.title = 'Insert Document';
    urlInput.step = 2;
    urlInput.totalSteps = 4;
    urlInput.placeholder = 'https://example.com/document (optional)';
    urlInput.prompt = 'Enter document URL (optional)';
    urlInput.ignoreFocusOut = true;

    const contentInput = vscode.window.createInputBox();
    contentInput.title = 'Insert Document';
    contentInput.step = 3;
    contentInput.totalSteps = 4;
    contentInput.placeholder = 'Document content or paste text here';
    contentInput.prompt = 'Enter document content';
    contentInput.ignoreFocusOut = true;

    const cliActionPicker = vscode.window.createQuickPick();
    cliActionPicker.title = 'Insert Document';
    cliActionPicker.step = 4;
    cliActionPicker.totalSteps = 4;
    cliActionPicker.placeholder = 'Select CLI action to run on content (optional)';
    cliActionPicker.ignoreFocusOut = true;
    cliActionPicker.items = [
        { label: '$(clear-all) None', description: 'No CLI action' },
        ...cliActions.map(action => ({
            label: `$(tools) ${action.name}`,
            description: action.description
        }))
    ];

    return new Promise((resolve) => {
        let title = '';
        let url = '';
        let content = '';
        let cliAction: string | undefined;

        titleInput.onDidAccept(() => {
            if (!titleInput.value || titleInput.value.trim().length === 0) {
                titleInput.validationMessage = 'Title is required';
                return;
            }
            title = titleInput.value.trim();
            titleInput.hide();
            urlInput.show();
        });

        titleInput.onDidHide(() => titleInput.dispose());

        urlInput.onDidAccept(() => {
            url = urlInput.value?.trim() || '';
            urlInput.hide();
            contentInput.show();
        });

        urlInput.onDidHide(() => urlInput.dispose());

        contentInput.onDidAccept(() => {
            if (!contentInput.value || contentInput.value.trim().length === 0) {
                contentInput.validationMessage = 'Content is required';
                return;
            }
            content = contentInput.value.trim();
            contentInput.hide();
            
            if (cliActions.length > 0) {
                cliActionPicker.show();
            } else {
                resolve({ title, url, content, cliAction });
            }
        });

        contentInput.onDidHide(() => contentInput.dispose());

        cliActionPicker.onDidAccept(() => {
            const selectedItem = cliActionPicker.selectedItems[0];
            if (selectedItem && !selectedItem.label.includes('None')) {
                cliAction = selectedItem.label.replace('$(tools) ', '');
            }
            cliActionPicker.hide();
            resolve({ title, url, content, cliAction });
        });

        cliActionPicker.onDidHide(() => cliActionPicker.dispose());

        // Handle cancellation
        titleInput.onDidTriggerButton(() => resolve(undefined));
        urlInput.onDidTriggerButton(() => resolve(undefined));
        contentInput.onDidTriggerButton(() => resolve(undefined));
        cliActionPicker.onDidTriggerButton(() => resolve(undefined));

        titleInput.show();
    });
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

    // Write only the content to the file (no headers)
    fs.writeFileSync(filePath, processedContent, 'utf8');

    // Insert link at cursor position
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const relativePath = path.relative(path.dirname(editor.document.uri.fsPath), filePath);
        const linkText = `[${insertData.title}](${relativePath.replace(/\\/g, '/')})`;
        
        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, linkText);
        });
    }

    vscode.window.showInformationMessage(`Document "${insertData.title}" created and linked`);
}

function generateFilename(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
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