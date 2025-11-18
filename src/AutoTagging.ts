import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { sharedIndex2 } from './Index2';
import { Link } from './Link';
import { LinkLocation } from './LinkLocation';
import { LlmClient, LlmClientConfig, LlmMessage } from './LlmClient';
import { loadLlmConfig } from './LlmActions';
import { RegexPatterns } from './RegexPatterns';

interface AutoTagAction {
    systemPrompt: string | string[];
    userPromptTemplate: string | string[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export function activateAutoTagging(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('zma.autoTagLink', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        let linkName: string | null = null;

        if (!selection.isEmpty) {
            linkName = editor.document.getText(selection);
        } else {
            const range = editor.document.getWordRangeAtPosition(selection.active, /\[\[([^\]]+)\]\]/);
            if (range) {
                const text = editor.document.getText(range);
                const match = text.match(/\[\[([^\]]+)\]\]/);
                if (match) {
                    linkName = match[1];
                }
            } else {
                const filePath = editor.document.uri.fsPath;
                const link = Link.fromFilePath(filePath);
                linkName = link.linkName();
            }
        }

        if (!linkName) {
            vscode.window.showErrorMessage('Could not determine link to tag');
            return;
        }

        // Clean up link name (remove brackets if present)
        linkName = linkName.replace(/^\[\[|\]\]$/g, '');

        await autoTagLink(linkName);
    });

    context.subscriptions.push(disposable);
}

async function autoTagLink(linkName: string) {
    const index = sharedIndex2();
    const linkLocations = index.linkLocations().filter(ll => ll.link.linkName() === linkName);

    if (linkLocations.length === 0) {
        vscode.window.showInformationMessage(`No occurrences found for link: ${linkName}`);
    }

    const contexts: string[] = [];
    for (const ll of linkLocations) {
        const sourceLink = ll.location.link;
        const context = ll.context.fullContext;

        if (context) {
            contexts.push(`File: ${sourceLink.linkName()}\nContext:\n${context}`);
        }
    }

    const config = loadLlmConfig();
    if (!config) {
        vscode.window.showErrorMessage('LLM configuration not found. Create llm-config.json in workspace root.');
        return;
    }

    const action = loadAutoTagAction();

    const systemPrompt = Array.isArray(action.systemPrompt) ? action.systemPrompt.join('\n') : action.systemPrompt;
    const userPromptTemplate = Array.isArray(action.userPromptTemplate) ? action.userPromptTemplate.join('\n') : action.userPromptTemplate;

    const contextText = contexts.join('\n\n---\n\n');
    const prompt = userPromptTemplate.replace('${linkName}', linkName).replace('${context}', contextText);

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Generating tags for ${linkName}...`,
        cancellable: false
    }, async () => {
        try {
            const client = new LlmClient({
                ...config,
                model: action.model ?? config.model,
                temperature: action.temperature ?? config.temperature,
                maxTokens: action.maxTokens ?? config.maxTokens
            });

            const messages: LlmMessage[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ];

            const response = await client.complete(messages);
            const tags = parseTags(response);

            if (tags.length > 0) {
                await applyTags(linkName, tags);
                vscode.window.showInformationMessage(`Added tags to ${linkName}: ${tags.join(', ')}`);
            } else {
                vscode.window.showInformationMessage(`No tags generated for ${linkName}`);
            }

        } catch (error: unknown) {
            vscode.window.showErrorMessage(`Auto-tagging failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}

function loadAutoTagAction(): AutoTagAction {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    const defaultAction: AutoTagAction = {
        systemPrompt: [
            'You are a helpful assistant that suggests tags for a given topic based on its context.',
            'Output ONLY a comma-separated list of tags.',
            'Do not include explanations.'
        ],
        userPromptTemplate: [
            'Topic: ${linkName}',
            '',
            'Contexts where this topic appears:',
            '${context}',
            '',
            'Suggest 3-5 relevant tags for this topic.',
            'Format: tag1, tag2, tag3'
        ]
    };

    if (!folder) return defaultAction;

    const actionsPath = path.join(folder, 'llm-actions');
    const actionFile = path.join(actionsPath, 'auto-tag.json');

    if (!fs.existsSync(actionsPath)) {
        fs.mkdirSync(actionsPath, { recursive: true });
    }

    if (!fs.existsSync(actionFile)) {
        fs.writeFileSync(actionFile, JSON.stringify(defaultAction, null, 2));
        return defaultAction;
    }

    try {
        const data = fs.readFileSync(actionFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load auto-tag action:', error);
        return defaultAction;
    }
}

function parseTags(response: string): string[] {
    // Remove any "Tags:" prefix or markdown code blocks
    let cleanResponse = response.replace(/^Tags:\s*/i, '').replace(/```/g, '').trim();
    return cleanResponse.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

async function applyTags(linkName: string, newTags: string[]) {
    const index = sharedIndex2();
    const file = index.allFiles().find(f => f.link.linkName() === linkName);

    if (!file) {
        // File doesn't exist, maybe create it? 
        // Or maybe the link exists but the file doesn't.
        // For now, only tag existing files.
        vscode.window.showWarningMessage(`File for ${linkName} not found. Cannot add tags.`);
        return;
    }

    const uri = vscode.Uri.file(file.link.filePath());
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();

    // Check for existing tags
    const tagMatch = text.match(RegexPatterns.RE_TAGS());
    let newText = text;

    if (tagMatch) {
        const existingTags = tagMatch[1].split(',').map(t => t.trim());
        const allTags = Array.from(new Set([...existingTags, ...newTags]));
        const tagsLine = `tags:: ${allTags.join(', ')}`;
        newText = text.replace(RegexPatterns.RE_TAGS(), tagsLine);
    } else {
        const tagsLine = `tags:: ${newTags.join(', ')}`;
        newText = `${tagsLine}\n${text}`;
    }

    if (newText !== text) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), newText);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }
}
