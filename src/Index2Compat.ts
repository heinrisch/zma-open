/**
 * Compatibility wrapper for existing vscode usage of Index2
 * Maintains the original reindex2() function signature
 */

import { reindex2 as reindex2Core } from './Index2';
import { VscodeFileSystemAdapter, VscodeWorkspaceAdapter } from './adapters/VscodeAdapter';

/**
 * Original reindex2 function for VSCode extension compatibility
 * This maintains the existing API while using the new abstracted core
 */
export async function reindex2() {
  const fsAdapter = new VscodeFileSystemAdapter();
  const workspaceAdapter = new VscodeWorkspaceAdapter();
  
  return await reindex2Core(fsAdapter, workspaceAdapter);
}

// Re-export everything else from Index2 for compatibility
export * from './Index2';
