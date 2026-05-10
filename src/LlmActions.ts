import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LlmClient, LlmMessage, LlmClientConfig } from './LlmClient';
import { cleanHtmlForMarkdown } from './CliAction';

export interface LlmAction {
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    temperature?: number;
    maxTokens?: number;
    cleanHtml?: boolean;
    model?: string;
}

const spellCheckActionFileName = 'spell-check.json';

const defaultSpellCheckAction: LlmAction = {
    name: 'Spell Check',
    description: 'Correct spelling and minor grammar issues in the current note',
    systemPrompt: [
        'You are a careful copy editor for Markdown notes.',
        'The note is a ZMA note: Markdown text is commonly organized as bullet lists, may contain headings, tags:: metadata, [[wiki links]], regular Markdown links, #hashtags, TODO/DOING/DONE task markers, and alias lines such as [[Alias]] = [[Target]].',
        'Correct only misspellings and small grammatical mistakes.',
        'Use US English spelling, punctuation, and grammar.',
        'Preserve ZMA note conventions exactly: keep Markdown syntax, bullet structure, indentation, headings, [[wiki link]] targets, Markdown link URLs, #hashtags, tags:: metadata, TODO/DOING/DONE markers and categories, aliases, front matter, and code blocks unchanged unless the visible prose around them contains a spelling or small grammar mistake.',
        'Do not rewrite, summarize, expand, reorganize, convert bullets to paragraphs, create or remove links, create or remove tags, or change the meaning, tone, formatting, Markdown structure, or note organization.',
        'Return the full note only, with the minimal corrections applied. Do not include explanations, comments, or markdown fences around the note.'
    ].join('\n'),
    userPromptTemplate: [
        'Correct the following full note for spelling and small grammar mistakes only.',
        'Keep it as a ZMA Markdown note, preserving bullets, headings, [[wiki links]], Markdown links, #hashtags, tags:: metadata, task markers, aliases, code blocks, and indentation.',
        'Return the full corrected note and nothing else.',
        '',
        '${text}'
    ].join('\n'),
    temperature: 0
};

export function activateLlmActions(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('zma.runLlmAction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection) || '';

        const config = loadLlmConfig();
        if (!config) {
            vscode.window.showErrorMessage('LLM configuration not found. Create llm-config.json in workspace root.');
            return;
        }

        const actions = loadLlmActions();
        if (actions.length === 0) {
            vscode.window.showErrorMessage('No LLM actions found');
            return;
        }

        const selectedAction = await vscode.window.showQuickPick(
            actions.map(action => ({
                label: action.name,
                description: action.description,
                action: action
            })),
            { placeHolder: 'Select an LLM action' }
        );

        if (!selectedAction) { return; }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running ${selectedAction.label}...`,
            cancellable: false
        }, async () => {
            try {
                const result = await runLlmAction(config, selectedAction.action, text);
                editor.edit(editBuilder => {
                    editBuilder.replace(selection, result);
                });
            } catch (error: unknown) {
                vscode.window.showErrorMessage(`LLM Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    });
    context.subscriptions.push(disposable);

    const spellCheckDisposable = vscode.commands.registerCommand('zma.spellCheck', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const config = loadLlmConfig();
        if (!config) {
            vscode.window.showErrorMessage('LLM configuration not found. Create llm-config.json in workspace root.');
            return;
        }

        const action = loadSpellCheckAction();
        const document = editor.document;
        const text = document.getText();
        const fullDocumentRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Running Spell Check...',
            cancellable: false
        }, async () => {
            try {
                const result = await runLlmAction(config, action, text);
                await editor.edit(editBuilder => {
                    editBuilder.replace(fullDocumentRange, result);
                });
            } catch (error: unknown) {
                vscode.window.showErrorMessage(`LLM Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    });
    context.subscriptions.push(spellCheckDisposable);
}

export async function runLlmAction(
    config: LlmClientConfig,
    action: LlmAction,
    text: string
): Promise<string> {
    let processedText = text;
    if (action.cleanHtml) {
        processedText = cleanHtmlForMarkdown(text);
    }
    const clientConfig: LlmClientConfig = {
        ...config,
        model: action.model ?? config.model,
        temperature: action.temperature ?? config.temperature,
        maxTokens: action.maxTokens ?? config.maxTokens
    };
    const client = new LlmClient(clientConfig);
    const messages: LlmMessage[] = [
        {
            role: 'system',
            content: action.systemPrompt
        },
        {
            role: 'user',
            content: action.userPromptTemplate
                ? action.userPromptTemplate.replace('${text}', processedText)
                : processedText
        }
    ];
    return await client.complete(messages);
}

export function loadLlmConfig(): LlmClientConfig | null {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        return null;
    }
    const configPath = path.join(folder, 'llm-config.json');
    if (!fs.existsSync(configPath)) {
        const exampleConfig: LlmClientConfig = {
            baseUrl: 'http://localhost:11434/v1',
            apiKey: 'optional-api-key',
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
        const expandAction: LlmAction = {
            name: 'Expand Notes',
            description: 'Expand brief notes into detailed explanations',
            systemPrompt: 'You are a helpful assistant that expands brief notes into clear, detailed explanations while maintaining the original meaning.',
            userPromptTemplate: 'Expand these notes into a more detailed explanation:\n\n${text}',
            temperature: 0.7
        };
        const summarizeCleanedHtmlAction: LlmAction = {
            name: 'Summarize Cleaned HTML',
            description: 'Clean HTML then summarize with LLM',
            systemPrompt: 'You are a helpful assistant that summarizes text concisely.',
            userPromptTemplate: 'Summarize the following content:\n\n${text}',
            cleanHtml: true
        };
        const openaiAction: LlmAction = {
            name: 'Summarize with OpenAI',
            description: 'Summarize using the OpenAI gpt-4 model',
            systemPrompt: 'You are a helpful assistant that summarizes text concisely.',
            userPromptTemplate: 'Please summarize the following text:\n\n${text}',
            model: 'gpt-4'
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
            path.join(actionsPath, 'expand-notes.json'),
            JSON.stringify(expandAction, null, 2)
        );
        fs.writeFileSync(
            path.join(actionsPath, 'summarize-cleaned-html.json'),
            JSON.stringify(summarizeCleanedHtmlAction, null, 2)
        );
        fs.writeFileSync(
            path.join(actionsPath, 'summarize-openai.json'),
            JSON.stringify(openaiAction, null, 2)
        );
    }
    ensureSpellCheckAction(actionsPath);
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

function loadSpellCheckAction(): LlmAction {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        return defaultSpellCheckAction;
    }
    const actionsPath = path.join(folder, 'llm-actions');
    fs.mkdirSync(actionsPath, { recursive: true });
    const actionPath = ensureSpellCheckAction(actionsPath);
    try {
        const actionData = fs.readFileSync(actionPath, 'utf8');
        return JSON.parse(actionData) as LlmAction;
    } catch (error: unknown) {
        console.error(`Failed to load action ${spellCheckActionFileName}:`, error);
        return defaultSpellCheckAction;
    }
}

function ensureSpellCheckAction(actionsPath: string): string {
    const actionPath = path.join(actionsPath, spellCheckActionFileName);
    if (!fs.existsSync(actionPath)) {
        fs.writeFileSync(
            actionPath,
            JSON.stringify(defaultSpellCheckAction, null, 2) + '\n'
        );
    }
    return actionPath;
}
