import { reindex2 as reindex2Core } from './Index2';
import { VscodeFileSystemAdapter, VscodeWorkspaceAdapter } from './adapters/VscodeAdapter';


export async function reindex2() {
  const fsAdapter = new VscodeFileSystemAdapter();
  const workspaceAdapter = new VscodeWorkspaceAdapter();
  
  return await reindex2Core(fsAdapter, workspaceAdapter);
}

export * from './Index2';
