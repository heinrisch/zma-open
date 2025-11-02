import * as vscode from 'vscode';
import { FileSystemAdapter, WorkspaceAdapter, FileType } from '../Index2';

/**
 * VSCode implementation of FileSystemAdapter
 */
export class VscodeFileSystemAdapter implements FileSystemAdapter {
  async saveAll(): Promise<void> {
    await vscode.workspace.saveAll();
  }

  async readDirectory(uri: string): Promise<[string, FileType][]> {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(uri));
    return entries.map(([name, type]) => [name, type as FileType]);
  }

  async readFile(uri: string): Promise<Uint8Array> {
    return await vscode.workspace.fs.readFile(vscode.Uri.file(uri));
  }

  async writeFile(uri: string, content: Uint8Array): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(uri), content);
  }

  joinPath(base: string, ...paths: string[]): string {
    return vscode.Uri.joinPath(vscode.Uri.file(base), ...paths).fsPath;
  }

  async showErrorMessage(message: string): Promise<void> {
    await vscode.window.showErrorMessage(message);
  }

  async executeCommand(command: string): Promise<void> {
    await vscode.commands.executeCommand(command);
  }
}

/**
 * VSCode implementation of WorkspaceAdapter
 */
export class VscodeWorkspaceAdapter implements WorkspaceAdapter {
  get workspaceFolders() {
    return vscode.workspace.workspaceFolders;
  }

  getWorkspacePath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    if (workspaceFolders.length > 1) {
      // Handle multiple workspaces - could throw error or return first
      return null;
    }

    return workspaceFolders[0].uri.fsPath;
  }
}