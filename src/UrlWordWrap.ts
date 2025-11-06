import * as vscode from 'vscode';

/**
 * Configures the editor to prevent URLs from being wrapped when word wrap is enabled.
 * This is done by setting the editor's word break characters to exclude URL-related characters.
 */
export function activateUrlWordWrap(context: vscode.ExtensionContext) {
  // Apply URL-aware word wrap settings for markdown files
  const applyUrlWordWrapSettings = () => {
    const config = vscode.workspace.getConfiguration('editor', { languageId: 'markdown' });
    
    // Get current word wrap setting
    const wordWrap = config.get<string>('wordWrap');
    
    // Only apply if word wrap is enabled
    if (wordWrap && wordWrap !== 'off') {
      // Configure word separators to exclude URL characters
      // This prevents VS Code from breaking URLs at slashes, colons, etc.
      config.update(
        'wordSeparators',
        '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>?',
        vscode.ConfigurationTarget.Global
      );
    }
  };

  // Apply settings on activation
  applyUrlWordWrapSettings();

  // Re-apply when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('editor.wordWrap')) {
        applyUrlWordWrapSettings();
      }
    })
  );
}
