// src/lib/ai/formula.ts
// Kimi Research v2 §4 — Moonshot Formula System Client
// Formulas are lightweight serverless functions that extend Kimi's capabilities.
// Each official tool is a Formula with a semantic URI (e.g. moonshot/web-search:latest).

import OpenAI from 'openai';
import { log } from '@/lib/logger';

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

/**
 * Maps function names returned by a Formula to the Formula URI that owns them.
 * Used during tool-call dispatch to know which Formula endpoint to hit.
 */
export interface FormulaToolMapping {
    [functionName: string]: string; // function_name → formula_uri
}

/**
 * Fiber execution result from the Fibers API.
 */
interface FiberResult {
    id: string;
    status: 'succeeded' | 'failed' | 'timeout' | 'cancelled';
    context?: {
        input?: string;
        output?: string;
        encrypted_output?: string; // web-search returns this — pass to model as-is
        error?: string;
    };
    error?: string;
}

// ────────────────────────────────────────
// Available Formulas (from official docs)
// ────────────────────────────────────────

/**
 * All 12 official Moonshot Formula URIs.
 * Use these constants to avoid typos.
 */
export const FORMULA_URIS = {
    WEB_SEARCH: 'moonshot/web-search:latest',
    CODE_RUNNER: 'moonshot/code_runner:latest',
    RETHINK: 'moonshot/rethink:latest',
    FETCH: 'moonshot/fetch:latest',
    EXCEL: 'moonshot/excel:latest',
    QUICKJS: 'moonshot/quickjs:latest',
    MEMORY: 'moonshot/memory:latest',
    DATE: 'moonshot/date:latest',
    CONVERT: 'moonshot/convert:latest',
    BASE64: 'moonshot/base64:latest',
    RANDOM_CHOICE: 'moonshot/random-choice:latest',
    MEW: 'moonshot/mew:latest',
} as const;

/**
 * Recommended Formula URIs for Owny.
 *
 * Builder agent: web-search (for niche research), rethink (strategic reflection)
 * Future research agent: + fetch, code_runner
 */
export const OWNY_FORMULA_URIS = [
    FORMULA_URIS.WEB_SEARCH,
    FORMULA_URIS.RETHINK,
] as const;

// ────────────────────────────────────────
// FormulaClient
// ────────────────────────────────────────

export class FormulaClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl?: string, apiKey?: string) {
        this.baseUrl = baseUrl || process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
        this.apiKey = apiKey || process.env.KIMI_API_KEY || '';
    }

    /**
     * Fetch tool schemas from a Formula URI.
     * Returns OpenAI-compatible tool definitions + a mapping of function names → URIs.
     *
     * GET /v1/formulas/{namespace}/{name}:{tag}/tools
     */
    async getTools(formulaUri: string): Promise<{
        tools: OpenAI.Chat.ChatCompletionTool[];
        mapping: FormulaToolMapping;
    }> {
        const url = `${this.baseUrl}/formulas/${formulaUri}/tools`;

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${this.apiKey}` },
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            log.error('Formula getTools failed', { formulaUri, status: res.status, error: errorText });
            return { tools: [], mapping: {} };
        }

        const data = (await res.json()) as { tools?: OpenAI.Chat.ChatCompletionTool[] };
        const tools = data.tools ?? [];

        const mapping: FormulaToolMapping = {};
        for (const tool of tools) {
            const name = (tool as { function?: { name?: string } }).function?.name;
            if (name) {
                mapping[name] = formulaUri;
            }
        }

        log.info('Formula tools loaded', {
            formulaUri,
            toolCount: tools.length,
            names: Object.keys(mapping),
        });

        return { tools, mapping };
    }

    /**
     * Execute a Formula function via the Fibers API.
     * Returns the output string to pass back to the model as the tool result.
     *
     * POST /v1/formulas/{namespace}/{name}:{tag}/fibers
     * Body: { name: "function_name", arguments: "{...json string...}" }
     *
     * IMPORTANT: For web-search, the response includes `encrypted_output`
     * which MUST be passed to the model as-is (Kimi can decrypt it internally).
     */
    async callTool(
        formulaUri: string,
        functionName: string,
        args: Record<string, unknown>
    ): Promise<string> {
        const url = `${this.baseUrl}/formulas/${formulaUri}/fibers`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: functionName,
                arguments: JSON.stringify(args),
            }),
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            log.error('Formula callTool failed', { formulaUri, functionName, status: res.status });
            return `Error: Formula execution failed (${res.status}): ${errorText}`;
        }

        const fiber = (await res.json()) as FiberResult;

        if (fiber.status === 'succeeded') {
            // Return encrypted_output for web-search (model can read it),
            // otherwise return regular output
            const output =
                fiber.context?.encrypted_output ??
                fiber.context?.output ??
                'No output';

            log.info('Formula tool executed', {
                formulaUri,
                functionName,
                hasEncryptedOutput: !!fiber.context?.encrypted_output,
                outputLength: output.length,
            });

            return output;
        }

        // Error cases
        const errorMsg =
            fiber.error ??
            fiber.context?.error ??
            fiber.context?.output ??
            `Unknown error (status: ${fiber.status})`;

        log.error('Formula tool execution failed', { formulaUri, functionName, error: errorMsg });
        return `Error: ${errorMsg}`;
    }
}

/**
 * Load multiple Formula tool schemas at startup.
 * Deduplicates by function name (first occurrence wins).
 *
 * Returns:
 * - allTools: OpenAI-compatible tool definitions to pass to chat.completions
 * - toolToUri: mapping of function name → Formula URI for dispatch
 */
export async function loadFormulas(
    client: FormulaClient,
    formulaUris: readonly string[]
): Promise<{
    allTools: OpenAI.Chat.ChatCompletionTool[];
    toolToUri: FormulaToolMapping;
}> {
    const allTools: OpenAI.Chat.ChatCompletionTool[] = [];
    const toolToUri: FormulaToolMapping = {};
    const seenNames = new Set<string>();

    for (const uri of formulaUris) {
        try {
            const { tools, mapping } = await client.getTools(uri);

            for (const tool of tools) {
                const name = (tool as { function?: { name?: string } }).function?.name;
                if (!name || seenNames.has(name)) continue; // Skip duplicates (401 error if dupes)
                seenNames.add(name);
                allTools.push(tool);
                toolToUri[name] = mapping[name];
            }
        } catch (err) {
            log.error('Failed to load formula', {
                uri,
                error: err instanceof Error ? err.message : 'Unknown',
            });
        }
    }

    log.info('All formulas loaded', {
        formulaCount: formulaUris.length,
        totalTools: allTools.length,
        toolNames: Object.keys(toolToUri),
    });

    return { allTools, toolToUri };
}

/**
 * Create a tool executor function for Formula tools.
 * This integrates with the toolExecutors registry in router.ts.
 */
export function createFormulaExecutors(
    client: FormulaClient,
    toolToUri: FormulaToolMapping
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
    const executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};

    for (const [funcName, uri] of Object.entries(toolToUri)) {
        executors[funcName] = async (args) => {
            return client.callTool(uri, funcName, args);
        };
    }

    return executors;
}
