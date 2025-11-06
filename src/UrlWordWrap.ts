import * as vscode from 'vscode';

/**
 * VS Code's word wrap implementation breaks at certain characters including '/' and ':'
 * which are common in URLs. This is hardcoded behavior that cannot be customized via
 * the extension API.
 * 
 * This module provides:
 * 1. A command to quickly toggle word wrap (in addition to Alt+Z)
 * 2. Configuration to set markdown to use 'off' or 'bounded' word wrap by default
 */
export function activateUrlWordWrap(context: vscode.ExtensionContext) {
  // Register command to toggle word wrap
  const toggleWordWrapCommand = vscode.commands.registerCommand(
    'zma.toggleWordWrap',
    () => {
      const config = vscode.workspace.getConfiguration('editor');
      const currentWrap = config.get<string>('wordWrap');
      const newWrap = currentWrap === 'off' ? 'on' : 'off';
      
      config.update('wordWrap', newWrap, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Word wrap: ${newWrap}`);
    }
  );

  context.subscriptions.push(toggleWordWrapCommand);

  // Configure default settings for markdown to minimize URL issues
  configureMarkdownDefaults();
}

function configureMarkdownDefaults() {
  const config = vscode.workspace.getConfiguration();
  const markdownConfig = config.get('[markdown]') as any;
  
  // Only set if user hasn't configured it
  if (!markdownConfig || !markdownConfig['editor.wordWrap']) {
    // Disable word wrap for markdown by default to prevent URL breaking
    config.update(
      '[markdown]',
      { 'editor.wordWrap': 'off' },
      vscode.ConfigurationTarget.Global
    );
  }
}
