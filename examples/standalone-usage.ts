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
      
      // Example: Show tasks
      console.log('\nActive Tasks:');
      index.allActiveTasks().forEach(task => {
        console.log(`  - ${task.taskWithoutState} (${task.state})`);
      });
      
      // Example: Show link locations with their types
      console.log('\nLink Locations:');
      index.linkLocations().slice(0, 10).forEach(ll => { // Show first 10
        console.log(`  - ${ll.link.linkName()} (${ll.type}) in ${ll.location.link.linkName()}`);
      });
      
    } else {
      console.log('Index not ready');
    }
    
  } catch (error) {
    console.error('Error during reindexing:', error);
  }
}

// Example function to create a simple test workspace
async function createTestWorkspace() {
  const fs = require('fs/promises');
  const path = require('path');
  
  const workspacePath = './test-workspace';
  const pagesPath = path.join(workspacePath, 'pages');
  
  try {
    await fs.mkdir(pagesPath, { recursive: true });
    
    // Create a sample markdown file
    const sampleContent = `# Test Note

This is a [[sample link]] to another note.

- TODO Write more content
- DOING Review the #documentation
- DONE Create test workspace

Another [[important link]] here.
`;
    
    await fs.writeFile(path.join(pagesPath, 'test-note.md'), sampleContent);
    
    console.log('Test workspace created at:', workspacePath);
  } catch (error) {
    console.error('Error creating test workspace:', error);
  }
}

// Run the example
if (require.main === module) {
  // Uncomment the next line to create a test workspace first
  // createTestWorkspace().then(() => main()).catch(console.error);
  
  main().catch(console.error);
}

export { main, createTestWorkspace };
