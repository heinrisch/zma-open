import {
  ExtensionContext,
  Position,
  Range,
  Selection,
  TextEditor,
  WorkspaceEdit,
  commands,
  window,
  workspace
} from 'vscode';

export function activateKeyboardShortcuts(context: ExtensionContext) {
  console.log('Activate keyboard shortcuts');
  context.subscriptions.push(
    commands.registerCommand('zma.commandsediting.toggleStrikethrough', toggleStrikethrough)
  );

  context.subscriptions.push(commands.registerCommand('zma.commandsediting.toggleStrong', toggleStrong));
}

function toggleStrikethrough() {
  return styleByWrapping('~~');
}

function toggleStrong() {
  return styleByWrapping('**');
}

function styleByWrapping(startPattern: string, endPattern = startPattern) {
  const editor = window.activeTextEditor!;
  let selections = editor.selections;

  let batchEdit = new WorkspaceEdit();
  let shifts: [Position, number][] = [];
  let newSelections: Selection[] = selections.slice();

  for (const [i, selection] of selections.entries()) {
    let cursorPos = selection.active;
    const shift = shifts
      .map(([pos, s]) => (selection.start.line === pos.line && selection.start.character >= pos.character ? s : 0))
      .reduce((a, b) => a + b, 0);

    if (selection.isEmpty) {
      const context = getContext(editor, cursorPos, startPattern, endPattern);

      if (
        startPattern === endPattern &&
        ['**', '*', '__', '_'].includes(startPattern) &&
        context === `${startPattern}text|${endPattern}`
      ) {
        let newCursorPos = cursorPos.with({ character: cursorPos.character + shift + endPattern.length });
        newSelections[i] = new Selection(newCursorPos, newCursorPos);
        continue;
      } else if (context === `${startPattern}|${endPattern}`) {
        let start = cursorPos.with({ character: cursorPos.character - startPattern.length });
        let end = cursorPos.with({ character: cursorPos.character + endPattern.length });
        wrapRange(
          editor,
          batchEdit,
          shifts,
          newSelections,
          i,
          shift,
          cursorPos,
          new Range(start, end),
          false,
          startPattern,
          endPattern
        );
      } else {
        let wordRange = editor.document.getWordRangeAtPosition(cursorPos);
        if (wordRange === undefined) {
          wordRange = selection;
        }
        const currentTextLine = editor.document.lineAt(cursorPos.line);
        if (startPattern === '~~' && /^\s*[*+-] (\[[ x]\] )? */g.test(currentTextLine.text)) {
          wordRange = currentTextLine.range.with(
            new Position(cursorPos.line, currentTextLine.text.match(/^\s*[*+-] (\[[ x]\] )? */g)![0].length)
          );
        }
        wrapRange(
          editor,
          batchEdit,
          shifts,
          newSelections,
          i,
          shift,
          cursorPos,
          wordRange,
          false,
          startPattern,
          endPattern
        );
      }
    } else {
      wrapRange(
        editor,
        batchEdit,
        shifts,
        newSelections,
        i,
        shift,
        cursorPos,
        selection,
        true,
        startPattern,
        endPattern
      );
    }
  }

  function wrapRange(
    editor: TextEditor,
    wsEdit: WorkspaceEdit,
    shifts: [Position, number][],
    newSelections: Selection[],
    i: number,
    shift: number,
    cursor: Position,
    range: Range,
    isSelected: boolean,
    startPtn: string,
    endPtn: string
  ) {
    let text = editor.document.getText(range);
    const prevSelection = newSelections[i];
    const ptnLength = (startPtn + endPtn).length;

    let newCursorPos = cursor.with({ character: cursor.character + shift });
    let newSelection: Selection;
    if (isWrapped(text, startPtn, endPtn)) {
      wsEdit.replace(editor.document.uri, range, text.substr(startPtn.length, text.length - ptnLength));

      shifts.push([range.end, -ptnLength]);

      if (!isSelected) {
        if (!range.isEmpty) {
          if (cursor.character === range.end.character) {
            newCursorPos = cursor.with({ character: cursor.character + shift - ptnLength });
          } else {
            newCursorPos = cursor.with({ character: cursor.character + shift - startPtn.length });
          }
        } else {
          newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
        }
        newSelection = new Selection(newCursorPos, newCursorPos);
      } else {
        newSelection = new Selection(
          prevSelection.start.with({ character: prevSelection.start.character + shift }),
          prevSelection.end.with({ character: prevSelection.end.character + shift - ptnLength })
        );
      }
    } else {
      wsEdit.replace(editor.document.uri, range, startPtn + text + endPtn);

      shifts.push([range.end, ptnLength]);

      if (!isSelected) {
        if (!range.isEmpty) {
          if (cursor.character === range.end.character) {
            newCursorPos = cursor.with({ character: cursor.character + shift + ptnLength });
          } else {
            newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
          }
        } else {
          newCursorPos = cursor.with({ character: cursor.character + shift + startPtn.length });
        }
        newSelection = new Selection(newCursorPos, newCursorPos);
      } else {
        newSelection = new Selection(
          prevSelection.start.with({ character: prevSelection.start.character + shift }),
          prevSelection.end.with({ character: prevSelection.end.character + shift + ptnLength })
        );
      }
    }

    newSelections[i] = newSelection;
  }

  return workspace.applyEdit(batchEdit).then(() => {
    editor.selections = newSelections;
  });
}

function getContext(editor: TextEditor, cursorPos: Position, startPattern: string, endPattern: string): string {
  let startPositionCharacter = cursorPos.character - startPattern.length;
  let endPositionCharacter = cursorPos.character + endPattern.length;

  if (startPositionCharacter < 0) {
    startPositionCharacter = 0;
  }

  let leftText = editor.document.getText(
    new Range(cursorPos.line, startPositionCharacter, cursorPos.line, cursorPos.character)
  );
  let rightText = editor.document.getText(
    new Range(cursorPos.line, cursorPos.character, cursorPos.line, endPositionCharacter)
  );

  if (rightText === endPattern) {
    if (leftText === startPattern) {
      return `${startPattern}|${endPattern}`;
    } else {
      return `${startPattern}text|${endPattern}`;
    }
  }
  return '|';
}

function isWrapped(text: string, startPattern: string, endPattern: string): boolean {
  return text.startsWith(startPattern) && text.endsWith(endPattern);
}
