import * as vscode from 'vscode';
import { sharedIndex2 } from './Index2';
import { Link } from './Link';
import { getLastEdit } from './LastEditHandler';
import { LinkLocation, LinkType } from './LinkLocation';
import { loadLlmConfig, runLlmAction, LlmAction } from './LlmActions';

export class ReferencesDocumentProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'zma-references';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    refresh(uri: vscode.Uri): void {
        this._onDidChange.fire(uri);
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const linkName = uri.path;
        return await this.generateMarkdown(linkName);
    }

    private async generateMarkdown(linkName: string): Promise<string> {
        const index = sharedIndex2();
        const link = Link.fromRawLink(linkName);

        let markdown = `# References: [[${linkName}]]\n\n`;

        // LLM Summary of Yesterday (if applicable)
        if (link.isDate()) {
            const date = link.getDate();
            if (date) {
                // Look backwards up to 31 days to find the most recent daily note
                for (let daysBack = 1; daysBack <= 31; daysBack++) {
                    const previousDay = new Date(date);
                    previousDay.setDate(date.getDate() - daysBack);

                    const previousDayString = previousDay.toISOString().slice(0, 10);
                    const previousDayLink = Link.fromRawLink(previousDayString);

                    if (previousDayLink.fileExists()) {
                        const summary = await this.getSummaryForFile(previousDayLink);
                        if (summary) {
                            markdown += `## Summary of [[${previousDayString}]]\n\n`;
                            markdown += `${summary}\n\n`;
                            markdown += `---\n\n`;
                        }
                        break; // Stop at the first found daily note
                    }
                }
            }
        }

        const aliases = index.alias(link.linkName());

        const graphChildren = aliases.flatMap(alias =>
            index.linkLocations().filter(ll => ll.link.linkName() === alias)
        );

        const relevantLinks = [...graphChildren].filter((ll: LinkLocation) => {
            return ll.location.link.linkName() !== link.linkName();
        });

        // Group by Source File
        const grouped = new Map<string, LinkLocation[]>();
        for (const ll of relevantLinks) {
            const sourceName = ll.location.link.linkName();
            const list = grouped.get(sourceName) || [];
            list.push(ll);
            grouped.set(sourceName, list);
        }

        // Sort files by last edit of that file
        const sortedfiles = Array.from(grouped.keys()).sort((a, b) => {
            const aLastEdit = getLastEdit(a);
            const bLastEdit = getLastEdit(b);
            return bLastEdit.getTime() - aLastEdit.getTime();
        });

        if (sortedfiles.length === 0 && markdown === `# References: [[${linkName}]]\n\n`) {
            return `_No references found for [[${linkName}]]_`;
        }

        for (const sourceName of sortedfiles) {
            const locs = grouped.get(sourceName)!;

            // File Header
            markdown += `## [[${sourceName}]]\n\n`;

            // Sort locations in file by row
            locs.sort((a, b) => a.location.row - b.location.row);

            for (const ll of locs) {
                const context = ll.context.fullContext.trim();
                markdown += `${context}\n\n`;
            }
            markdown += `\n`;
        }

        return markdown;
    }

    private async getSummaryForFile(link: Link): Promise<string | null> {
        try {
            const content = link.fileContent();
            if (!content) return null;

            const config = loadLlmConfig();
            if (!config) return null; // No LLM configured

            // Define a simple summary action on the fly or reuse one
            const action: LlmAction = {
                name: 'Summarize',
                description: 'Summarize daily note',
                systemPrompt: 'You are a helpful assistant that summarizes daily notes. Be concise and focus on key events and tasks.',
                userPromptTemplate: 'Please summarize the following daily note:\n\n${text}',
                maxTokens: 500
            };

            return await runLlmAction(config, action, content);
        } catch (e) {
            console.error('Error generating summary:', e);
            // Don't show error in UI to keep it clean, maybe just log it
            return null;
        }
    }
}

export function activateReferencesDocumentProvider(context: vscode.ExtensionContext) {
    const provider = new ReferencesDocumentProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(ReferencesDocumentProvider.scheme, provider)
    );
}
