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

  function updateStatusBarItem(editor: vscode.TextEditor | undefined) {
    if (editor) {
      if (isTodayFile(editor)) {
        statusBarItem.text = `$(calendar)`;
        statusBarItem.tooltip = `Today's file`;
        statusBarItem.color = '#22c55e';
        statusBarItem.backgroundColor = undefined;
      } else {
        statusBarItem.text = `$(calendar)`;
        statusBarItem.tooltip = `Not today's file`;
        statusBarItem.color = '#ef4444';
        statusBarItem.backgroundColor = undefined;
      }

      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  }

  // Initial check
  updateStatusBarItem(vscode.window.activeTextEditor);

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    updateStatusBarItem(editor);
  });

  let flashTimeout: string | number | NodeJS.Timeout | undefined;

  function flashEffect() {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground'); 
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => {
      statusBarItem.backgroundColor = undefined;
    }, 100);
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
