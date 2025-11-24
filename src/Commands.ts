import * as fs from 'fs';
import * as vscode from 'vscode';
import { Link } from './Link';
import { formatAllFiles } from './MarkdownFormatter';
import { createFileIfNotExists, quickOpenLink } from './QuickOpenLink';
import { quickOpenHref } from './QuickOpenHref';
import { remakeLastEditIndex } from './LastEditHandler';
import { reindex2, sharedIndex2 } from './Index2';
import { getTagsForLink, setTagsForLink, removeTagsForLink, getAllTags } from './TagHandler';
import { RegexPatterns } from './RegexPatterns';
import { startMcpServerManual, stopMcpServer } from './McpServer';

export const activateCommands = (context: vscode.ExtensionContext, resetProviders: () => void) => {
  context.subscriptions.push(
    vscode.commands.registerCommand('zma.reindex', async () => {
      void vscode.window.setStatusBarMessage('Reindex zma', 5000);
      await reindex2();
      void vscode.window.setStatusBarMessage('Reindex done!', 5000);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.formatAllFiles', async () => {
      await formatAllFiles();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.today', async () => {
      const todayString = new Date().toISOString().slice(0, 10);
      const todayLink = Link.fromRawLink(todayString);

      const fileExists = fs.existsSync(todayLink.filePath());
      if (!fileExists) {
        const weather = await fetch('https://wttr.in/?format=3', { method: 'GET' })
          .then((response) => response.text())
          .catch((e) => {
            console.error(e);
            return 'failed to fetch weather';
          });

        const today_time = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        const day_time = new Date().toLocaleString("en", { weekday: "long" });
        fs.writeFileSync(todayLink.filePath(), `# ${todayString} ${today_time} ${day_time}\n# ${weather}\n\n# Meeting Notes\n\n`);
      }

      await vscode.workspace.openTextDocument(todayLink.filePath()).then(async (document) => {
        await vscode.window.showTextDocument(document);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.yesterday', async () => {
      const yesterday_string = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const yesterdayLink = Link.fromRawLink(yesterday_string);

      await vscode.workspace.openTextDocument(yesterdayLink.filePath()).then(async (document) => {
        await vscode.window.showTextDocument(document);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.openfile', async (uri, text, row, column) => {
      await createFileIfNotExists(uri);

      await vscode.workspace.openTextDocument(uri).then(async (document) => {
        await vscode.window.showTextDocument(document);

        if (text !== undefined) {
          const activeEditor = vscode.window.activeTextEditor!;
          const start = new vscode.Position(row, column + 1);
          const end = new vscode.Position(row, column + text.length + 1);
          activeEditor.selections = [new vscode.Selection(start, end)];
          activeEditor.revealRange(new vscode.Range(start, end));
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.refreshexplorers', () => {
      resetProviders();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.git.commitandpush', async () => {
      const today = new Date().toISOString();
      const commitMessage = `Committing changes for ${today}`;
      const gitCommands = [
        'find . -type f -empty -delete',
        'git add .',
        `git commit -m "${commitMessage}"`,
        'git push',
        'exit'
      ];

      const terminal = vscode.window.createTerminal();
      terminal.show();
      terminal.sendText(gitCommands.join(' && '));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.git.removeemptyfiles', async () => {
      const removeEmptyFilesCommands = ['find . -type f -empty -delete', 'exit'];

      const terminal = vscode.window.createTerminal();
      removeEmptyFilesCommands.forEach(async (command) => {
        terminal.sendText(command);
      });
      terminal.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.quickOpenLink', async () => {
      await quickOpenLink();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.quickOpenHref', async () => {
      await quickOpenHref();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.remake.lastedit', async () => {
      await remakeLastEditIndex();
    })
  );

  // Clean selected text according to zma rules
  context.subscriptions.push(
    vscode.commands.registerCommand('zma.cleanSelectedText', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showInformationMessage('No active editor');
        return;
      }

      const document = editor.document;
      const selection = editor.selection;

      // If there's no selection, operate on the current line
      const range = selection.isEmpty
        ? document.lineAt(selection.active.line).range
        : new vscode.Range(selection.start, selection.end);

      const original = document.getText(range);


      const cleaned = cleanLinkTitle(original);

      await editor.edit((eb) => {
        eb.replace(range, cleaned);
      });
    })
  );

  // Tag management commands
  context.subscriptions.push(
    vscode.commands.registerCommand('zma.addTagsToCurrentLink', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showInformationMessage('No active editor');
        return;
      }

      const document = editor.document;
      const filePath = document.fileName;
      const link = Link.fromFilePath(filePath);
      const linkName = link.linkName();

      const existingTags = getTagsForCurrentLink(document);

      const tagsInput = await vscode.window.showInputBox({
        prompt: 'Enter tags (comma-separated)',
        value: existingTags.join(', '),
        placeHolder: 'tag1, tag2, tag3'
      });

      if (tagsInput === undefined) {
        return; // User cancelled
      }

      const newTags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

      await updateTagsInFile(document, newTags);

      if (!link.fileExists()) {
        setTagsForLink(linkName, newTags);
      }

      void vscode.window.showInformationMessage(`Tags updated for ${linkName}`);
    })
  );

  // MCP Server commands
  context.subscriptions.push(
    vscode.commands.registerCommand('zma.mcp.start', async () => {
      await startMcpServerManual(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zma.mcp.stop', async () => {
      await stopMcpServer();
    })
  );

};

export function cleanLinkTitle(input: string): string {
  let s = input;

  // Collapse multiple slashes into a single '/'
  s = s.replace(/\/\/{2,}/g, '/');

  // If pattern [AAA] BBB (leading spaces allowed), convert to "AAA - BBB"
  const m = s.match(/^\s*\[([^\]]+)\]\s*(.*)$/s);
  if (m) {
    let a = m[1];
    let b = m[2];
    // remove any remaining brackets/parentheses
    a = a.replace(/[\[\]\(\)]/g, '');
    b = b.replace(/[\[\]\(\)]/g, '');
    // remove commas, periods and apostrophes
    a = a.replace(/[,\.']/g, '');
    b = b.replace(/[,\.']/g, '');
    // collapse slashes then convert to hyphens
    a = a.replace(/\/\/{2,}/g, '/').replace(/\//g, '-');
    b = b.replace(/\/\/{2,}/g, '/').replace(/\//g, '-');
    a = a.replace(/\s+/g, ' ').trim();
    b = b.replace(/\s+/g, ' ').trim();
    return `${a} - ${b}`;
  }

  // General cleaning for non-bracketed text
  s = s.replace(/[\[\]\(\)]/g, '');
  s = s.replace(/[,\.']/g, '');
  s = s.replace(/\/\/{2,}/g, '/');
  s = s.replace(/\//g, '-');
  s = s.replace(/\s+/g, ' ').trim();
  // normalize spacing around hyphens
  s = s.replace(/\s*-\s*/g, ' - ');

  return s;
}

function getTagsForCurrentLink(document: vscode.TextDocument): string[] {
  const content = document.getText();
  const tagMatches = content.match(RegexPatterns.RE_TAGS());

  if (tagMatches && tagMatches.length > 0) {
    const tagsString = tagMatches[0].replace(/^tags::\s*/, '');
    return tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  return [];
}

async function updateTagsInFile(document: vscode.TextDocument, tags: string[]): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const content = document.getText();

  const tagsHeader = `tags:: ${tags.join(', ')}`;

  // Check if tags:: header already exists
  const existingTagsMatch = content.match(RegexPatterns.RE_TAGS());

  if (existingTagsMatch) {
    // Find the line with tags::
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(RegexPatterns.RE_TAGS())) {
        const range = new vscode.Range(
          new vscode.Position(i, 0),
          new vscode.Position(i, lines[i].length)
        );
        edit.replace(document.uri, range, tagsHeader);
        break;
      }
    }
  } else {
    // Add tags:: header at the beginning
    const position = new vscode.Position(0, 0);
    edit.insert(document.uri, position, tagsHeader + '\n');
  }

  await vscode.workspace.applyEdit(edit);
  await document.save();
}

function getLinksWithTag(tag: string): string[] {
  const links: string[] = [];

  // Check files
  sharedIndex2().allFiles().forEach(file => {
    if (file.tags.includes(tag)) {
      links.push(file.link.linkName());
    }
  });

  return links;
}
