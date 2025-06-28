import {
  commands,
  ExtensionContext,
  Position,
  Range,
  window,
  workspace,
  TextEditor
} from 'vscode';

export function activateListEditing(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('zma.commandsonEnterKey', onEnterKey),
    commands.registerCommand('zma.commandsonTabKey', onTabKey),
    commands.registerCommand('zma.commandsonBackspaceKey', onBackspaceKey)
  );
}


const LIST_PATTERNS = {
  unordered: /^(\s*)([-+*])( +)(\[[ x]\] )?(.*)$/,
  ordered: /^(\s*)([0-9]+[.)])( +)(\[[ x]\] )?(.*)$/
};

function getTabSize(editor: TextEditor): number {
  const config = workspace.getConfiguration('editor', editor.document.uri);
  return config.get<number>('tabSize', 4);
}

function onEnterKey() {
  const editor = window.activeTextEditor!;
  const cursor = editor.selection.active;
  const line = editor.document.lineAt(cursor.line);
  const lineText = line.text;

  // Match against list patterns
  const unorderedMatch = lineText.match(LIST_PATTERNS.unordered);
  const orderedMatch = lineText.match(LIST_PATTERNS.ordered);
  const match = unorderedMatch || orderedMatch;

  if (!match) {
    return commands.executeCommand('type', { source: 'keyboard', text: '\n' });
  }

  const [, indent, marker, space, checkbox = '', content] = match;
  
  // If line is empty (just the bullet), remove the bullet
  if (!content && !checkbox) {
    return editor.edit(builder => {
      builder.delete(line.range);
      builder.insert(line.range.start, '');
    });
  }

  // Create new list item
  const newMarker = orderedMatch ? `${parseInt(marker) + 1}.` : marker;
  const newCheckbox = checkbox ? '[ ] ' : '';
  const newListItem = `${indent}${newMarker}${space}${newCheckbox}`;

  const textAfterCursor = lineText.substring(cursor.character);

  return editor.edit(builder => {
    builder.insert(cursor, `\n${newListItem}${textAfterCursor}`);
    builder.delete(new Range(cursor, cursor.with({ character: line.range.end.character })));
  });
}

function onTabKey() {
  const editor = window.activeTextEditor!;
  const tabSize = getTabSize(editor);
  const selections = editor.selections;

  return editor.edit(builder => {
    for (const selection of selections) {
      // Get all line numbers in the selection range
      const startLine = selection.start.line;
      const endLine = selection.end.line;
      
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const line = editor.document.lineAt(lineNum);
        const lineText = line.text;

        // Check if line is a list item
        if (LIST_PATTERNS.unordered.test(lineText) || LIST_PATTERNS.ordered.test(lineText)) {
          builder.insert(new Position(lineNum, 0), ' '.repeat(tabSize));
        }
      }
    }
  });
}

function onBackspaceKey() {
  const editor = window.activeTextEditor!;
  const tabSize = getTabSize(editor);
  const cursor = editor.selection.active;
  const line = editor.document.lineAt(cursor.line);
  const lineText = line.text;
  const textBeforeCursor = lineText.substring(0, cursor.character);

  // If at start of line with bullet, remove bullet
  if (cursor.character === line.firstNonWhitespaceCharacterIndex) {
    const match = lineText.match(LIST_PATTERNS.unordered) || lineText.match(LIST_PATTERNS.ordered);
    if (match) {
      const [, indent, , , checkbox = '', rest] = match;
      return editor.edit(builder => {
        builder.replace(line.range, indent + (checkbox ? checkbox + rest : rest));
      });
    }
  }

  // If line is indented list item, outdent by tabSize spaces
  if (/^\s+([-+*]|[0-9]+[.)]) /.test(textBeforeCursor)) {
    return editor.edit(builder => {
      const deleteRange = new Range(
        cursor.with({ character: 0 }),
        cursor.with({ character: tabSize })
      );
      builder.delete(deleteRange);
    });
  }

  return commands.executeCommand('deleteLeft');
}

export function deactivate() {}
