// src/lib/ai/kimi.ts
// PRD §4.1 — Kimi K2.5 client configuration via OpenAI SDK

import OpenAI from 'openai';
import { log } from '@/lib/logger';

export const DEFAULT_KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.5';
export type MoonshotThinkingConfig = { thinking?: { type: KimiThinkingMode } };
export type MoonshotChatCompletionRequest =
    OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & MoonshotThinkingConfig;
export type MoonshotChatCompletionStreamingRequest =
    OpenAI.Chat.ChatCompletionCreateParamsStreaming & MoonshotThinkingConfig;
export type KimiThinkingMode = 'enabled' | 'disabled';
export type KimiTaskPreset =
    | 'strict_json'
    | 'analysis_json'
    | 'web_research'
    | 'creative_text'
    | 'creative_html'
    | 'surgical_edit';

interface KimiTaskSampling {
    temperature: number;
    topP: number;
}

interface KimiRawChatCompletionInput {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    maxTokens?: number;
    thinking?: KimiThinkingMode;
    preset: KimiTaskPreset;
    operation: string;
    client?: OpenAI;
    model?: string;
    tools?: OpenAI.Chat.ChatCompletionTool[];
    toolChoice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
    parallelToolCalls?: boolean;
    responseFormat?: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format'];
}

const TASK_SAMPLING: Record<KimiTaskPreset, KimiTaskSampling> = {
    strict_json: {
        temperature: 0.15,
        topP: 0.85,
    },
    analysis_json: {
        temperature: 0.25,
        topP: 0.9,
    },
    web_research: {
        temperature: 0.22,
        topP: 0.9,
    },
    creative_text: {
        temperature: 0.55,
        topP: 0.95,
    },
    creative_html: {
        temperature: 0.5,
        topP: 0.92,
    },
    surgical_edit: {
        temperature: 0.35,
        topP: 0.9,
    },
};

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

export function getKimiTaskSampling(
    preset: KimiTaskPreset,
    thinkingMode: KimiThinkingMode = 'disabled'
): KimiTaskSampling {
    const base = TASK_SAMPLING[preset];
    if (thinkingMode === 'disabled') {
        return base;
    }

    return {
        temperature: Math.min(base.temperature + 0.05, 0.35),
        topP: Math.max(base.topP, 0.9),
    };
}

export function kimiModelSupportsCustomSampling(model: string): boolean {
    return !/^kimi-k2\.5($|[-_])/i.test(model);
}

export function logKimiUsage(input: {
    operation: string;
    preset: KimiTaskPreset;
    thinkingMode: KimiThinkingMode;
    durationMs: number;
    response: OpenAI.Chat.ChatCompletion;
}) {
    const usage = input.response.usage;

    log.ai(input.operation, {
        durationMs: input.durationMs,
        model: input.response.model || DEFAULT_KIMI_MODEL,
        preset: input.preset,
        thinkingMode: input.thinkingMode,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
    });
}

export async function requestKimiChatCompletion(
    input: KimiRawChatCompletionInput
): Promise<OpenAI.Chat.ChatCompletion> {
    const client = input.client ?? getKimiClient();
    const model = input.model ?? DEFAULT_KIMI_MODEL;
    const thinkingMode = input.thinking ?? 'disabled';
    const sampling = getKimiTaskSampling(input.preset, thinkingMode);
    const startedAt = Date.now();
    const supportsCustomSampling = kimiModelSupportsCustomSampling(model);

    const response = await client.chat.completions.create(
        {
            model,
            messages: input.messages,
            thinking: { type: thinkingMode },
            max_completion_tokens: input.maxTokens ?? 4096,
            tools: input.tools,
            tool_choice: input.toolChoice,
            parallel_tool_calls: input.parallelToolCalls,
            response_format: input.responseFormat,
            ...(supportsCustomSampling
                ? {
                    temperature: sampling.temperature,
                    top_p: sampling.topP,
                }
                : {}),
        } as MoonshotChatCompletionRequest
    );

    logKimiUsage({
        operation: input.operation,
        preset: input.preset,
        thinkingMode,
        durationMs: Date.now() - startedAt,
        response,
    });

    return response;
}
