import OpenAI from 'openai';
import { z } from 'zod';
import {
    getKimiClient,
    requestKimiChatCompletion,
    type KimiTaskPreset,
    type KimiThinkingMode,
} from '@/lib/ai/kimi';
import {
    createFormulaExecutors,
    FORMULA_URIS,
    FormulaClient,
    loadFormulas,
} from '@/lib/ai/formula';

type FormulaExecutor = (args: Record<string, unknown>) => Promise<unknown>;

let webSearchToolCache: {
    tools: OpenAI.Chat.ChatCompletionTool[];
    executors: Record<string, FormulaExecutor>;
} | null = null;

export function createKimiClient(): OpenAI {
    return getKimiClient();
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```$/i, '');
    try {
        return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            try {
                return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
            } catch {
                return null;
            }
        }
        return null;
    }
}

export function extractJsonArray(raw: string): unknown[] | null {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```$/i, '');
    try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
            try {
                const parsed = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
                return Array.isArray(parsed) ? parsed : null;
            } catch {
                return null;
            }
        }
        return null;
    }
}

async function getWebSearchFormulaTools(): Promise<{
    tools: OpenAI.Chat.ChatCompletionTool[];
    executors: Record<string, FormulaExecutor>;
}> {
    if (webSearchToolCache) {
        return webSearchToolCache;
    }

    const client = new FormulaClient();
    const { allTools, toolToUri } = await loadFormulas(client, [FORMULA_URIS.WEB_SEARCH]);
    const executors = createFormulaExecutors(client, toolToUri);

    if (allTools.length === 0 || Object.keys(executors).length === 0) {
        throw new Error('Moonshot web-search formula tools are unavailable');
    }

    webSearchToolCache = {
        tools: allTools,
        executors,
    };

    return webSearchToolCache;
}

function parseToolArguments(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function getStructuredPreset(
    thinkingMode: KimiThinkingMode,
    preset?: KimiTaskPreset
): KimiTaskPreset {
    if (preset) return preset;
    return thinkingMode === 'enabled' ? 'analysis_json' : 'strict_json';
}

export async function requestKimiStructuredObject<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    thinking?: 'enabled' | 'disabled';
    operation?: string;
    preset?: KimiTaskPreset;
}): Promise<T> {
    const thinkingMode = input.thinking ?? 'disabled';
    const preset = getStructuredPreset(thinkingMode, input.preset);
    const response = await requestKimiChatCompletion({
        messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
        ],
        responseFormat: { type: 'json_object' },
        maxTokens: input.maxTokens ?? 4096,
        thinking: thinkingMode,
        preset,
        operation: input.operation || 'kimi.structured_object',
    });

    const text = response.choices[0]?.message?.content ?? '';
    const parsedJson = extractJsonObject(text);
    if (!parsedJson) {
        throw new Error('Kimi returned invalid JSON object');
    }

    const parsed = input.schema.safeParse(parsedJson);
    if (!parsed.success) {
        throw new Error(`Kimi JSON object failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
}

export async function requestKimiStructuredArray<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    thinking?: 'enabled' | 'disabled';
    operation?: string;
    preset?: KimiTaskPreset;
}): Promise<T> {
    const thinkingMode = input.thinking ?? 'disabled';
    const preset = getStructuredPreset(thinkingMode, input.preset);
    const response = await requestKimiChatCompletion({
        messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
        ],
        maxTokens: input.maxTokens ?? 4096,
        thinking: thinkingMode,
        preset,
        operation: input.operation || 'kimi.structured_array',
    });

    const text = response.choices[0]?.message?.content ?? '';
    const parsedJson = extractJsonArray(text);
    if (!parsedJson) {
        throw new Error('Kimi returned invalid JSON array');
    }

    const parsed = input.schema.safeParse(parsedJson);
    if (!parsed.success) {
        throw new Error(`Kimi JSON array failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
}

export async function requestKimiTextCompletion(input: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    thinking?: 'enabled' | 'disabled';
    operation?: string;
    preset?: KimiTaskPreset;
}): Promise<string> {
    const thinkingMode = input.thinking ?? 'disabled';
    const preset = input.preset ?? (thinkingMode === 'enabled' ? 'analysis_json' : 'creative_text');
    const response = await requestKimiChatCompletion({
        messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
        ],
        maxTokens: input.maxTokens ?? 4096,
        thinking: thinkingMode,
        preset,
        operation: input.operation || 'kimi.text_completion',
    });

    return response.choices[0]?.message?.content?.trim() ?? '';
}

export async function requestKimiStructuredObjectWithWebSearch<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    maxRounds?: number;
    operation?: string;
    thinking?: 'enabled' | 'disabled';
}): Promise<T> {
    const kimi = createKimiClient();
    const { tools, executors } = await getWebSearchFormulaTools();
    const thinkingMode = input.thinking ?? 'enabled';
    const preset: KimiTaskPreset = 'web_research';
    const maxRounds = Math.max(1, Math.min(input.maxRounds ?? 4, 6));
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
    ];
    const seenCalls = new Set<string>();

    for (let round = 0; round < maxRounds; round += 1) {
        const response = await requestKimiChatCompletion({
            client: kimi,
            messages,
            tools,
            toolChoice: 'auto',
            parallelToolCalls: true,
            thinking: thinkingMode,
            preset,
            maxTokens: input.maxTokens ?? 4096,
            operation: input.operation || 'kimi.web_search_json',
        });

        const choice = response.choices[0];
        const message = choice?.message;

        if (choice?.finish_reason === 'tool_calls' && message?.tool_calls?.length) {
            messages.push(message as unknown as OpenAI.Chat.ChatCompletionMessageParam);

            for (const toolCall of message.tool_calls) {
                const functionName =
                    'function' in toolCall && toolCall.function?.name
                        ? toolCall.function.name
                        : '';
                const toolArguments =
                    'function' in toolCall && toolCall.function?.arguments
                        ? toolCall.function.arguments
                        : '{}';
                const callKey = `${functionName}:${toolArguments}`;

                if (seenCalls.has(callKey)) {
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({
                            error: 'Duplicate tool call detected. Use the search results you already have and return the final JSON object.',
                        }),
                    } as unknown as OpenAI.Chat.ChatCompletionMessageParam);
                    continue;
                }
                seenCalls.add(callKey);

                const executor = executors[functionName];
                const toolResult = executor
                    ? await executor(parseToolArguments(toolArguments))
                    : { error: `Unknown tool: ${functionName}` };

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                } as unknown as OpenAI.Chat.ChatCompletionMessageParam);
            }

            continue;
        }

        const text = message?.content ?? '';
        const parsedJson = extractJsonObject(text);
        if (!parsedJson) {
            throw new Error('Kimi web-search response did not contain a valid JSON object');
        }

        const parsed = input.schema.safeParse(parsedJson);
        if (!parsed.success) {
            throw new Error(`Kimi web-search JSON object failed schema validation: ${parsed.error.message}`);
        }

        return parsed.data;
    }

    throw new Error(`Kimi web-search request exceeded ${maxRounds} rounds without a final structured response`);
}
