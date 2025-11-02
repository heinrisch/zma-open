/**
 * Example of using Index2 outside of VSCode
 * This demonstrates how to use the abstracted Index2 with Node.js adapters
 */

import { reindex2, sharedIndex2, isIndexReady } from '../src/Index2';
import { createNodeAdapters } from '../src/adapters/NodeAdapter';
import * as path from 'path';

async function main() {
  // Set up the workspace path (adjust to your actual workspace)
  const workspacePath = path.resolve('./test-workspace');
  
  console.log(`Using workspace: ${workspacePath}`);
  
  // Create the Node.js adapters
  const { fs, workspace } = createNodeAdapters(workspacePath);
  
  try {
    // Run the reindexing process
    console.log('Starting reindex...');
    await reindex2(fs, workspace);
    
    if (isIndexReady()) {
      const index = sharedIndex2();
      
      // Use the index
      console.log(`\nIndex completed successfully!`);
      console.log(`Found ${index.allFiles().length} files`);
      console.log(`Found ${index.linkLocations().length} link locations`);
      console.log(`Found ${index.allActiveTasks().length} active tasks`);
      
      // Example: List all files
      console.log('\nFiles:');
      index.allFiles().forEach(file => {
        console.log(`  - ${file.link.linkName()}`);
      });
      
      // Example: List all links
      console.log('\nLinks:');
      index.allLink().forEach(link => {
        console.log(`  - ${link.linkName()}`);
      });
      
    } else {
      console.log('Index not ready');
    }
    
  } catch (error) {
    console.error('Error during reindexing:', error);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
