import * as https from 'https';
import * as http from 'http';

export interface EmbeddingConfig {
    baseUrl: string;
    model: string;
    dimensions?: number;
    apiKey?: string;
}

export interface EmbeddingResponse {
    object: string;
    data: Array<{
        object: string;
        embedding: number[];
        index: number;
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

export class EmbeddingClient {
    private config: EmbeddingConfig;

    constructor(config: EmbeddingConfig) {
        this.config = config;
    }

    async createEmbedding(input: string | string[]): Promise<number[][]> {
        const request = {
            model: this.config.model,
            input: input
        };

        const endpoint = 'embeddings';

        const response = await this.makeRequest(endpoint, request);

        if (!response.data || response.data.length === 0) {
            throw new Error('No embedding data returned');
        }

        // Sort by index to ensure order matches input
        return response.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    }

    private async makeRequest(
        endpoint: string,
        body: any
    ): Promise<EmbeddingResponse> {
        let baseUrl = this.config.baseUrl;
        if (!baseUrl.endsWith('/')) {
            baseUrl += '/';
        }

        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        const url = new URL(cleanEndpoint, baseUrl);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const postData = JSON.stringify(body);

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
            }
        };

        return new Promise((resolve, reject) => {
            const req = httpModule.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            const response = JSON.parse(data) as EmbeddingResponse;
                            resolve(response);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''} (${url.toString()}): ${data}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request to ${url.toString()} failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            req.setTimeout(120 * 1000);
            req.write(postData);
            req.end();
        });
    }
}
