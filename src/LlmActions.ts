import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LlmClient, LlmMessage, LlmClientConfig } from './LlmClient';

export interface LlmAction {
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    temperature?: number;
    maxTokens?: number;
}

export function activateLlmActions(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('zma.runLlmAction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection) || '';

        // Load LLM configuration
        const config = loadLlmConfig();
        if (!config) {
            vscode.window.showErrorMessage('LLM configuration not found. Create llm-config.json in workspace root.');
            return;
        }

        // Load available actions
        const actions = loadLlmActions();
        if (actions.length === 0) {
            vscode.window.showErrorMessage('No LLM actions found');
            return;
        }

        // Let user select action
        const selectedAction = await vscode.window.showQuickPick(
            actions.map(action => ({
                label: action.name,
                description: action.description,
                action: action
            })),
            { placeHolder: 'Select an LLM action' }
        );

        if (!selectedAction) return;

        // Execute action with progress indicator
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running ${selectedAction.label}...`,
            cancellable: false
        }, async () => {
            try {
                const result = await runLlmAction(config, selectedAction.action, text);
                
                // Replace selection with result
                editor.edit(editBuilder => {
                    editBuilder.replace(selection, result);
                });
            } catch (error: unknown) {
                vscode.window.showErrorMessage(`LLM Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

export async function runLlmAction(
    config: LlmClientConfig,
    action: LlmAction,
    text: string
): Promise<string> {
    // Create client with action-specific overrides
    const clientConfig: LlmClientConfig = {
        ...config,
        temperature: action.temperature ?? config.temperature,
        maxTokens: action.maxTokens ?? config.maxTokens
    };
    
    const client = new LlmClient(clientConfig);

    // Build messages
    const messages: LlmMessage[] = [
        {
            role: 'system',
            content: action.systemPrompt
        },
        {
            role: 'user',
            content: action.userPromptTemplate 
                ? action.userPromptTemplate.replace('${text}', text)
                : text
        }
    ];

    // Get completion
    return await client.complete(messages);
}

export function loadLlmConfig(): LlmClientConfig | null {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        return null;
    }

    const configPath = path.join(folder, 'llm-config.json');
    if (!fs.existsSync(configPath)) {
        // Create example config
        const exampleConfig: LlmClientConfig = {
            baseUrl: 'http://localhost:11434',
            model: 'llama3.2',
            temperature: 0.7,
            maxTokens: 2000
        };
        
        fs.writeFileSync(
            configPath,
            JSON.stringify(exampleConfig, null, 2) + '\n'
        );
        
        return null;
    }

    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData) as LlmClientConfig;
    } catch (error) {
        console.error('Failed to load LLM config:', error);
        return null;
    }
}

export function loadLlmActions(): LlmAction[] {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        return [];
    }

    const actionsPath = path.join(folder, 'llm-actions');
    if (!fs.existsSync(actionsPath)) {
        fs.mkdirSync(actionsPath, { recursive: true });
        
        // Create example actions
        const summarizeAction: LlmAction = {
            name: 'Summarize',
            description: 'Summarize the selected text',
            systemPrompt: 'You are a helpful assistant that summarizes text concisely.',
            userPromptTemplate: 'Please summarize the following text:\n\n${text}'
        };
        
        const improveAction: LlmAction = {
            name: 'Improve Writing',
            description: 'Improve grammar and clarity',
            systemPrompt: 'You are an expert editor. Improve the grammar, clarity, and style of the text while preserving its meaning.',
            userPromptTemplate: '${text}'
        };
        
        const explainAction: LlmAction = {
            name: 'Explain Code',
            description: 'Explain what the code does',
            systemPrompt: 'You are a programming expert. Explain code clearly and concisely.',
            userPromptTemplate: 'Explain what this code does:\n\n${text}',
            temperature: 0.3
        };
        
        fs.writeFileSync(
            path.join(actionsPath, 'summarize.json'),
            JSON.stringify(summarizeAction, null, 2)
        );
        fs.writeFileSync(
            path.join(actionsPath, 'improve-writing.json'),
            JSON.stringify(improveAction, null, 2)
        );
        fs.writeFileSync(
            path.join(actionsPath, 'explain-code.json'),
            JSON.stringify(explainAction, null, 2)
        );
    }

    const actions: LlmAction[] = [];
    const files = fs.readdirSync(actionsPath);

    for (const file of files) {
        if (path.extname(file) === '.json') {
            try {
                const actionData = fs.readFileSync(path.join(actionsPath, file), 'utf8');
                actions.push(JSON.parse(actionData));
            } catch (error: unknown) {
                console.error(`Failed to load action ${file}:`, error);
            }
        }
    }

    return actions;
}
