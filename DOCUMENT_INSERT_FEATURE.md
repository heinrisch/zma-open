# Document Insert Feature

This feature allows you to easily insert documents into your ZMA workspace with streamlined input and automatic linking.

## How to Use

### Command
- **Command**: `ZMA: Insert Document`
- **Keyboard Shortcut**: `Ctrl+K I` (Windows/Linux) or `Cmd+K I` (Mac)
- **Command Palette**: Search for "ZMA: Insert Document"

### Workflow

When you trigger the command, you'll go through a sequential input process:

1. **Title** (required): The document title
2. **URL** (optional): Source URL if the document comes from a web source
3. **Content** (required): The actual document content
4. **CLI Action** (optional): Select from available CLI actions to process the content

### Features

#### Streamlined Input
- All fields are collected in sequence with a unified interface
- Step counter shows progress (1/4, 2/4, etc.)
- Validation ensures required fields are filled
- Can be cancelled at any step

#### Smart File Creation
- Creates a `docs/` folder in your workspace if it doesn't exist
- Generates a filename based on the title (lowercase, hyphenated)
- Stores **only the content** in the markdown file (no headers or metadata)

#### Automatic Linking
- **Inserts a link to the created document at your cursor position**
- Uses relative path from current file to the document
- Link format: `[Document Title](docs/filename.md)`
- Works from any file in your workspace

#### CLI Action Integration
- Integrates with existing ZMA CLI actions from the `cli-actions/` folder
- Can process content before saving (e.g., summarize, clean HTML, etc.)
- Supports pre-processing steps and HTML cleaning

### Example Use Cases

1. **Reference while writing**: Create a document and immediately reference it in your current note
2. **Web article extraction**: Save an article's content and link to it from your research notes
3. **Quick knowledge capture**: Store information and create instant references
4. **Content processing**: Clean and process content before linking

### Workflow Example

1. You're writing in `research-notes.md`
2. Trigger `Ctrl+K I`
3. Enter:
   - Title: "AI Safety Research Paper"
   - URL: "https://example.com/paper"
   - Content: [paste paper content]
   - CLI Action: "Summarize"
4. System creates `docs/ai-safety-research-paper.md` with processed content
5. Inserts `[AI Safety Research Paper](docs/ai-safety-research-paper.md)` at your cursor
6. Continue writing with the link in place

### File Structure

**Created file** (`docs/filename.md`):
```
[Only the processed content - no headers or metadata]
```

**Link inserted at cursor**:
```markdown
[Document Title](docs/filename.md)
```

### CLI Actions

The feature reuses your existing CLI actions. Make sure you have CLI actions configured in your `cli-actions/` folder if you want to process content during insertion.

Example CLI actions that work well:
- Summarization
- HTML cleaning
- Text formatting
- Translation
- Content extraction

### Implementation Details

- Files are created in the `docs/` directory
- Filenames are automatically sanitized and hyphenated
- Only content is stored (no metadata headers)
- Link uses relative path from current file
- Temporary files are cleaned up after CLI action processing
- Works regardless of which file you're currently editing
