# ZMA - Markdown Note Taking in VS Code

ZMA is a VS Code extension for note-taking with Markdown. It integrates advanced features directly into your Markdown files, assisting with organization, navigation, task management, and AI integration via the Model Context Protocol (MCP).

![ZMA Screenshot](images/screenshot.png)

## Features

*   **Markdown Integration**: Supports standard Markdown format within VS Code.
*   **Wiki-Style Linking**: Connect notes using `[[wiki-style links]]`. "Go to Definition" functionality allows navigation between linked notes.
*   **Automatic URL Conversion**: Pasting a URL automatically fetches the page title and converts it to `[Title](URL)`.
*   **Model Context Protocol (MCP)**: Built-in MCP server to expose your notes and tasks to AI assistants (like Claude or other MCP clients).
*   **TODO Support**: Manage tasks within notes. Commands are available to snooze, reset snooze, and adjust task priority.
*   **Navigation**:
    *   **Backlinks Explorer**: Displays notes that link to the current file.
    *   **Hashtag Explorer**: Allows browsing and navigation of notes by hashtags.
    *   **Task Explorer**: Provides a view and management interface for all tasks.
*   **Git Integration**: Includes commands for committing and pushing changes, and removing empty files.
*   **Autocomplete**: Autocomplete for links, headings, and hashtags.
*   **LLM Integration**: Auto-tagging of links and other LLM-assisted actions.

## Getting Started

1.  **Install the ZMA extension** by downloading and adding the `.vsix` file from releases.
2.  **Open a folder** (an empty folder or your existing notes folder) in VS Code.
3.  **Run ZMA: Init** from your VS Code commands (`Ctrl+Shift+P` -> `ZMA: Init`). This will set up the necessary `pages` directory and configuration files.

## VS Code Commands

Commands can be accessed via the VS Code Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).

### General Commands

*   **ZMA: Init** (`zma.init`): Initializes the ZMA workspace (creates `pages` folder and `lastEdit.txt`).
*   **ZMA: Today** (`zma.today`): Opens or creates today's daily note.
*   **ZMA: Yesterday** (`zma.yesterday`): Opens yesterday's daily note.
*   **ZMA: Reindex** (`zma.reindex`): Rebuilds the internal index of ZMA data.
*   **ZMA: Refresh Explorers** (`zma.refreshexplorers`): Updates the Backlinks, Tasks, and Hashtags explorers.
*   **ZMA: Format All Files** (`zma.formatAllFiles`): Applies Markdown formatting to all ZMA notes.
*   **ZMA: Quick Open Link** (`zma.quickOpenLink`): Searches and opens ZMA wiki-style links.
*   **ZMA: Quick Open Href** (`zma.quickOpenHref`): Searches and opens external web links (hrefs) from notes.
*   **ZMA: Toggle Inline URL Folding** (`zma.inlineFold.toggleMarkdownUrls`): Toggles the display of long URLs in the editor.
*   **ZMA: Clean Selected Text** (`zma.cleanSelectedText`): Cleans up selected text (formatting/whitespace).
*   **ZMA: Insert Document** (`zma.insertDocument`): Inserts the content of another document.
*   **ZMA: Run Cli Action** (`zma.runCliAction`): Executes a predefined ZMA command-line interface action.
*   **ZMA: Add Tags to Current Link** (`zma.addTagsToCurrentLink`): Adds tags to the currently selected link.

### AI & MCP Commands

*   **ZMA: Start MCP Server** (`zma.mcp.start`): Starts the Model Context Protocol server.
*   **ZMA: Stop MCP Server** (`zma.mcp.stop`): Stops the Model Context Protocol server.
*   **ZMA: Run LLM Action** (`zma.runLlmAction`): Executes a predefined LLM action.
*   **ZMA: Auto Tag Link (LLM)** (`zma.autoTagLink`): Uses LLM to generate tags for a link.
*   **ZMA: Auto Tag Next Untagged Link** (`zma.autoTagNextUntagged`): Finds the next untagged link and auto-tags it.

### Git Integration Commands

*   **ZMA: Commit and Push** (`zma.git.commitandpush`): Stages all changes, commits them, and pushes to the Git repository.
*   **ZMA: Remove Empty Files** (`zma.git.removeemptyfiles`): Identifies and removes empty files within the Git repository.