import * as vscode from 'vscode';

function getTodayFileName() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}.md`;
}

export function activateTodayIndicator() {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -10000);
  statusBarItem.text = `Today?`; // Customize this text as needed
  statusBarItem.tooltip = `You are on the file for today`;

  function isTodayFile(editor: vscode.TextEditor): boolean {
    const currentFile = editor.document.fileName.split('/').slice(-1)[0];
    const today = getTodayFileName(); // Some function to get today's file
    return today === currentFile;
  }

  // Example logic: Update when the active editor changes
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      if (isTodayFile(editor)) {
        statusBarItem.text = `📅 Today`;
        statusBarItem.backgroundColor = undefined; // Default color
      } else {
        statusBarItem.text = `❌ Not Today`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground'); 
      }

      statusBarItem.show();
    }
  });

  let flashTimeout: string | number | NodeJS.Timeout | undefined;

  function flashEffect() {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground'); 
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground'); // Reset color
    }, 50);
  }

  vscode.workspace.onDidChangeTextDocument(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (!isTodayFile(editor)) {
        flashEffect();
      }
    }
  });
}
