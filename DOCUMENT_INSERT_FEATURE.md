# Document Insert Feature

This new feature allows you to easily insert documents into your ZMA workspace with structured metadata and optional CLI processing.

## How to Use

### Command
- **Command**: `ZMA: Insert Document`
- **Keyboard Shortcut**: `Ctrl+K I` (Windows/Linux) or `Cmd+K I` (Mac)
- **Command Palette**: Search for "ZMA: Insert Document"

### Workflow

When you trigger the command, you'll be prompted for:

1. **Title** (required): The document title
2. **URL** (optional): Source URL if the document comes from a web source
3. **Content** (required): The actual document content
4. **CLI Action** (optional): Select from available CLI actions to process the content

### Features

#### Automatic File Creation
- Creates a `docs/` folder in your workspace if it doesn't exist
- Generates a filename based on the title (lowercase, hyphenated)
- Creates a markdown file with structured metadata

#### Document Structure
The created document follows this structure:
```markdown
# [Title]

**Source:** [URL](URL)  # Only if URL provided

**Added:** YYYY-MM-DD HH:MM:SS

---

[Content]
```

#### CLI Action Integration
- Integrates with existing ZMA CLI actions from the `cli-actions/` folder
- Can process content before insertion (e.g., summarize, clean HTML, etc.)
- Supports pre-processing steps and HTML cleaning

### Example Use Cases

1. **Web Article**: Paste an article with URL, optionally summarize with AI
2. **Research Notes**: Insert research content with source attribution
3. **Documentation**: Add technical documentation with automated processing
4. **Content Curation**: Collect and process content from various sources

### CLI Actions

The feature reuses your existing CLI actions. Make sure you have CLI actions configured in your `cli-actions/` folder if you want to process content during insertion.

Example CLI actions that work well with document insertion:
- Summarization
- HTML cleaning
- Text formatting
- Translation
- Content extraction

### Implementation Details

- Files are created in the `docs/` directory
- Filenames are automatically sanitized and hyphenated
- Temporary files are cleaned up after CLI action processing
- The created document is automatically opened after insertion
- Supports all existing CLI action features (pre-steps, HTML cleaning, etc.)
