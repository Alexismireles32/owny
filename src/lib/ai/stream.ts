// src/lib/ai/stream.ts
// Kimi Research v2 §6 — Streaming with tool calls assembly pattern

import OpenAI from 'openai';

export interface StreamContentDelta {
    type: 'content_delta';
    content: string;
}

export interface StreamToolCalls {
    type: 'tool_calls';
    toolCalls: AssembledToolCall[];
    content: string;
}

export interface StreamComplete {
    type: 'complete';
    content: string;
}

export interface StreamError {
    type: 'error';
    error: string;
}

export type StreamEvent = StreamContentDelta | StreamToolCalls | StreamComplete | StreamError;

export interface AssembledToolCall {
    id: string;
    type: string;
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Stream chat completions from Kimi with tool-call assembly.
 * Per Kimi Research v2 §6:
 * - content streams first via delta.content
 * - tool_calls stream after, using index field to distinguish multiple calls
 * - First chunk of tool_call includes id + function.name
 * - Subsequent chunks accumulate function.arguments
 */
export async function* streamWithToolCalls(
    client: OpenAI,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[],
    config: {
        model: string;
        temperature: number;
        max_tokens: number;
        top_p?: number;
        extra_body?: Record<string, unknown>;
    }
): AsyncGenerator<StreamEvent> {
    try {
        const stream = await client.chat.completions.create({
            model: config.model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            temperature: config.temperature,
            top_p: config.top_p ?? 0.95,
            max_tokens: config.max_tokens,
            stream: true,
            ...(config.extra_body || {}),
        });

        let contentBuffer = '';
        const toolCallsBuffer = new Map<number, AssembledToolCall>();
        let finishReason: string | null = null;

        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Accumulate content
            if (delta?.content) {
                contentBuffer += delta.content;
                yield { type: 'content_delta', content: delta.content };
            }

            // Accumulate tool calls (index-based assembly)
            if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCallsBuffer.has(idx)) {
                        toolCallsBuffer.set(idx, {
                            id: '',
                            type: 'function',
                            function: { name: '', arguments: '' },
                        });
                    }
                    const existing = toolCallsBuffer.get(idx)!;

                    if (tc.id) existing.id = tc.id;
                    if (tc.type) existing.type = tc.type;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) {
                        existing.function.arguments += tc.function.arguments;
                    }
                }
            }

            if (choice.finish_reason) {
                finishReason = choice.finish_reason;
            }
        }

        if (finishReason === 'tool_calls') {
            yield {
                type: 'tool_calls',
                toolCalls: Array.from(toolCallsBuffer.values()),
                content: contentBuffer,
            };
        } else if (finishReason === 'stop') {
            yield { type: 'complete', content: contentBuffer };
        } else if (finishReason === 'length') {
            yield { type: 'error', error: 'Response truncated — increase max_tokens' };
        }
    } catch (err) {
        yield {
            type: 'error',
            error: err instanceof Error ? err.message : 'Unknown streaming error',
        };
    }
}
