import * as vscode from 'vscode';
import * as fs from 'fs';
import { Link } from './Link';
import { cleanLinkTitle } from './Commands';
import { loadCliActions, runCliAction } from './CliAction';
import { sharedIndex2 } from './Index2';

interface DocumentInsertData {
    title: string;
    url: string;
    content: string;
    cliActionName?: string;
}

export function activateInsertDocument(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('zma.insertDocument', async () => {
        const insertData = await showDocumentInsertDialog();
        if (!insertData) {
            return;
        }

        // Show progress while creating document
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating document "${insertData.title}"...`,
            cancellable: false
        }, async (progress, token) => {
            await insertDocumentIntoWorkspace(insertData, progress);
        });
    });

    context.subscriptions.push(disposable);
}

async function showDocumentInsertDialog(): Promise<DocumentInsertData | undefined> {
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
        ...loadCliActions().map(action => ({
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
            content = (contentInput.value || '').trim();
            contentInput.hide();

            cliActionPicker.show();
        });

        contentInput.onDidHide(() => contentInput.dispose());

        cliActionPicker.onDidAccept(() => {
            const selectedItem = cliActionPicker.selectedItems[0];
            if (selectedItem && !selectedItem.label.includes('None')) {
                cliAction = selectedItem.label.replace('$(tools) ', '');
            }
            cliActionPicker.hide();
            resolve({ title, url, content, cliActionName: cliAction });
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

async function insertDocumentIntoWorkspace(
    insertData: DocumentInsertData,
    progress: vscode.Progress<{message?: string, increment?: number}>
): Promise<void> {
    progress.report({ increment: 10, message: 'Preparing document structure...' });
    
    const link = Link.fromRawLink(cleanLinkTitle(insertData.title));
    const filePath = link.filePath();

    progress.report({ increment: 20, message: 'Processing content...' });

    let processedContent = insertData.content;
    if (insertData.cliActionName) {
        progress.report({ increment: 0, message: `Running CLI action: ${insertData.cliActionName}...` });
        
        const cliAction = loadCliActions().find(action => action.name === insertData.cliActionName)!;

        try {
            processedContent = await runCliAction(cliAction, insertData.content);
            progress.report({ increment: 40, message: 'CLI action completed successfully' });
        } catch (error) {
            progress.report({ increment: 40, message: 'CLI action failed, using original content' });
            vscode.window.showWarningMessage(`CLI action failed: ${error instanceof Error ? error.message : String(error)}. Using original content.`);
        }
    } else {
        progress.report({ increment: 40, message: 'Content ready' });
    }

    progress.report({ increment: 15, message: 'Writing file to disk...' });
    
    fs.writeFileSync(filePath, processedContent, 'utf8');

    progress.report({ increment: 10, message: 'Creating link...' });
    
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        
        let linkText = `[${link.linkName()}](${insertData.url})`;

        if (insertData.url === null || insertData.url.trim().length === 0) {
            linkText = `[[${link.linkName()}]]`
        }
        
        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, linkText);
        });
    }

    progress.report({ increment: 5, message: 'Document created successfully!' });
    
    // Small delay to show completion message
    await new Promise(resolve => setTimeout(resolve, 500));

    vscode.window.showInformationMessage(`Document "${insertData.title}" created and linked`);
}