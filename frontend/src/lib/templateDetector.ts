import templates from '../config/templates.json';

// Template definitions
export interface TemplateAdapter {
    system_start?: string;
    system_end?: string;
    user_start: string;
    user_end: string;
    assistant_start: string;
    assistant_end: string;
    tools_start?: string;
    tools_end?: string;
}

export interface Template {
    search: string[];
    name: string;
    adapter: TemplateAdapter;
}

interface APIResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

export class TemplateDetector {
    private static readonly PROBE_MESSAGE = "Hello";
    private static readonly TIMEOUT = 10000; // 10 second timeout
    private static readonly CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
    private static templateCache: Map<string, { template: Template | null; timestamp: number }> = new Map();

    /**
     * Probes an API endpoint to detect the chat completion template
     */
    public static async detectTemplate(apiUrl: string, apiKey?: string): Promise<Template | null> {
        // Check cache first
        const cached = this.checkCache(apiUrl);
        if (cached) return cached;

        try {
            // Send a simple probe message
            const response = await this.sendProbe(apiUrl, apiKey);
            
            if (!response) {
                console.warn("No response received from probe");
                return this.cacheResult(apiUrl, null);
            }

            // Try to match the response against known patterns
            const template = this.findMatchingTemplate(response);
            return this.cacheResult(apiUrl, template);

        } catch (error) {
            console.error("Template detection failed:", error);
            return this.cacheResult(apiUrl, null);
        }
    }

    /**
     * Sends a probe message to the API
     */
    private static async sendProbe(apiUrl: string, apiKey?: string): Promise<string> {
        // Ensure URL ends with /v1/chat/completions
        const fullUrl = apiUrl.endsWith('/') ? apiUrl + 'v1/chat/completions' : 
                       apiUrl + '/v1/chat/completions';

        console.log("Sending probe to:", fullUrl);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

        try {
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: [{ 
                        role: 'user', 
                        content: this.PROBE_MESSAGE 
                    }],
                    max_tokens: 50,
                    temperature: 0.7
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const data = await response.json() as APIResponse;
            return data.choices?.[0]?.message?.content || '';

        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Finds the template that best matches the response
     */
    private static findMatchingTemplate(response: string): Template | null {
        // First try exact matches
        for (const template of templates) {
            if (template.search.every(pattern => response.includes(pattern))) {
                console.log(`Detected template via exact match: ${template.name}`);
                return template;
            }
        }

        // If no exact match, try to infer from response format
        if (response.includes('<|im_start|>') || response.includes('<|im_end|>')) {
            console.log('Detected ChatML-style template');
            return templates.find(t => t.name === 'ChatML (Generic)') || null;
        }

        if (response.includes('[/INST]')) {
            console.log('Detected Mistral-style template');
            return templates.find(t => t.name === 'Mistral (Generic)') || null;
        }

        // If we got a response but can't determine template, use Mistral as fallback
        if (response.trim()) {
            console.log('Using Mistral template as fallback');
            return templates.find(t => t.name === 'Mistral (Generic)') || null;
        }

        return null;
    }

    /**
     * Checks the cache for a valid template result
     */
    private static checkCache(apiUrl: string): Template | null | undefined {
        const cached = this.templateCache.get(apiUrl);
        if (!cached) return undefined;

        const now = Date.now();
        if (now - cached.timestamp > this.CACHE_DURATION) {
            this.templateCache.delete(apiUrl);
            return undefined;
        }

        return cached.template;
    }

    /**
     * Caches a template result
     */
    private static cacheResult(apiUrl: string, template: Template | null): Template | null {
        this.templateCache.set(apiUrl, {
            template,
            timestamp: Date.now()
        });
        return template;
    }

    /**
     * Clears the template cache
     */
    public static clearCache(): void {
        this.templateCache.clear();
    }
}