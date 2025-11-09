import * as https from 'https';
import * as http from 'http';

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmCompletionRequest {
    model: string;
    messages: LlmMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

export interface LlmCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: LlmMessage;
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface LlmClientConfig {
    baseUrl: string;
    apiKey?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * LLM Client for OpenAI-compatible APIs
 * Uses only Node.js built-in modules (https, http) - no external dependencies
 */
export class LlmClient {
    private config: LlmClientConfig;

    constructor(config: LlmClientConfig) {
        this.config = config;
    }

    /**
     * Send a completion request to the LLM API
     */
    async complete(messages: LlmMessage[]): Promise<string> {
        const request: LlmCompletionRequest = {
            model: this.config.model,
            messages,
            temperature: this.config.temperature ?? 0.7,
            max_tokens: this.config.maxTokens ?? 2000,
            stream: false
        };

        const response = await this.makeRequest('/v1/chat/completions', request);
        
        if (!response.choices || response.choices.length === 0) {
            throw new Error('No completion choices returned from LLM');
        }

        return response.choices[0].message.content;
    }

    /**
     * Make an HTTP request to the LLM API
     */
    private async makeRequest(
        endpoint: string,
        body: LlmCompletionRequest
    ): Promise<LlmCompletionResponse> {
        const url = new URL(endpoint, this.config.baseUrl);
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
                            const response = JSON.parse(data) as LlmCompletionResponse;
                            resolve(response);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            req.setTimeout(60000); // 60 second timeout
            req.write(postData);
            req.end();
        });
    }
}
