import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface EmbeddingItem {
    linkName: string;
    context: string;
    embedding: number[];
    filePath: string;
    line: number;
}

export class EmbeddingStorage {
    private storageDir: string;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.storageDir = path.join(workspaceRoot, 'embeddings');
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    public getEmbeddingFilename(filePath: string): string {
        let relativePath = filePath;
        if (filePath.startsWith(this.workspaceRoot)) {
            relativePath = path.relative(this.workspaceRoot, filePath);
        }

        // Replace path separators and other unsafe chars with underscores
        // We want to keep the structure somewhat visible but flattened
        const safeName = relativePath.replace(/[\/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
        return path.join(this.storageDir, `${safeName}.json`);
    }

    public async saveFileEmbeddings(filePath: string, items: EmbeddingItem[]) {
        const filename = this.getEmbeddingFilename(filePath);
        try {
            if (items.length === 0) {
                if (fs.existsSync(filename)) {
                    await fs.promises.unlink(filename);
                }
                return;
            }
            await fs.promises.writeFile(filename, JSON.stringify(items, null, 2));
        } catch (error) {
            console.error(`Failed to save embeddings for ${filePath}:`, error);
        }
    }

    public async loadAll(): Promise<EmbeddingItem[]> {
        const allItems: EmbeddingItem[] = [];
        if (!fs.existsSync(this.storageDir)) {
            return allItems;
        }

        const files = await fs.promises.readdir(this.storageDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.promises.readFile(path.join(this.storageDir, file), 'utf8');
                    const items = JSON.parse(content) as EmbeddingItem[];
                    allItems.push(...items);
                } catch (error) {
                    console.error(`Failed to load embeddings from ${file}:`, error);
                }
            }
        }
        return allItems;
    }

    public async migrate(oldPath: string) {
        if (!fs.existsSync(oldPath)) {
            return;
        }

        console.log("Migrating legacy embeddings.json to shards...");
        try {
            const content = await fs.promises.readFile(oldPath, 'utf8');
            const allItems = JSON.parse(content) as EmbeddingItem[];

            // Group by filePath
            const byFile = new Map<string, EmbeddingItem[]>();
            for (const item of allItems) {
                const existing = byFile.get(item.filePath) || [];
                existing.push(item);
                byFile.set(item.filePath, existing);
            }

            for (const [filePath, items] of byFile.entries()) {
                await this.saveFileEmbeddings(filePath, items);
            }

            // Rename old file to .bak
            await fs.promises.rename(oldPath, oldPath + '.bak');
            console.log("Migration complete.");
        } catch (error) {
            console.error("Migration failed:", error);
        }
    }
}
