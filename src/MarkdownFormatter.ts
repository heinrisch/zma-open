import { ExtensionContext, languages, DocumentSelector } from 'vscode';
import * as vscode from 'vscode';

const Document_Selector_Markdown: DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'untitled' }
];

const outputChannel = vscode.window.createOutputChannel('Markdown Formatter');

export function activateCodeFormatter(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider(
      Document_Selector_Markdown,
      new MarkdownDocumentFormatter()
    )
  );
}

class MarkdownDocumentFormatter implements vscode.DocumentFormattingEditProvider {
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[]> {
    const workingDoc = { text: document.getText() };
    outputChannel.appendLine(`\n--- FORMATTING ${document.fileName} ---`);
    outputChannel.appendLine(`Original document length: ${workingDoc.text.length} characters`);
  
    const tabSize = this.getTabSize(document);
    
    let iterations = 0;
    let hasChanges = true;
    const MAX_ITERATIONS = 100;
    
    while (hasChanges && iterations < MAX_ITERATIONS) {
      iterations++;
      outputChannel.appendLine(`\nIteration ${iterations}:`);
      let iterationChanges = false;
      
      // Process the document sequentially
      const bulletIndentChanged = await this.adjustBulletIndentation(workingDoc, tabSize);
      const emptyLinesChanged = await this.removeConsecutiveEmptyLines(workingDoc);
      iterationChanges = bulletIndentChanged || emptyLinesChanged;
  
      // Process line by line
      const lines = workingDoc.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let lineModified = false;
        
        // Apply transformations sequentially
        lineModified = await this.removeSpecialCharacters(i, line, workingDoc) || lineModified;
        lineModified = await this.convertAsterisksToDashes(i, line, workingDoc) || lineModified;
        lineModified = await this.removeDuplicateBullets(i, line, workingDoc) || lineModified; 
        lineModified = await this.singleSpaceAfterBullet(i, line, workingDoc) || lineModified;
        lineModified = await this.fixHrefBrackets(i, line, workingDoc) || lineModified;
        lineModified = await this.fixLinkBrackets(i, line, workingDoc) || lineModified;
        lineModified = await this.trimLinkText(i, line, workingDoc) || lineModified;
        lineModified = await this.removeEmptyBullets(i, line, workingDoc) || lineModified;
        lineModified = await this.removeTrailingWhitespace(i, line, workingDoc) || lineModified;
        
        iterationChanges = iterationChanges || lineModified;
        
        // Update lines array if modified
        if (lineModified) {
          const updatedLines = workingDoc.text.split('\n');
          if (i < updatedLines.length) {
            lines[i] = updatedLines[i];
          }
        }
      }
      
      // Stop if no changes were made in this iteration
      hasChanges = iterationChanges;
      if (hasChanges) {
        outputChannel.appendLine(`Iteration ${iterations} made changes, continuing...`);
      } else {
        outputChannel.appendLine(`Iteration ${iterations} made no changes, document is stable.`);
      }
    }
    
    if (iterations === MAX_ITERATIONS) {
      outputChannel.appendLine(`Reached maximum iterations (${MAX_ITERATIONS}), stopping.`);
    }
  
    // Create a single edit for the entire document if anything changed
    const originalText = document.getText();
    const finalText = workingDoc.text;
  
    if (originalText !== finalText) {
      outputChannel.appendLine(`Document changed: ${originalText.length} chars -> ${finalText.length} chars`);
      const entireRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
      );
      outputChannel.appendLine(`Final edit: Replacing entire document`);
      return [new vscode.TextEdit(entireRange, finalText)];
    }
  
    outputChannel.appendLine(`No changes detected`);
    return [];
  }

  private getTabSize(document: vscode.TextDocument): number {
    const config = vscode.workspace.getConfiguration('editor', document.uri);
    return config.get<number>('tabSize', 4);
  }

  // Apply edits directly to the working document
  private applyEdit(workingDoc: { text: string }, startLine: number, startChar: number,
    endLine: number, endChar: number, newText: string): boolean {
    const lines = workingDoc.text.split('\n');

    // Debug line info before edit
    outputChannel.appendLine(`    Before edit - doc has ${lines.length} lines`);

    // If startLine and endLine are the same, just replace the substring
    if (startLine === endLine) {
      const line = lines[startLine];
      if (line === undefined) {
        outputChannel.appendLine(`    SKIPPED: Line ${startLine} doesn't exist`);
        return false;
      }

      const before = line.substring(0, startChar);
      const after = line.substring(endChar);
      const newLine = before + newText + after;

      // Only update if there's an actual change
      if (line !== newLine) {
        lines[startLine] = newLine;
        workingDoc.text = lines.join('\n');
        outputChannel.appendLine(`    Applied change - doc now has ${lines.length} lines`);
        return true;
      }
      outputChannel.appendLine(`    No change needed (line content identical)`);
      return false;
    }
    // If lines differ, handle multi-line edits
    else {
      if (startLine >= lines.length) {
        outputChannel.appendLine(`    SKIPPED: Start line ${startLine} exceeds document length ${lines.length}`);
        return false;
      }

      const beforeLines = lines.slice(0, startLine);
      const afterLines = lines.slice(Math.min(endLine + 1, lines.length));
      const startLinePart = lines[startLine]?.substring(0, startChar) || '';
      const endLinePart = endLine < lines.length ? (lines[endLine]?.substring(endChar) || '') : '';

      const newLines = (startLinePart + newText + endLinePart).split('\n');
      const updatedLines = [...beforeLines, ...newLines, ...afterLines];

      const oldText = workingDoc.text;
      workingDoc.text = updatedLines.join('\n');
      const changed = oldText !== workingDoc.text;

      if (changed) {
        outputChannel.appendLine(`    Applied multi-line edit - doc now has ${updatedLines.length} lines`);
      } else {
        outputChannel.appendLine(`    No change needed (multi-line content identical)`);
      }

      return changed;
    }
  }

  async convertAsterisksToDashes(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    // Match lines that start with indentation (or not) followed by an asterisk and space
    const regex = /^(\s*)\*(\s+)/;
    const match = line.match(regex);
    
    if (match) {
      const indentation = match[1] || '';
      const spacing = match[2];
      const content = line.substring(match[0].length);
      const newLine = `${indentation}-${spacing}${content}`;
      
      if (line !== newLine) {
        outputChannel.appendLine(`  Line ${lineNumber+1}: Converting asterisk to dash`);
        return this.applyEdit(workingDoc, lineNumber, 0, lineNumber, line.length, newLine);
      }
    }
    
    return false;
  }

  async removeDuplicateBullets(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    // Match patterns like "- -", "-- ", "--- ", etc.
    const regex = /^(\s*)(-+\s+-+\s+|\-{2,}\s+)/;
    const match = line.match(regex);
    
    if (match) {
      const indentation = match[1] || '';
      const content = line.substring(match[0].length);
      const newLine = `${indentation}- ${content}`;
      
      if (line !== newLine) {
        outputChannel.appendLine(`  Line ${lineNumber+1}: Fixing duplicate bullets "${match[0].trim()}" -> "-"`);
        return this.applyEdit(workingDoc, lineNumber, 0, lineNumber, line.length, newLine);
      }
    }
    
    return false;
  }

  // Each formatting method will now update the document directly
  async adjustBulletIndentation(workingDoc: { text: string }, tabSize: number): Promise<boolean> {
    outputChannel.appendLine('Adjusting bullet indentation...');
    let modified = false;
    const lines = workingDoc.text.split('\n');
    const expectedIndents: (number | undefined)[] = new Array(lines.length);

    // First pass: calculate expected indents
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\s*-\s/.test(line)) continue; // Not a bullet

      const rawIndent = (line.match(/^\s*/) || [''])[0].length;
      let expected = 0;

      // Scan upward to find a bullet with lower raw indentation
      for (let j = i - 1; j >= 0; j--) {
        if (/^\s*-\s/.test(lines[j])) {
          const parentRawIndent = (lines[j].match(/^\s*/) || [''])[0].length;
          if (parentRawIndent < rawIndent) {
            const parentExpected = expectedIndents[j] !== undefined ? expectedIndents[j]! : 0;
            expected = parentExpected + tabSize;
            break;
          }
        }
      }

      expectedIndents[i] = expected;
    }

    // Second pass: apply indentation changes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\s*-\s/.test(line)) continue; // Not a bullet

      const rawIndent = (line.match(/^\s*/) || [''])[0].length;
      const expected = expectedIndents[i];

      if (expected !== undefined && rawIndent !== expected) {
        outputChannel.appendLine(`  Line ${i + 1}: Changing indent from ${rawIndent} to ${expected}`);
        const newIndent = ' '.repeat(expected);

        const wasModified = this.applyEdit(workingDoc, i, 0, i, rawIndent, newIndent);
        modified = modified || wasModified;

        // Update lines after modification to keep current with document state
        if (wasModified) {
          const updatedLines = workingDoc.text.split('\n');
          for (let j = 0; j < updatedLines.length && j < lines.length; j++) {
            lines[j] = updatedLines[j];
          }
        }
      }
    }

    return modified;
  }

  async removeTrailingWhitespace(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    if (/\s+$/.test(line)) {
      const newText = line.replace(/\s+$/, '');
      outputChannel.appendLine(`  Line ${lineNumber + 1}: Removing trailing whitespace`);
      return this.applyEdit(workingDoc, lineNumber, 0, lineNumber, line.length, newText);
    }
    return false;
  }

  async removeConsecutiveEmptyLines(workingDoc: { text: string }): Promise<boolean> {
    outputChannel.appendLine('Removing consecutive empty lines...');
    let lines = workingDoc.text.split('\n');
    let modified = false;
    let i = 0;

    while (i < lines.length - 1) {
      if (lines[i].trim() === '' && lines[i + 1].trim() === '') {
        outputChannel.appendLine(`  Lines ${i + 1}-${i + 2}: Removing consecutive empty line`);

        // Build array without the empty line
        const newLines = [...lines.slice(0, i + 1), ...lines.slice(i + 2)];

        // Calculate position for edit
        const lineStart = lines.slice(0, i + 1).join('\n').length + 1; // +1 for the newline
        const lineLength = lines[i + 1].length + 1; // +1 for the newline

        // Apply the edit directly to the working document
        workingDoc.text = newLines.join('\n');
        lines = newLines; // Update our working array

        modified = true;
        // Don't increment i as we need to check the same position again
      } else {
        i++;
      }
    }

    return modified;
  }

  async removeEmptyBullets(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    if (/^\s*-\s*$/.test(line)) {
      outputChannel.appendLine(`  Line ${lineNumber + 1}: Removing empty bullet`);
      return this.applyEdit(workingDoc, lineNumber, 0, lineNumber, line.length, '');
    }
    return false;
  }

  async singleSpaceAfterBullet(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    if (/^\s*-\s{2,}/.test(line)) {
      const newText = line.replace(/-\s{2,}/, '- ');
      outputChannel.appendLine(`  Line ${lineNumber + 1}: Fixing space after bullet`);
      return this.applyEdit(workingDoc, lineNumber, 0, lineNumber, line.length, newText);
    }
    return false;
  }

  async fixHrefBrackets(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    const regex = /\[{1,}([^[\]]*?)\]{1,}\((.*?)\)/g;
    let match;
    let modified = false;
    let searchText = line;
    let offset = 0;

    while ((match = regex.exec(searchText)) !== null) {
      const start = match.index + offset;
      const end = start + match[0].length;
      const newText = `[${match[1]}](${match[2]})`;

      if (match[0] !== newText) {
        outputChannel.appendLine(`  Line ${lineNumber + 1}: Fixing href brackets "${match[0]}" -> "${newText}"`);
        const wasModified = this.applyEdit(workingDoc, lineNumber, start, lineNumber, end, newText);
        modified = modified || wasModified;

        // Update search context after modification
        const lines = workingDoc.text.split('\n');
        if (lineNumber < lines.length) {
          searchText = lines[lineNumber];
          offset = 0;
          regex.lastIndex = 0; // Reset regex to search from beginning with updated text
        } else {
          break;
        }
      }
    }

    return modified;
  }

  async fixLinkBrackets(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    const regex = /\[+[\w/ ]+\]{2,}(?!\()/g;
    let modified = false;
    let searchText = line;
    let offset = 0;

    for (const match of searchText.matchAll(regex)) {
      const text = match[0];
      const matchIndex = match.index;
      if (matchIndex === undefined) continue;

      const start = matchIndex + offset;
      const end = start + text.length;
      const newText = text.replace(/\[+/, '[[').replace(/\]+/, ']]');

      if (text !== newText) {
        outputChannel.appendLine(`  Line ${lineNumber + 1}: Fixing link brackets "${text}" -> "${newText}"`);
        const wasModified = this.applyEdit(workingDoc, lineNumber, start, lineNumber, end, newText);
        modified = modified || wasModified;

        // Update search context after modification
        const lines = workingDoc.text.split('\n');
        if (lineNumber < lines.length) {
          searchText = lines[lineNumber];
          offset = 0;
        } else {
          break;
        }
      }
    }

    return modified;
  }

  async trimLinkText(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    const regex = /\[([\s\S]*?)\](?:\[\]|\([^)]*\))/g;
    let match;
    let modified = false;
    let searchText = line;
    let offset = 0;

    while ((match = regex.exec(searchText)) !== null) {
      const fullMatch = match[0];
      const linkText = match[1];
      const trimmedText = linkText.trim();

      if (trimmedText !== linkText) {
        const start = match.index + offset;
        const end = start + fullMatch.length;
        const newText = fullMatch.replace(`[${linkText}]`, `[${trimmedText}]`);

        outputChannel.appendLine(`  Line ${lineNumber + 1}: Trimming link text "${linkText}" -> "${trimmedText}"`);
        const wasModified = this.applyEdit(workingDoc, lineNumber, start, lineNumber, end, newText);
        modified = modified || wasModified;

        // Update search context after modification
        const lines = workingDoc.text.split('\n');
        if (lineNumber < lines.length) {
          searchText = lines[lineNumber];
          offset = 0;
          regex.lastIndex = 0; // Reset regex to search from beginning with updated text
        } else {
          break;
        }
      }
    }

    return modified;
  }

  async removeSpecialCharacters(lineNumber: number, line: string, workingDoc: { text: string }): Promise<boolean> {
    if (/[\u00A0\\]/.test(line)) {
      const newText = line.replace(/\u00A0/g, ' ').replace(/\\/g, '');
      if (newText !== line) {
        outputChannel.appendLine(`  Line ${lineNumber + 1}: Removing special characters`);
        return this.applyEdit(workingDoc, lineNumber, 0, lineNumber, line.length, newText);
      }
    }
    return false;
  }
}

export async function formatAllFiles(): Promise<void> {
  outputChannel.show(true);
  outputChannel.appendLine('Starting batch format of all markdown files...');

  await vscode.commands.executeCommand('workbench.action.files.save');
  const files = await vscode.workspace.findFiles('**/*.md');
  const progressIncrease = (1 / files.length) * 100;

  await vscode.window.withProgress(
    {
      cancellable: true,
      location: vscode.ProgressLocation.Notification,
      title: 'Formatting Markdown Files'
    },
    async (progress, token) => {
      for (const file of files) {
        if (token.isCancellationRequested) {
          outputChannel.appendLine('Operation cancelled by user');
          return;
        }

        const filename = file.fsPath.split('/').pop();
        progress.report({ message: `Processing ${filename}`, increment: progressIncrease });
        outputChannel.appendLine(`\nProcessing file: ${file.fsPath}`);

        await formatSingleFile(file);
      }

      outputChannel.appendLine('Batch formatting complete!');
    }
  );
}

async function formatSingleFile(file: vscode.Uri): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(file.fsPath);
    if (doc) {
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
      outputChannel.appendLine(`Formatting document: ${file.fsPath}`);

      await vscode.commands.executeCommand('editor.action.formatDocument');
      await vscode.commands.executeCommand('workbench.action.files.save');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      outputChannel.appendLine(`Completed formatting: ${file.fsPath}`);
    }
  } catch (error) {
    outputChannel.appendLine(`ERROR formatting ${file.fsPath}: ${error}`);
    console.error(`Error formatting ${file.fsPath}: ${error}`);
  }
}