import * as vscode from 'vscode';
import { CompletionItem } from 'vscode';
import { ScoringUtils } from './ScoringUtils';
import { Index2, sharedIndex2 } from './Index2';
import { LinkType } from './LinkLocation';


function toAutocompleteString(str: string): string {
  const cleaned = str.replace(/[^a-zA-Z0-9]/g, ' ');
  return cleaned
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export const sharedAutocomplete = (document: vscode.TextDocument, position: vscode.Position): CompletionItem[] => {
  const line = document.lineAt(position.line);
  const textBefore = line.text.slice(0, position.character);

  const lineB = document.lineAt(position).text.substring(0, position.character);
  const lastSpace = lineB.lastIndexOf(' ');
  const text = lineB.slice(lastSpace + 1);

  const openBracketsCount = (textBefore.match(/\[/g) || []).length;
  const closeBracketsCount = (textBefore.match(/\]/g) || []).length;

  const suggestHeader = lastSpace === -1 && !text.includes('-');

  const shouldHaveBrackets = openBracketsCount === closeBracketsCount;

  const startTime = Date.now();

  const completionItems = sharedIndex2().autoCompleteItems()
    .filter((a: AutocompleteItem): boolean => suggestHeader || a.type !== AutocompleteType.HEADER)
    .map((a): [AutocompleteItem, number] => [a, ScoringUtils.scoreAutocomplete(text, a.text)])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50)
    .map(([a, score], index): CompletionItem => {
      const insert = shouldHaveBrackets
        ? `${AcData[a.type].prefix}${a.completion}${AcData[a.type].suffix}`
        : a.completion;
      return {
        label: a.text + ` (${score.toFixed(2)})`,
        insertText: insert,
        filterText: text, // Was toAutocompleteString(a.text). Trying to override vscode's own filtering
        kind: AcData[a.type].type,
        sortText: String(index + 1).padStart(2, '0'),
      };
    });

  const endTime = Date.now();
  const executionTime = endTime - startTime;
  console.log(`Autocomplete constructed in ${executionTime}ms`);

  return completionItems;
};

export class AutocompleteItem {
  constructor(public text: string, public type: AutocompleteType, public completion: string = text) { }

  getKey(): string {
    return `${this.text}||${this.completion}`;
  }
}

export enum AutocompleteType {
  LINK,
  HREF,
  HASHTAG,
  HEADER,
  STATIC,
  DATE
}

const AcData = {
  [AutocompleteType.LINK]: { prefix: '[[', suffix: ']]', type: vscode.CompletionItemKind.Text },
  [AutocompleteType.HREF]: { prefix: '[[', suffix: ']]', type: vscode.CompletionItemKind.Text },
  [AutocompleteType.HASHTAG]: { prefix: '#', suffix: '', type: vscode.CompletionItemKind.Unit },
  [AutocompleteType.HEADER]: { prefix: '', suffix: '', type: vscode.CompletionItemKind.Folder },
  [AutocompleteType.STATIC]: { prefix: '', suffix: '', type: vscode.CompletionItemKind.Constructor },
  [AutocompleteType.DATE]: { prefix: '[[', suffix: ']]', type: vscode.CompletionItemKind.Event }
};

const linkTypeToAutocompleteType = (lt: LinkType): AutocompleteType => {
  switch (lt) {
    case LinkType.LINK:
      return AutocompleteType.LINK;
    case LinkType.HREF:
      return AutocompleteType.HREF;
    case LinkType.HASHTAG:
      return AutocompleteType.HASHTAG;
    case LinkType.HEADING:
      return AutocompleteType.HEADER;
    default:
      throw new Error(`Can't map LinkType: ${lt}`);
  }
};

export const buildAutocompleteItems = (index: Index2): AutocompleteItem[] => {
  const lls = index.linkLocations().filter(ll => ll.type !== LinkType.UNLINKED).map(ll => new AutocompleteItem(ll.link.linkName(), linkTypeToAutocompleteType(ll.type)));
  const files = index.allFiles().map(f => new AutocompleteItem(f.link.linkName(), AutocompleteType.LINK));
  let items = [...lls, ...files, ...autocompleteStatics()];


  const visited = new Set<string>();
  items = items.filter(aci => {
    if (visited.has(aci.getKey())) {
      return false;
    }
    visited.add(aci.getKey());
    return true;
  });

  return items;
};



function autocompleteStatics(): AutocompleteItem[] {
  const statics: AutocompleteItem[] = [];

  const todayString = new Date().toISOString().slice(0, 10);
  statics.push(new AutocompleteItem('Today', AutocompleteType.DATE, todayString));

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toISOString().slice(0, 10);
  statics.push(new AutocompleteItem('Yesterday', AutocompleteType.DATE, yesterdayString));

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowString = tomorrow.toISOString().slice(0, 10);
  statics.push(new AutocompleteItem('Tomorrow', AutocompleteType.DATE, tomorrowString));

  //days
  [1, 2, 3, 4, 5, 6].forEach((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const dayString = d.toISOString().slice(0, 10);
    const day = d.toLocaleString('en', { weekday: 'long' });
    statics.push(new AutocompleteItem(day, AutocompleteType.DATE, dayString));
  });

  //next days
  [0, 1, 2, 3, 4, 5, 6].forEach((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset) + 7;
    const dayString = d.toISOString().slice(0, 10);
    const day = 'Next ' + d.toLocaleString('en', { weekday: 'long' });
    statics.push(new AutocompleteItem(day, AutocompleteType.DATE, dayString));
  });

  // Dates and months
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formatterMonth = new Intl.DateTimeFormat('en-US', {
    month: 'long'
  });
  Array.from({ length: 364 }, (_, i) => i + 1).forEach((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset) + 7;
    const d_string = d.toISOString().slice(0, 10);
    const day = formatter.format(d);
    statics.push(new AutocompleteItem(day, AutocompleteType.DATE, d_string));

    const d_month = d.toISOString().slice(0, 7);
    const month = formatterMonth.format(d);
    statics.push(new AutocompleteItem(month, AutocompleteType.DATE, d_month));
  });

  statics.push(new AutocompleteItem('TODO', AutocompleteType.STATIC));
  statics.push(new AutocompleteItem('DOING', AutocompleteType.STATIC));
  statics.push(new AutocompleteItem('DONE', AutocompleteType.STATIC));
  statics.push(new AutocompleteItem('THOUGHT', AutocompleteType.STATIC));
  statics.push(new AutocompleteItem('QUESTION', AutocompleteType.STATIC));
  statics.push(new AutocompleteItem('TODO', AutocompleteType.STATIC));

  return statics;
}

export function parseDate(dateString: string): Date | null {
  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!regex.test(dateString)) {
    return null;
  }

  const date = new Date(dateString);
  const [year, month, day] = dateString.split('-').map(Number);
  if (date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day) {
    return date;
  }

  return null;
}