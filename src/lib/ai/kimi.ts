// src/lib/ai/kimi.ts
// PRD §4.1 — Kimi K2.5 client configuration via OpenAI SDK

import OpenAI from 'openai';

export const DEFAULT_KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.5';
export type MoonshotThinkingConfig = { thinking?: { type: 'disabled' } };
export type MoonshotChatCompletionRequest =
    OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & MoonshotThinkingConfig;
export type MoonshotChatCompletionStreamingRequest =
    OpenAI.Chat.ChatCompletionCreateParamsStreaming & MoonshotThinkingConfig;

export function getKimiClient(): OpenAI {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
        throw new Error('KIMI_API_KEY is not set');
    }

    return new OpenAI({
        apiKey,
        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
    });
}

/**
 * Builder calls use Instant mode (fast, cheap).
 * Used for: Product DSL generation, block improvements.
 */
export const BUILDER_CONFIG = {
    model: DEFAULT_KIMI_MODEL,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 16384,
    thinking: { type: 'disabled' as const },
} as const;

/**
 * For complex layout decisions, use Thinking mode.
 * Used for: Complex multi-step reasoning (future research agent).
 */
export const BUILDER_THINKING_CONFIG = {
    model: DEFAULT_KIMI_MODEL,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 16384,
    // thinking enabled by default
} as const;
