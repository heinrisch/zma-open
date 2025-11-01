import * as vscode from 'vscode';
import { bestAlias } from './Alias';
import { escapeRegExp } from './Util';
import { RegexPatterns } from './RegexPatterns';
import { sharedIndex2 } from './Index2';
import { Link } from './Link';

interface TextDecorator {
  decorationType: vscode.TextEditorDecorationType;
  apply(editor: vscode.TextEditor): vscode.DecorationOptions[];
}

const NegativeWordDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    light: {
      color: '#dc2626'
    },
    dark: {
      color: '#dc2626'
    }
  }),
  apply(editor: vscode.TextEditor): vscode.DecorationOptions[] {
    const negativeWords = [
      'not',
      "can't",
      "won't",
      "don't",
      'never',
      'no',
      'nothing',
      'nowhere',
      'noone',
      'none',
      'hardly',
      'scarcely',
      'barely',
      "doesn't",
      "isn't",
      "wasn't",
      "shouldn't",
      "wouldn't",
      "couldn't",
      "won't",
      "can't",
      "don't"
    ];

    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];
    negativeWords.forEach((word) => {
      const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');

      let match;
      while ((match = regex.exec(text)) !== null) {
        const startPos = editor!.document.positionAt(match.index);
        const endPos = editor!.document.positionAt(match.index + match[0].length);
        const decoration = { range: new vscode.Range(startPos, endPos) };
        decorations.push(decoration);
      }
    });
    return decorations;
  }
};

const LinkHasAliasDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    borderWidth: '1px',
    borderStyle: 'none groove none groove',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    light: {
      borderColor: '#a855f7aa'
    },
    dark: {
      borderColor: '#a855f7aa'
    }
  }),
  apply(editor: vscode.TextEditor): vscode.DecorationOptions[] {
    const decorations: vscode.DecorationOptions[] = [];
    const text = editor.document.getText();

    const allRawLinks = new Set<string>();
    sharedIndex2().fileForFilePath(editor.document.uri.fsPath)?.linkLocations.forEach(ll => {
      allRawLinks.add(ll.link.linkName());
    });

    Array.from(allRawLinks).forEach((link) => {
      const regex = new RegExp(escapeRegExp(link), 'g');

      let match;
      while ((match = regex.exec(text)) !== null) {
        const startPos = editor!.document.positionAt(match.index);
        const endPos = editor!.document.positionAt(match.index + match[0].length);
        const bestRawLink = bestAlias(link);

        if (link !== bestRawLink) {
          const hoverText = `**${bestRawLink}**`;
          const decoration = {
            range: new vscode.Range(startPos, endPos),
            hoverMessage: new vscode.MarkdownString(hoverText)
          };
          decorations.push(decoration);
        }
      }
    });
    return decorations;
  }
};

const LinkHasFileDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    borderWidth: '1px',
    borderStyle: 'none none dashed none',
    overviewRulerColor: 'blue',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    light: {
      borderColor: '#a855f7aa'
    },
    dark: {
      borderColor: '#a855f7aa'
    }
  }),
  apply(editor: vscode.TextEditor): vscode.DecorationOptions[] {
    const decorations: vscode.DecorationOptions[] = [];
    const text = editor.document.getText();

    const visitedFilePath = new Set<string>();

    const allRawLinks = new Set<string>();
    sharedIndex2().fileForFilePath(editor.document.uri.fsPath)?.linkLocations.forEach(ll => {
      allRawLinks.add(ll.link.linkName());
    });

    Array.from(allRawLinks).forEach((link) => {
      const regex = new RegExp(escapeRegExp(link), 'g');

      let match;
      while ((match = regex.exec(text)) !== null) {
        const startPos = editor!.document.positionAt(match.index);
        const endPos = editor!.document.positionAt(match.index + match[0].length);
        const bestRawLink = bestAlias(link);


        const bestLink = Link.fromRawLink(bestRawLink);
        const visitedKey = `${startPos.line}-${startPos.character}-${endPos.line}-${endPos.character}-${bestLink.filePath()}`;
        if (bestLink.fileExists() && !visitedFilePath.has(visitedKey)) {
          const hoverText = `[${bestLink.fileName()}](${encodeURI(
            bestLink.filePath()
          )})`;
          const decoration = {
            range: new vscode.Range(startPos, endPos),
            hoverMessage: new vscode.MarkdownString(hoverText)
          };
          decorations.push(decoration);
          visitedFilePath.add(visitedKey);
        }
      }
    });

    return decorations;
  }
};

const createRegexDecorator = (
  decorationType: vscode.TextEditorDecorationType,
  regexCreator: () => RegExp,
  decorateGroupsOnly: boolean = false
): TextDecorator => {
  return {
    decorationType,
    apply(editor: vscode.TextEditor): vscode.DecorationOptions[] {
      const decorations: vscode.DecorationOptions[] = [];
      const text = editor.document.getText();

      const regex = regexCreator();
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (decorateGroupsOnly) {
          for (let groupIndex = 1; groupIndex < match.length; groupIndex++) {
            const group = match[groupIndex];
            if (group) {
              const startPos = editor!.document.positionAt(match.index + match[0].indexOf(group));
              const endPos = editor!.document.positionAt(match.index + match[0].indexOf(group) + group.length);
              const decoration = { range: new vscode.Range(startPos, endPos) };
              decorations.push(decoration);
            }
          }
        } else {
          const startPos = editor!.document.positionAt(match.index);
          const endPos = editor!.document.positionAt(match.index + match[0].length);
          const decoration = { range: new vscode.Range(startPos, endPos) };
          decorations.push(decoration);
        }
      }

      return decorations;
    }
  };
};

const HashtagDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    light: {
      color: '#d946ef'
    },
    dark: {
      color: '#d946ef'
    }
  }),
  RegexPatterns.RE_HASHTAG
);

const TodoDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    color: '#dc2626',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => /^\s*- TODO(\/\S+)?\s/gm
);

const DoingDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    color: '#d97706',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => /^\s*- DOING(\/\S+)?\s/gm
);

const DoneDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    color: '#65a30d',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => /^\s*- DONE(\/\S+)?\s/gm
);

const ThoughtDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    color: '#0284c7',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => /^\s*- THOUGHT\s/gm
);

const QuestionDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    fontWeight: 'bold',
    color: '#be185d',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => /^\s*- QUESTION\s/gm
);

const LinkBracketDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    color: '#dc2626',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => RegExp(/(\[\[)[^\]]+(\]\])/gm),
  true
);

const LinkDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    color: '#d97706',
    fontWeight: 'bold'
  }),
  RegexPatterns.RE_LINKS,
  true
);

const HrefBracketDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    color: '#dc2626',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  }),
  () => RegExp(/(\[)[^[]+(\]\()[^)]*(\))/gm),
  true
);

const HrefDecorator: TextDecorator = createRegexDecorator(
  vscode.window.createTextEditorDecorationType({
    color: '#f97316',
    fontWeight: 'bold'
  }),
  RegexPatterns.RE_HREF,
  true
);

export const bulletRegionLines = (text: string): vscode.Range[] => {
  const lines = text.split('\n');
  var rangeStartLine: number | null = null;
  const ranges: vscode.Range[] = [];
  lines.forEach((line, index) => {
    if (rangeStartLine === null) {
      if (/^\s*-/.test(line)) {
        rangeStartLine = index;
      }
    } else {
      if (/^-/.test(line)) {
        ranges.push(new vscode.Range(rangeStartLine, 0, index - 1, lines[index - 1].length));
        rangeStartLine = index;
      } else if (/^\s+-/.test(line)) {
        
      } else {
        ranges.push(new vscode.Range(rangeStartLine, 0, index - 1, lines[index - 1].length));
        rangeStartLine = null;
      }
    }
  });
  if (rangeStartLine !== null) {
    ranges.push(new vscode.Range(rangeStartLine, 0, lines.length - 1, lines[lines.length - 1].length));
  }
  return ranges;
};

const GeneralBlockDecorator =
  (isEven: boolean) =>
  (editor: vscode.TextEditor): vscode.DecorationOptions[] => {
    const text = editor.document.getText();
    const moduloResult = isEven ? 0 : 1;
    const evenRegions = bulletRegionLines(text).filter((_, index) => index % 2 === moduloResult);
    return evenRegions.map((range) => ({ range }));
  };

const BlockEvenDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    backgroundColor: `rgba(253, 230, 138, ${vscode.workspace
      .getConfiguration('zma.config')
      .get('blockHighlightEven')})`,
    isWholeLine: true
  }),
  apply: GeneralBlockDecorator(true)
};

const BlockOddDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    backgroundColor: `rgba(253, 230, 255, ${vscode.workspace.getConfiguration('zma.config').get('blockHighlightOdd')})`,
    isWholeLine: true
  }),
  apply: GeneralBlockDecorator(false)
};

const GeneralBulletLineDecorator =
  (isEven: boolean) =>
  (editor: vscode.TextEditor): vscode.DecorationOptions[] => {
    const text = editor.document.getText();
    const moduloResult = isEven ? 0 : 1;
    const evenLinesGroups = bulletRegionLines(text)
      .filter((_, index) => index % 2 === moduloResult)
      .flatMap((range) => {
        return [Array.from({ length: range.end.line - range.start.line + 1 }, (_, i) => i + range.start.line)];
      });

    return evenLinesGroups
      .map((evenLines) => {
        const lineAndDistance = evenLines
          .map((line) => [line, editor.document.lineAt(line).text.indexOf('-')])
          .reverse();
        let min = Infinity;
        const lineAndMinBelow = lineAndDistance
          .map(([line, distance]) => {
            min = Math.min(min, distance);
            const res = [line, min];
            if (distance === 0) {
              min = Infinity;
            }
            return res;
          })
          .reverse();

        const tabSpace: number = vscode.workspace.getConfiguration('editor').get('tabSize')!;
        return lineAndMinBelow.map(([line, distance], index) => {
          const l = index < lineAndMinBelow.length - 1 ? lineAndMinBelow[index + 1][1] - distance : tabSpace;
          return { range: new vscode.Range(line, distance, line, distance + l) };
        });
      })
      .flat();
  };

const BulletEvenDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    borderColor: `rgba(4, 120, 87, ${vscode.workspace.getConfiguration('zma.config').get('bulletThreadOpacity')})`,
    borderWidth: `${vscode.workspace.getConfiguration('zma.config').get('bulletThreadWidthPx')}px`,
    borderStyle: 'none none solid solid'
  }),
  apply: GeneralBulletLineDecorator(true)
};

const BulletOddDecorator: TextDecorator = {
  decorationType: vscode.window.createTextEditorDecorationType({
    borderColor: `rgba(3, 105, 161, ${vscode.workspace.getConfiguration('zma.config').get('bulletThreadOpacity')})`,
    borderWidth: `${vscode.workspace.getConfiguration('zma.config').get('bulletThreadWidthPx')}px`,
    borderStyle: 'none none solid solid'
  }),
  apply: GeneralBulletLineDecorator(false)
};

export function activateDecorator(context: vscode.ExtensionContext) {
  let timeout: NodeJS.Timer | undefined = undefined;
  let activeEditor = vscode.window.activeTextEditor;

  function updateDecorations() {
    if (!activeEditor || !sharedIndex2().isCompleted) {
      console.log('No active editor or index not ready', activeEditor !== null, sharedIndex2().isCompleted);
      return;
    }
    const startTime = Date.now();

    [
      NegativeWordDecorator,
      LinkHasAliasDecorator,
      LinkHasFileDecorator,
      HashtagDecorator,
      BlockEvenDecorator,
      BlockOddDecorator,
      BulletEvenDecorator,
      BulletOddDecorator,
      TodoDecorator,
      DoingDecorator,
      DoneDecorator,
      ThoughtDecorator,
      QuestionDecorator,
      //LinkDecorator,
      //HrefDecorator,
      //LinkBracketDecorator,
      //HrefBracketDecorator,
    ].forEach((decorator) => {
      activeEditor!.setDecorations(decorator.decorationType, []);
      activeEditor!.setDecorations(decorator.decorationType, decorator.apply(activeEditor!));
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(`Decorations update in ${executionTime}ms`);
  }

  function triggerUpdateDecorations(throttle = false) {
    if (timeout) {
      clearTimeout(timeout as NodeJS.Timeout);
      timeout = undefined;
    }
    if (throttle) {
      timeout = setTimeout(updateDecorations, 1000);
    } else {
      updateDecorations();
    }
  }

  if (activeEditor) {
    triggerUpdateDecorations();
  }

  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      activeEditor = editor;
      if (editor) {
        triggerUpdateDecorations();
      }
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (activeEditor && event.document === activeEditor.document) {
        triggerUpdateDecorations(true);
      }
    },
    null,
    context.subscriptions
  );

  console.log('Activated decorations');
}
