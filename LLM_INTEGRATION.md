# LLM Integration

ZMA now supports integration with OpenAI-compatible LLM APIs, including local models like Ollama.

## Features

- **Zero Dependencies**: Uses only Node.js built-in modules (`https`, `http`)
- **OpenAI-Compatible**: Works with any OpenAI-compatible API
- **Configurable**: Easy JSON-based configuration
- **Action-Based**: Define reusable LLM actions for common tasks
- **HTML Pre-Processing**: Optional cleanHtml flag to sanitize HTML before LLM processing
- **Per-Action Model**: Any action can specify its own model to override the default config

## Setup

### 1. Configure LLM Connection

Create `llm-config.json` in your workspace root:

```json
{
  "baseUrl": "http://localhost:11434",
  "apiKey": "",
  "model": "llama3.2",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

**Configuration Options:**
- `baseUrl`: API endpoint (e.g., `http://localhost:11434` for Ollama, `https://api.openai.com` for OpenAI)
- `apiKey`: Optional API key (required for OpenAI, not needed for local Ollama)
- `model`: Model name (e.g., `llama3.2`, `gpt-4`, `mistral`)
- `temperature`: Controls randomness (0.0-1.0)
- `maxTokens`: Maximum response length

### 2. Create LLM Actions

Actions are stored in the `llm-actions/` folder in your workspace. Each action is a JSON file:

**Example: `llm-actions/summarize.json`**
```json
{
  "name": "Summarize",
  "description": "Summarize the selected text",
  "systemPrompt": "You are a helpful assistant that summarizes text concisely.",
  "userPromptTemplate": "Please summarize the following text:\n\n${text}"
}
```

**Example: `llm-actions/summarize-openai.json`**
```json
{
  "name": "Summarize with OpenAI",
  "description": "Summarize using the OpenAI gpt-4 model",
  "systemPrompt": "You are a helpful assistant that summarizes text concisely.",
  "userPromptTemplate": "Please summarize the following text:\n\n${text}",
  "model": "gpt-4"
}
```

**Example: `llm-actions/improve-writing.json`**
```json
{
  "name": "Improve Writing",
  "description": "Improve grammar and clarity",
  "systemPrompt": "You are an expert editor. Improve the grammar, clarity, and style of the text while preserving its meaning.",
  "userPromptTemplate": "${text}"
}
```

**Example: `llm-actions/expand-notes.json`**
```json
{
  "name": "Expand Notes",
  "description": "Expand brief notes into detailed explanations",
  "systemPrompt": "You are a helpful assistant that expands brief notes into clear, detailed explanations while maintaining the original meaning.",
  "userPromptTemplate": "Expand these notes into a more detailed explanation:\n\n${text}",
  "temperature": 0.7
}
```

**Example: `llm-actions/clean-html.json`**
```json
{
  "name": "Clean HTML",
  "description": "Remove HTML tags and formatting for markdown",
  "systemPrompt": "You are a text processing assistant. Your task is to clean HTML content by removing scripts, styles, comments, unnecessary attributes, and non-essential tags while preserving links, basic formatting (bold, italic, headings), lists, and text structure. Return only the cleaned text without any additional commentary.",
  "userPromptTemplate": "Clean this HTML content for markdown use, keeping only essential formatting (links, bold, italic, headings, lists) and removing everything else:\n\n${text}",
  "temperature": 0.1
}
```

**Example with HTML Pre-Processing: `llm-actions/summarize-cleaned-html.json`**
```json
{
  "name": "Summarize Cleaned HTML",
  "description": "Clean HTML then summarize with LLM",
  "systemPrompt": "You are a helpful assistant that summarizes text concisely.",
  "userPromptTemplate": "Summarize the following content:\n\n${text}",
  "cleanHtml": true
}
```

**Action Properties:**
- `name`: Display name in the quick pick menu
- `description`: Description shown in the quick pick menu
- `systemPrompt`: System message defining the LLM's role
- `userPromptTemplate`: User message template (use `${text}` for selected text)
- `temperature` (optional): Override default temperature for this action
- `maxTokens` (optional): Override default max tokens for this action
- `model` (optional): Override model for this action instead of using workspace default
- `cleanHtml` (optional): If `true`, applies HTML cleaning before sending to LLM (removes scripts, styles, comments, and non-essential tags)

## HTML Pre-Processing

When `cleanHtml: true` is set in an action, the selected text is automatically cleaned before being sent to the LLM:

- **Removes**: Scripts, styles, comments, unnecessary attributes, non-essential tags
- **Preserves**: Links, headings, bold, italic, lists, code blocks, basic structure
- **Normalizes**: Whitespace and HTML entities

This is identical to the `cleanHtml` feature in CLI Actions, allowing you to process web content or HTML snippets before LLM analysis.

**Use cases:**
- Summarizing web pages copied from browsers
- Processing HTML emails
- Extracting content from HTML documentation
- Any workflow where you need clean text from HTML sources

## Usage

1. Select text in your markdown file
2. Run command: **ZMA: Run LLM Action** (or use Command Palette: `Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Choose an action from the quick pick menu
4. The selected text will be replaced with the LLM's response

## Architecture

### LlmClient (`src/LlmClient.ts`)

Handles all HTTP communication with the LLM API:
- Sends completion requests
- Manages authentication
- Handles errors and timeouts
- Uses only Node.js built-in `https` and `http` modules

### LlmActions (`src/LlmActions.ts`)

Provides the VS Code integration:
- Registers the `zma.runLlmAction` command
- Loads configuration and actions
- Shows quick pick menu
- Applies HTML pre-processing if `cleanHtml` is enabled
- Sets model per action if specified
- Replaces selected text with LLM response

## Examples

### Using Ollama (Local)

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. Configure `llm-config.json`:
   ```json
   {
     "baseUrl": "http://localhost:11434",
     "model": "llama3.2"
   }
   ```

### Using OpenAI for one action, Ollama for another

1. Action specifying OpenAI gpt-4:
    ```json
    {
      "name": "Summarize with OpenAI",
      "systemPrompt": "You are a helpful assistant that summarizes text concisely.",
      "userPromptTemplate": "Please summarize the following text:\n\n${text}",
      "model": "gpt-4"
    }
    ```
2. Action using project default model (llama3.2) with Ollama:
    ```json
    {
      "name": "Summarize",
      "systemPrompt": "You are a helpful assistant that summarizes text concisely.",
      "userPromptTemplate": "Please summarize the following text:\n\n${text}"
    }
    ```

## Troubleshooting

### "LLM configuration not found"
- Create `llm-config.json` in your workspace root
- Ensure it has valid JSON syntax

### "Request failed" or "Connection refused"
- Verify the `baseUrl` is correct
- For Ollama, ensure it's running: `ollama serve`
- Check firewall settings

### "HTTP 401" or "HTTP 403"
- Verify your `apiKey` is correct
- Check API key permissions/credits

### "Model not found"
- For Ollama: Pull the model first (`ollama pull <model>`)
- For cloud APIs: Verify model name and access
