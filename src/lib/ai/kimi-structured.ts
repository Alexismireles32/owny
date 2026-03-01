import OpenAI from 'openai';
import { z } from 'zod';
import { DEFAULT_KIMI_MODEL, type MoonshotChatCompletionRequest } from '@/lib/ai/kimi';

export function createKimiClient(): OpenAI {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
        throw new Error('KIMI_API_KEY is not set');
    }

    return new OpenAI({
        apiKey,
        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
    });
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

export async function requestKimiStructuredObject<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    thinking?: 'enabled' | 'disabled';
}): Promise<T> {
    const kimi = createKimiClient();
    const thinkingMode = input.thinking ?? 'disabled';
    const response = await kimi.chat.completions.create(
        {
            model: DEFAULT_KIMI_MODEL,
            messages: [
                { role: 'system', content: input.systemPrompt },
                { role: 'user', content: input.userPrompt },
            ],
            response_format: { type: 'json_object' },
            thinking: { type: thinkingMode },
            temperature: thinkingMode === 'enabled' ? 1 : 0.6,
            top_p: 0.95,
            max_completion_tokens: input.maxTokens ?? 4096,
        } as MoonshotChatCompletionRequest
    );

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
}): Promise<T> {
    const kimi = createKimiClient();
    const thinkingMode = input.thinking ?? 'disabled';
    const response = await kimi.chat.completions.create(
        {
            model: DEFAULT_KIMI_MODEL,
            messages: [
                { role: 'system', content: input.systemPrompt },
                { role: 'user', content: input.userPrompt },
            ],
            thinking: { type: thinkingMode },
            temperature: thinkingMode === 'enabled' ? 1 : 0.6,
            top_p: 0.95,
            max_completion_tokens: input.maxTokens ?? 4096,
        } as MoonshotChatCompletionRequest
    );

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
}): Promise<string> {
    const kimi = createKimiClient();
    const thinkingMode = input.thinking ?? 'disabled';
    const response = await kimi.chat.completions.create(
        {
            model: DEFAULT_KIMI_MODEL,
            messages: [
                { role: 'system', content: input.systemPrompt },
                { role: 'user', content: input.userPrompt },
            ],
            thinking: { type: thinkingMode },
            temperature: thinkingMode === 'enabled' ? 1 : 0.6,
            top_p: 0.95,
            max_completion_tokens: input.maxTokens ?? 4096,
        } as MoonshotChatCompletionRequest
    );

    return response.choices[0]?.message?.content?.trim() ?? '';
}
