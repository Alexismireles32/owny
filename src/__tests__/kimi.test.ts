import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import {
    getKimiTaskSampling,
    kimiModelSupportsCustomSampling,
    requestKimiChatCompletion,
} from '@/lib/ai/kimi';

describe('kimi shared client helpers', () => {
    it('returns lower-variance sampling for structured tasks', () => {
        expect(getKimiTaskSampling('analysis_json')).toEqual({
            temperature: 0.25,
            topP: 0.9,
        });
        expect(getKimiTaskSampling('strict_json', 'enabled')).toEqual({
            temperature: 0.2,
            topP: 0.9,
        });
    });

    it('treats kimi-k2.5 as a fixed-sampling model', () => {
        expect(kimiModelSupportsCustomSampling('kimi-k2.5')).toBe(false);
        expect(kimiModelSupportsCustomSampling('kimi-k2.5-thinking')).toBe(false);
        expect(kimiModelSupportsCustomSampling('moonshot-v1-8k')).toBe(true);
    });

    it('applies preset sampling and shared request options to raw chat calls', async () => {
        const create = vi.fn().mockResolvedValue({
            model: 'kimi-k2.5',
            usage: {
                prompt_tokens: 120,
                completion_tokens: 80,
                total_tokens: 200,
            },
            choices: [
                {
                    finish_reason: 'stop',
                    message: {
                        content: '{"ok":true}',
                    },
                },
            ],
        });

        const client = {
            chat: {
                completions: {
                    create,
                },
            },
        } as unknown as OpenAI;

        await requestKimiChatCompletion({
            client,
            model: 'moonshot-v1-8k',
            messages: [
                { role: 'system', content: 'Return JSON.' },
                { role: 'user', content: 'Hello.' },
            ],
            maxTokens: 1234,
            thinking: 'disabled',
            preset: 'analysis_json',
            operation: 'test.kimi.raw',
            toolChoice: 'auto',
            parallelToolCalls: true,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'lookup',
                        description: 'Lookup data',
                        parameters: { type: 'object', properties: {} },
                    },
                },
            ],
            responseFormat: { type: 'json_object' },
        });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            temperature: 0.25,
            top_p: 0.9,
            max_completion_tokens: 1234,
            thinking: { type: 'disabled' },
            tool_choice: 'auto',
            parallel_tool_calls: true,
            response_format: { type: 'json_object' },
        }));
    });

    it('omits unsupported sampling parameters for fixed-sampling kimi models', async () => {
        const create = vi.fn().mockResolvedValue({
            model: 'kimi-k2.5',
            usage: {
                prompt_tokens: 20,
                completion_tokens: 10,
                total_tokens: 30,
            },
            choices: [
                {
                    finish_reason: 'stop',
                    message: {
                        content: 'ok',
                    },
                },
            ],
        });

        const client = {
            chat: {
                completions: {
                    create,
                },
            },
        } as unknown as OpenAI;

        await requestKimiChatCompletion({
            client,
            model: 'kimi-k2.5',
            messages: [
                { role: 'system', content: 'Say ok.' },
                { role: 'user', content: 'ok' },
            ],
            preset: 'analysis_json',
            operation: 'test.kimi.fixed_sampling',
        });

        const request = create.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(request).not.toHaveProperty('temperature');
        expect(request).not.toHaveProperty('top_p');
    });
});
