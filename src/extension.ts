import * as vscode from 'vscode';
import { sharedAutocomplete as sharedAutocomplete } from './Autocomplete';
import { BacklinkProvider } from './BacklinksExplorer';
import { activateCommands } from './Commands';
import { activateKeyboardShortcuts } from './KeyboardShortcuts';
import { activateListEditing } from './ListEditing';
import { onSavedFile } from './LastEditHandler';
import { activateCodeFormatter } from './MarkdownFormatter';
import { activateDefinitionProvider } from './DefinitionProvider';
import { activateReferenceProvider } from './ReferenceProvider';
import { activateDecorator } from './Decorators';
import { HashTagProvider } from './HashtagExplorer';
import { TextDocumentContentChangeEvent } from 'vscode';
import { activateDocumentSymbolProvider } from './SymbolProvidor';
import { activateTodayIndicator } from './TodayIndicator';
import { activateTasks } from './Tasks';
import { processMdFile, reindex2, sharedIndex2 } from './Index2';
import { activateCliActions } from './CliAction';
import { activateLlmActions } from './LlmActions';
import { registerMarkdownInlineUrlFold } from './MarkdownLinkFolder';
import { activateInsertDocument } from './InsertDocument';
import { activateAutoTagging } from './AutoTagging';
import { McpNotesServer } from './mcp/McpNotesServer';

let mcpServer: McpNotesServer | null = null;

export async function activate(context: vscode.ExtensionContext) {

  await ensurePagesFolderAndIntroduction(context);

  await reindex2();

  // Start MCP server
  mcpServer = new McpNotesServer();
  try {
    await mcpServer.start();
  } catch (error) {
    console.error('[MCP] Failed to start server:', error);
  }

  activateListEditing(context);
  activateKeyboardShortcuts(context);
  activateCodeFormatter(context);
  activateDefinitionProvider(context);
  activateReferenceProvider(context);
  activateDecorator(context);
  activateDocumentSymbolProvider(context);
  activateTodayIndicator();
  activateCliActions(context);
  activateLlmActions(context);
  activateAutoTagging(context);
  activateInsertDocument(context);
  registerMarkdownInlineUrlFold(context);

  context.subscriptions.push(vscode.commands.registerCommand('zma.introduction', () => ensurePagesFolderAndIntroduction(context)));

  const backlinkProvider = new BacklinkProvider();
  vscode.window.registerTreeDataProvider('pageBacklinks', backlinkProvider);

  const hashtagNodeProvider = new HashTagProvider();
  vscode.window.registerTreeDataProvider('pageHashtags', hashtagNodeProvider);

  const taskProvider = activateTasks();

  activateCommands(context, () => {
    backlinkProvider.refresh();
    hashtagNodeProvider.refresh();
    taskProvider.refresh();
  });

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown' },
      {
        provideCompletionItems(
          document: vscode.TextDocument,
          position: vscode.Position
        ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
          return new vscode.CompletionList(sharedAutocomplete(document, position), true);
        }
      }
    )
  );

  vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
    await linkToMarkdownConversion(event)
  });

  async function linkToMarkdownConversion(event: vscode.TextDocumentChangeEvent): Promise<void> {
    const change: TextDocumentContentChangeEvent = event.contentChanges[0];
    if (!change || !change.text) {
      return;
    }
    const textChanged = change.text;

    if (textChanged.length < 10 || !textChanged.trim().startsWith('http')) {
      return;
    }

    try {
      new URL(textChanged);
    } catch {
      return;
    }

    const url = textChanged.trim();
    const currentSelection = vscode.window.activeTextEditor!.selection;
    const curserPosition = vscode.window.activeTextEditor!.selection.active;


    if (currentSelection.isEmpty === false) {
      const selectedText = vscode.window.activeTextEditor?.document.getText(currentSelection);
      const newText = `[${selectedText}](${url})`;

      await vscode.window.activeTextEditor?.edit((editBuilder) => {
        editBuilder.delete(new vscode.Range(curserPosition.line, 0, curserPosition.line, textChanged.length));
        editBuilder.replace(currentSelection, newText);
      });
    } else {
      const titleMatch = (await Promise.race([
        fetch(url)
          .then((response) => response.text())
          .then((html) => html.match(/<title>(.*?)<\/title>/i))
          .catch((e) => {
            console.log('fetch error', e);
          }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ])) as RegExpMatchArray | null;
      const title = titleMatch ? titleMatch[1] : url.replace(/https?:\/\//, '');
      const newText = `[${title}](${url})`;
      await vscode.window.activeTextEditor?.edit((editBuilder) => {
        editBuilder.delete(new vscode.Range(curserPosition.line, 0, curserPosition.line, textChanged.length));
        editBuilder.insert(curserPosition || new vscode.Position(0, 0), newText);
      });

      const startPosition = new vscode.Position(curserPosition.line, 1);
      const endPosition = new vscode.Position(curserPosition.line, title.length + 1);
      const newSelection = new vscode.Selection(startPosition, endPosition);
      vscode.window.activeTextEditor!.selection = newSelection;
    }
  }

  vscode.workspace.onDidSaveTextDocument(async (document) => {
    onSavedFile(document);

    const fileContent = document.getText();
    const filePath = document.uri.fsPath;

    const zmaFile = await processMdFile(fileContent, filePath);
    sharedIndex2().addFile(zmaFile);

    backlinkProvider.refresh();
    hashtagNodeProvider.refresh();
    taskProvider.refresh();
  });
}

export async function deactivate() {
  if (mcpServer) {
    await mcpServer.stop();
  }
}

async function ensurePagesFolderAndIntroduction(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }
  const workspaceRoot = workspaceFolders[0].uri;
  const pagesFolderPath = vscode.Uri.joinPath(workspaceRoot, 'pages');
  const introductionFilePath = vscode.Uri.joinPath(pagesFolderPath, 'introduction.md');

  try {
    await vscode.workspace.fs.stat(pagesFolderPath);
  } catch (error: any) {
    if (error.code === 'FileNotFound') {
      await vscode.workspace.fs.createDirectory(pagesFolderPath);
      const introductionContent = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'media', 'introduction.md'));
      await vscode.workspace.fs.writeFile(introductionFilePath, introductionContent);
      vscode.window.showInformationMessage('Created "pages" folder and "introduction.md"');
      const document = await vscode.workspace.openTextDocument(introductionFilePath);
      await vscode.window.showTextDocument(document);
    } else {
      console.error('Error checking or creating pages folder:', error);
    }
  }
}