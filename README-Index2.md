# Index2 VSCode Dependency Removal

This branch removes the direct VSCode dependency from the Index2 file, making it usable outside of VSCode while maintaining full backward compatibility.

## Changes Made

### Core Changes

**src/Index2.ts**
- Removed direct `vscode` import
- Added `FileSystemAdapter` and `WorkspaceAdapter` interfaces
- Updated `reindex2()` function to accept adapter parameters
- All file operations now go through adapter interfaces

### Adapter Implementations

**src/adapters/VscodeAdapter.ts**
- `VscodeFileSystemAdapter`: Wraps VSCode workspace APIs
- `VscodeWorkspaceAdapter`: Handles VSCode workspace operations
- Maintains exact same behavior as original implementation

**src/adapters/NodeAdapter.ts**
- `NodeFileSystemAdapter`: Uses Node.js `fs/promises` API
- `NodeWorkspaceAdapter`: Simple workspace path management
- `createNodeAdapters()`: Convenience function for setup

### Backward Compatibility

**src/Index2Compat.ts**
- Maintains original `reindex2()` function signature
- Existing VSCode extension code works unchanged
- Simply import from `Index2Compat` instead of `Index2`

## Usage

### For VSCode Extension (Existing Code)

```typescript
// Change this:
import { reindex2 } from './Index2';

// To this:
import { reindex2 } from './Index2Compat';

// Everything else stays the same
await reindex2();
```

### For Standalone Applications

```typescript
import { reindex2, sharedIndex2 } from './Index2';
import { createNodeAdapters } from './adapters/NodeAdapter';

const { fs, workspace } = createNodeAdapters('/path/to/workspace');
await reindex2(fs, workspace);

const index = sharedIndex2();
console.log(`Found ${index.allFiles().length} files`);
```

## Benefits

- **Zero Breaking Changes**: Existing VSCode extension code works unchanged
- **Standalone Usage**: Can now be used in CLI tools, servers, etc.
- **Testability**: Easier to unit test with mock adapters
- **Flexibility**: Can be adapted to different environments
- **Clean Architecture**: Clear separation of concerns

## Example Use Cases

- **MCP Server**: Use as a Model Context Protocol server
- **CLI Tools**: Build command-line tools for note management
- **Web Servers**: Create web APIs for note data
- **Testing**: Write comprehensive unit tests with mock adapters
- **Desktop Apps**: Use in Electron or other desktop frameworks