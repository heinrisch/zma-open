import * as fs from 'fs';
import * as path from 'path';
import { RegexPatterns } from './RegexPatterns';
import { get } from 'http';
import { sharedIndex2, workspaceFolderPath } from './Index2';


class FileBackedMap {
    private separator = ';,;';
    private filePath: string;
    private map: Map<string, string> = new Map();

    constructor(filePath: string) {
        this.filePath = filePath;
        this.load();
    }

    private load() {
        this.map.clear();
        if (fs.existsSync(this.filePath)) {
            const content = fs.readFileSync(this.filePath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const sepIndex = line.indexOf(this.separator);
                if (sepIndex > 0) {
                    const key = line.substring(0, sepIndex).trim();
                    const value = line.substring(sepIndex + this.separator.length).trim();
                    this.map.set(key, value);
                }
            }
        }
    }

    private save() {
        let content = '';
        const keys = Array.from(this.map.keys());
        for (const key of keys) {
            const value = this.map.get(key);
            content += `${key}${this.separator}${value}\n`;
        }
        fs.writeFileSync(this.filePath, content);
    }

    public get(key: string): string | undefined {
        return this.map.get(key);
    }

    public set(key: string, value: string) {
        this.map.set(key, value);
        this.save();
    }

    public has(key: string): boolean {
        return this.map.has(key);
    }

    public allKeys(): string[] {
        return Array.from(this.map.keys());
    }
}


export class LinkShortener {
    private _shortToHref: FileBackedMap | null = null;

    private get shortToHref(): FileBackedMap {
        if (this._shortToHref) return this._shortToHref;
        const folder = workspaceFolderPath();
        if (!folder) {
            throw new Error("Workspace folder not found for LinkShortener");
        }
        this._shortToHref = new FileBackedMap(path.join(folder, 'link_shortener.index'));
        return this._shortToHref;
    }

    private shortNameSpace = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    private generateShortFromIndex(n: number): string {
        let short = '';
        let current = n;
        do {
            const nextIndex = current % this.shortNameSpace.length;
            short += this.shortNameSpace[nextIndex];
            current = Math.floor(current / this.shortNameSpace.length) - 1;
        } while (current >= 0);

        return '&' + short;
    }

    private createNewShort(): string {
        let index = this.shortToHref.allKeys().length;
        let short = '';
        while (true) {
            short = this.generateShortFromIndex(index);
            if (!this.shortToHref.has(short)) {
                return short;
            }
            index++;
        }
    }

    private getOrCreateShort(href: string): string {
        let short = this.shortToHref.allKeys().find(key => this.shortToHref.get(key) === href);

        if (!short) {
            short = this.createNewShort();

            if (this.shortToHref.has(short)) {
                throw new Error(`Collision detected when creating short link: ${short} for href: ${href}`);
            }

            this.shortToHref.set(short, href);
        }
        return short;
    }

    public getHref(short: string): string | undefined {
        if (!short.startsWith('&')) return undefined;
        return this.shortToHref.get(short);
    }

    public shortenContent(content: string): string {
        return content.replace(RegexPatterns.RE_HREF(), (match, title, url) => {
            if (url.startsWith('http')) {
                const short = this.getOrCreateShort(url);
                return `[${title}](${short})`;
            }
            return match;
        });
    }

    public expandContent(content: string): string {
        return content.replace(RegexPatterns.RE_HREF(), (match, title, url) => {
            if (url.startsWith('&')) {
                const full = this.getHref(url);
                if (full) {
                    return `[${title}](${full})`;
                }
            }
            return match;
        });
    }
}


const instance = new LinkShortener();
export const sharedLinkShortener = () => instance;
