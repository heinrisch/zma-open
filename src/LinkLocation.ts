import { bulletRegionLines } from './Decorators';
import { Link } from './Link';
import * as vscode from 'vscode';

export class Location {
  constructor(
    public link: Link,
    public row: number,
    public column: number,
  ) { }
}

export class LinkLocation {
  private constructor(
    public link: Link,
    public location: Location,
    public type: LinkType,
    public url: string | null,
    public context: Context,
  ) { }

  static create(
    fileContent: string,
    link: Link,
    sourceLink: Link,
    row: number,
    column: number,
    type: LinkType,
    url: string | null = null
  ): LinkLocation {
    const location = new Location(sourceLink, row, column);
    const context = contextForRow(sourceLink, link.linkName(), fileContent, row);
    return new LinkLocation(link, location, type, url, context);
  }
}

export enum LinkType {
  LINK,
  HREF,
  HASHTAG,
  HEADING,
  PERSON
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


class Heading {
  constructor(public readonly prio: number, public readonly text: string) { }
}

export class Context {
  constructor(public readonly headings: Heading[],
    public readonly date: Date | null,
    public readonly destinationLinkSpecificity: number,
    public readonly row: string,
    public readonly fullContext: string) { }
}

export const contextForRow = (sourceLink: Link, destinationLinkRaw: string, fileContent: string, rowNumber: number): Context => {
  if (fileContent === 'bla') {
    return new Context([], null, 2, "", "");
  }

  const rows = fileContent.split('\n');
  const row = rows[rowNumber];

  const pattern = /^(#+) (.*)/;
  const ignorePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}.*/;
  const headings: Heading[] = [];
  for (let r = 0; r <= rowNumber; r++) {
    const match = rows[r].match(pattern);
    if (match) {
      const prio = match[1].length;
      const heading = match[2];
      if (heading.includes("°C") || ignorePattern.test(heading)) {
        continue;
      }
      while (headings.length > 0 && headings[headings.length - 1].prio <= prio) {
        headings.pop();
      }
      headings.push(new Heading(prio, heading));
    }
  }

  const date = parseDate(sourceLink.linkName());

  const bulletRegions = bulletRegionLines(fileContent);
  const printRegion = bulletRegions.find((region) =>
    region.contains(new vscode.Position(rowNumber, 0))
  )!;

  let fullContext = row;

  if (printRegion) {
    fullContext = fileContent
      .split('\n')
      .slice(printRegion.start.line, printRegion.end.line + 1)
      .join('\n');
  }

  const dateRegexFour = /^(202[0-9]|2030)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const dateRegexThree = /^(202[0-9]|2030)[/-](0[1-9]|1[0-2])$/;
  const dateRegexTwo = /^(202[0-9]|2030)[/-](Q[1-4])$/;
  const dateRegexOne = /^(202[0-9]|2030)$/;

  let destinationLinkSpecificity = 0;
  if (dateRegexFour.test(destinationLinkRaw)) {
    destinationLinkSpecificity = 4;
  }
  if (dateRegexThree.test(destinationLinkRaw)) {
    destinationLinkSpecificity = 3;
  }
  if (dateRegexTwo.test(destinationLinkRaw)) {
    destinationLinkSpecificity = 2;
  }
  if (dateRegexOne.test(destinationLinkRaw)) {
    destinationLinkSpecificity = 1;
  }


  return new Context(headings, date, destinationLinkSpecificity, row, fullContext);
};

// Offset just past the end of the link's match. HASHTAG/HEADING have a
// zero-width span.
export function linkEndOffset(ll: LinkLocation, text: string, start: number): number {
  switch (ll.type) {
    case LinkType.LINK: // [[text]]
      return text.indexOf(']]', start + 2) + 2;
    case LinkType.PERSON: // @[text]
      return text.indexOf(']', start + 2) + 1;
    case LinkType.HREF: { // [text](url)
      const urlStart = text.indexOf('](', start + 1);
      const urlEnd = text.indexOf(')', urlStart + 2);
      return urlEnd + 1;
    }
    default:
      return start;
  }
}

// The link whose span contains the cursor, if any. `types` restricts which
// link kinds are considered (e.g. references/definition skip HASHTAG/HEADING).
export function findLinkAtCursor(
  linkLocations: LinkLocation[],
  document: vscode.TextDocument,
  position: vscode.Position,
  types?: LinkType[],
): LinkLocation | undefined {
  const text = document.getText();
  const cursorOffset = document.offsetAt(position);
  return linkLocations.find(ll => {
    if (types && !types.includes(ll.type)) { return false; }
    const start = document.offsetAt(new vscode.Position(ll.location.row, ll.location.column));
    const end = linkEndOffset(ll, text, start);
    return cursorOffset >= start && cursorOffset <= end;
  });
}