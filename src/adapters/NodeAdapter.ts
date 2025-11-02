import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSystemAdapter, WorkspaceAdapter, FileType } from '../Index2';

/**
 * Node.js implementation of FileSystemAdapter
 */
export class NodeFileSystemAdapter implements FileSystemAdapter {
  async readDirectory(uri: string): Promise<[string, FileType][]> {
    const entries = await fs.readdir(uri, { withFileTypes: true });
    return entries.map(entry => [
      entry.name,
      entry.isFile() ? FileType.File : FileType.Directory
    ]);
  }

  async readFile(uri: string): Promise<Uint8Array> {
    const content = await fs.readFile(uri);
    return new Uint8Array(content);
  }

  async writeFile(uri: string, content: Uint8Array): Promise<void> {
    await fs.writeFile(uri, content);
  }

  joinPath(base: string, ...paths: string[]): string {
    return path.join(base, ...paths);
  }

  async showErrorMessage(message: string): Promise<void> {
    console.error(message);
  }

  async executeCommand(command: string): Promise<void> {
    // No-op for standalone usage, or could emit events
    console.log(`Command executed: ${command}`);
  }
}

/**
 * Node.js implementation of WorkspaceAdapter
 */
export class NodeWorkspaceAdapter implements WorkspaceAdapter {
  constructor(private workspacePath: string) {}

  getWorkspacePath(): string | null {
    return this.workspacePath;
  }
}

/**
 * Convenience function to create Node.js adapters
 */
export function createNodeAdapters(workspacePath: string) {
  return {
    fs: new NodeFileSystemAdapter(),
    workspace: new NodeWorkspaceAdapter(workspacePath)
  };
}