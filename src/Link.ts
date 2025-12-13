import * as path from 'path';
import * as fs from 'fs';
import { sharedIndex2, pagesFolderPath, workspaceFolderPath } from './Index2';

const _rawToFilePath: Map<string, string> = new Map();

export class Link {
  public raw: string = 'unset';

  public static fromRawLink(raw: string): Link {
    const l = new Link();
    l.raw = raw;

    return l;
  }

  public static fromFilePath(filePath: string): Link {
    const raw = path.basename(filePath).replace(/___/g, '/').replace(/\.md$/, "");
    const l = new Link();
    l.raw = raw;

    _rawToFilePath.set(raw, filePath);
    return l;
  }

  public fileName(): string {
    return this.raw.replace(/\//g, '___').replace(/'/g, "") + '.md';
  }

  public filePath(): string {
    return _rawToFilePath.get(this.raw) || path.join(pagesFolderPath() || '', this.fileName());
  }

  public isDate(): boolean {
    const str = this.linkName().replaceAll("_", "-"); // Legacy support for underscores as date separators
    return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
  }

  public getDate(): Date | null {
    if (this.isDate()) {
      return new Date(this.linkName().replaceAll("_", "-")); // Legacy support for underscores as date separators
    }
    return null;
  }

  public fileExists(): boolean {
    const filePath = this.filePath();
    return fs.existsSync(filePath);
  }

  public fileContent(): string | null {
    if (!this.fileExists()) {
      return null;
    }

    const filePath = this.filePath();
    return fs.readFileSync(filePath, 'utf-8');
  }

  public relativeFilePath(): string {
    const filePathParts = path.parse(this.filePath());
    const filePath = filePathParts.dir.replace(workspaceFolderPath() || '', '');
    const fileName = filePathParts.base;

    return path.join(filePath, fileName);
  }

  public linkName(): string {
    return this.raw;
  }

  public linkNameParts(): string[] {
    return this.linkName().split('/');
  }

  public linkNamePartsLast(): string {
    return this.linkName().split('/').at(-1) as string;
  }

  public id(): string {
    return this.linkName().replace(/\//g, '___').replace(/'/g, "");
  }
}
