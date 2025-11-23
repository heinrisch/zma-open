import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EmbeddingClient, EmbeddingConfig } from './EmbeddingClient';
import { sharedIndex2, isIndexReady, Index2, processMdFile } from './Index2';
import { LinkType } from './LinkLocation';
import { EmbeddingStorage, EmbeddingItem } from './EmbeddingStorage';

export class SemanticSearch {
    private client: EmbeddingClient;
    private embeddings: EmbeddingItem[] = [];
    private isGenerating: boolean = false;
    private storage: EmbeddingStorage;
    private legacyEmbeddingsPath: string;

    constructor(config: EmbeddingConfig) {
        this.client = new EmbeddingClient(config);
        const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!folder) {
            throw new Error("No workspace folder found");
        }
        this.storage = new EmbeddingStorage(folder);
        this.legacyEmbeddingsPath = path.join(folder, 'embeddings.json');

        // Initialize async
        this.init();
    }

    private async init() {
        await this.storage.migrate(this.legacyEmbeddingsPath);
        await this.loadIndex();
    }

    public async generateEmbeddings() {
        if (this.isGenerating) {
            console.log("Already generating embeddings");
            return;
        }
        this.isGenerating = true;
        console.log("Starting embedding generation...");

        try {
            while (!isIndexReady()) {
                console.log("Index not ready, waiting 1s...");
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const index = sharedIndex2();
            const linkLocations = index.linkLocations().filter(ll => ll.type === LinkType.LINK);

            // Create a map of existing embeddings for quick lookup
            // Key: filePath:line:linkName
            const existingMap = new Map<string, EmbeddingItem>();
            this.embeddings.forEach(item => {
                const key = `${item.filePath}:${item.line}:${item.linkName}`;
                existingMap.set(key, item);
            });

            const currentKeys = new Set<string>();
            const itemsToEmbed: { linkName: string, context: string, filePath: string, line: number }[] = [];

            for (const ll of linkLocations) {
                const context = ll.context.fullContext;
                const sourcePath = ll.location.link.filePath();

                if (context && context.trim().length > 0) {
                    const key = `${sourcePath}:${ll.location.row}:${ll.link.linkName()}`;
                    currentKeys.add(key);

                    const existing = existingMap.get(key);
                    // If it doesn't exist, or the context has changed, we need to embed it
                    if (!existing || existing.context !== context.trim()) {
                        itemsToEmbed.push({
                            linkName: ll.link.linkName(),
                            context: context.trim(),
                            filePath: sourcePath,
                            line: ll.location.row
                        });
                    }
                }
            }

            // Remove stale embeddings
            const initialCount = this.embeddings.length;
            const staleFiles = new Set<string>();

            const newEmbeddings = this.embeddings.filter(item => {
                const key = `${item.filePath}:${item.line}:${item.linkName}`;
                if (!currentKeys.has(key)) {
                    staleFiles.add(item.filePath);
                    return false;
                }
                return true;
            });

            if (newEmbeddings.length !== initialCount) {
                console.log(`Removed ${initialCount - newEmbeddings.length} stale embeddings.`);
                this.embeddings = newEmbeddings;
                // Save files that had removals
                for (const filePath of staleFiles) {
                    await this.saveFile(filePath);
                }
            }

            if (itemsToEmbed.length === 0) {
                console.log("No new or updated contexts to embed.");
                return;
            }

            console.log(`Found ${itemsToEmbed.length} new/updated contexts to embed.`);

            // Process in batches
            const batchSize = 10;
            let sinceLastSave = 0;
            const modifiedFiles = new Set<string>();

            for (let i = 0; i < itemsToEmbed.length; i += batchSize) {
                const batch = itemsToEmbed.slice(i, i + batchSize);
                const contexts = batch.map(item => item.context);

                try {
                    const vectors = await this.client.createEmbedding(contexts);

                    for (let j = 0; j < batch.length; j++) {
                        const item = batch[j];

                        // Remove any existing entry for this key before pushing the new one (for updates)
                        this.embeddings = this.embeddings.filter(e =>
                            !(e.filePath === item.filePath && e.line === item.line && e.linkName === item.linkName)
                        );

                        this.embeddings.push({
                            ...item,
                            embedding: vectors[j]
                        });

                        modifiedFiles.add(item.filePath);
                    }

                    sinceLastSave += batch.length;

                    if (i % 100 === 0) {
                        console.log(`Embedded ${i} / ${itemsToEmbed.length} items`);
                    }

                    // Save every 50 items
                    if (sinceLastSave >= 50) {
                        for (const filePath of modifiedFiles) {
                            await this.saveFile(filePath);
                        }
                        modifiedFiles.clear();
                        sinceLastSave = 0;
                    }
                } catch (e) {
                    console.error("Error embedding batch:", e);
                }
            }

            // Final save
            for (const filePath of modifiedFiles) {
                await this.saveFile(filePath);
            }

            console.log(`Finished generating embeddings. Total: ${this.embeddings.length}`);

        } catch (error) {
            console.error("Error generating embeddings:", error);
        } finally {
            this.isGenerating = false;
        }
    }

    public async updateForFile(filePath: string, content: string) {
        console.log(`Updating embeddings for ${filePath}`);

        // Remove existing embeddings for this file
        const initialCount = this.embeddings.length;
        this.embeddings = this.embeddings.filter(e => e.filePath !== filePath);
        const removedCount = initialCount - this.embeddings.length;
        console.log(`Removed ${removedCount} existing embeddings for file.`);

        try {
            const zmaFile = await processMdFile(content, filePath);
            const linkLocations = zmaFile.linkLocations.filter(ll => ll.type === LinkType.LINK);

            const itemsToEmbed: { linkName: string, context: string, filePath: string, line: number }[] = [];

            for (const ll of linkLocations) {
                // For a single file update, the "source" is the file itself.
                // ll.location.link is the source link.
                // ll.context.fullContext is the context.

                const context = ll.context.fullContext;

                if (context && context.trim().length > 0) {
                    itemsToEmbed.push({
                        linkName: ll.link.linkName(),
                        context: context.trim(),
                        filePath: filePath,
                        line: ll.location.row
                    });
                }
            }

            if (itemsToEmbed.length === 0) {
                console.log("No contexts found to embed in file.");
                await this.saveFile(filePath); // Save empty to clear file
                return;
            }

            console.log(`Found ${itemsToEmbed.length} new contexts to embed.`);

            const contexts = itemsToEmbed.map(item => item.context);
            const vectors = await this.client.createEmbedding(contexts);

            for (let i = 0; i < itemsToEmbed.length; i++) {
                this.embeddings.push({
                    ...itemsToEmbed[i],
                    embedding: vectors[i]
                });
            }

            console.log(`Added ${itemsToEmbed.length} new embeddings.`);
            await this.saveFile(filePath);

        } catch (error) {
            console.error(`Error updating embeddings for file ${filePath}:`, error);
        }
    }

    private async saveFile(filePath: string) {
        const fileItems = this.embeddings.filter(e => e.filePath === filePath);
        await this.storage.saveFileEmbeddings(filePath, fileItems);
    }

    private async loadIndex() {
        this.embeddings = await this.storage.loadAll();
        console.log(`Loaded ${this.embeddings.length} embeddings from disk.`);
    }

    public async search(query: string, limit: number = 10): Promise<EmbeddingItem[]> {
        if (this.embeddings.length === 0) {
            return [];
        }

        try {
            const queryEmbedding = (await this.client.createEmbedding(query))[0];

            const scored = this.embeddings.map(item => ({
                item,
                score: this.cosineSimilarity(queryEmbedding, item.embedding)
            }));

            scored.sort((a, b) => b.score - a.score);

            return scored.slice(0, limit).map(s => s.item);
        } catch (e) {
            console.error("Search failed:", e);
            return [];
        }
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}

export function loadEmbeddingConfig(): EmbeddingConfig | null {
    const folder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!folder) {
        return null;
    }
    const configPath = path.join(folder, 'embedding-config.json');
    if (!fs.existsSync(configPath)) {
        // Create default if not exists, though McpServer might handle this too or we just return null
        // The user asked to create a similar config.
        const defaultConfig: EmbeddingConfig = {
            baseUrl: "http://localhost:11434",
            model: "nomic-embed-text",
            dimensions: 768
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData) as EmbeddingConfig;
    } catch (error) {
        console.error('Failed to load embedding config:', error);
        return null;
    }
}
