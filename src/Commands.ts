import * as fs from 'fs';
import * as vscode from 'vscode';
import { Link } from './Link';
import { formatAllFiles } from './MarkdownFormatter';
import { createFileIfNotExists, quickOpenLink } from './QuickOpenLink';
import { quickOpenHref } from './QuickOpenHref';
import { remakeLastEditIndex } from './LastEditHandler';
import { reindex2 } from './Index2';

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
};
