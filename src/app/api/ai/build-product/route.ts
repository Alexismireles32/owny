// POST /api/ai/build-product
// PRD §8.5: Build Packet → HTML+Tailwind product page (Claude→Kimi fallback)
// Default: Full HTML code generation
// Legacy DSL: ?mode=dsl for backward compatibility
// Streaming: ?stream=true (DSL streaming via Kimi agent loop)
// Body: { buildPacket }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateDSLWithRetry, generateProductWithRetry, KimiBuilder } from '@/lib/ai/router';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import type { BuildPacket } from '@/types/build-packet';

export async function POST(request: Request) {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting: 20 AI requests/hour per creator
    const rl = rateLimitResponse(user.id, 'ai');
    if (rl) return rl;

    // Verify creator
    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const body = await request.json();
    const { buildPacket } = body as { buildPacket: BuildPacket };

    if (!buildPacket || !buildPacket.productType) {
        return NextResponse.json(
            { error: 'buildPacket is required' },
            { status: 400 }
        );
    }

    // Check for streaming mode
    const url = new URL(request.url);
    const isStreaming = url.searchParams.get('stream') === 'true';

    // Check for legacy DSL mode (backward compat)
    const useLegacyDSL = url.searchParams.get('mode') === 'dsl';

    if (isStreaming) {
        return handleStreaming(buildPacket, creator.id);
    }

    // Legacy DSL mode (backward compatibility)
    if (useLegacyDSL) {
        try {
            const { dsl, model } = await generateDSLWithRetry(buildPacket, creator.id);
            return NextResponse.json({
                dsl,
                metadata: {
                    model,
                    generatedAt: new Date().toISOString(),
                    pageCount: dsl.pages?.length || 0,
                    blockCount: dsl.pages?.reduce((sum, p) => sum + (p.blocks?.length || 0), 0) || 0,
                },
            });
        } catch (err) {
            log.error('Build product error (DSL)', { error: err instanceof Error ? err.message : 'Unknown' });
            return NextResponse.json({
                error: err instanceof Error ? err.message : 'Failed to generate product',
                manualEditRequired: true,
            }, { status: 500 });
        }
    }

    // Default: Full HTML code generation
    try {
        const { html, dsl, model } = await generateProductWithRetry(buildPacket, creator.id);

        return NextResponse.json({
            html,
            dsl,
            metadata: {
                model,
                generatedAt: new Date().toISOString(),
                htmlLength: html.length,
            },
        });
    } catch (err) {
        log.error('Build product error (HTML)', { error: err instanceof Error ? err.message : 'Unknown' });

        return NextResponse.json({
            error: err instanceof Error ? err.message : 'Failed to generate product',
            manualEditRequired: true,
        }, { status: 500 });
    }
}

/**
 * Handle streaming response using Server-Sent Events.
 * Uses the real streaming agent loop to show Kimi's tool activity in real-time.
 */
async function handleStreaming(buildPacket: BuildPacket, creatorId: string): Promise<Response> {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
                send('progress', { stage: 'starting', message: 'Initializing AI builder...' });

                const kimi = new KimiBuilder();
                let finalContent = '';

                for await (const event of kimi.generateDSLStreaming(buildPacket, creatorId)) {
                    switch (event.type) {
                        case 'tool_start':
                            send('progress', {
                                stage: 'tool',
                                message: formatToolMessage(event.tool!, 'start'),
                                tool: event.tool,
                                iteration: event.iteration,
                            });
                            break;

                        case 'tool_result':
                            send('progress', {
                                stage: 'tool',
                                message: formatToolMessage(event.tool!, 'done'),
                                tool: event.tool,
                                iteration: event.iteration,
                            });
                            break;

                        case 'content_delta':
                            // §6: Kimi explaining what it's doing — show to user
                            send('progress', {
                                stage: 'thinking',
                                message: event.message,
                                iteration: event.iteration,
                            });
                            break;

                        case 'complete':
                            finalContent = event.content ?? '';
                            break;

                        case 'error':
                            send('error', {
                                error: event.message,
                                manualEditRequired: true,
                            });
                            controller.close();
                            return;
                    }
                }

                // Parse the final DSL and send it
                if (finalContent) {
                    const jsonStr = finalContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                    const dsl = JSON.parse(jsonStr);

                    send('progress', { stage: 'validating', message: 'Validating structure...' });

                    send('complete', {
                        dsl,
                        metadata: {
                            model: 'kimi-k2.5-streaming',
                            generatedAt: new Date().toISOString(),
                            pageCount: dsl.pages?.length || 0,
                            blockCount: dsl.pages?.reduce(
                                (sum: number, p: { blocks?: unknown[] }) => sum + (p.blocks?.length || 0),
                                0
                            ) || 0,
                        },
                    });
                }
            } catch (err) {
                send('error', {
                    error: err instanceof Error ? err.message : 'Failed to generate product',
                    manualEditRequired: true,
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

/**
 * Human-readable tool activity messages for the SSE stream.
 */
function formatToolMessage(tool: string, phase: 'start' | 'done'): string {
    const labels: Record<string, { start: string; done: string }> = {
        get_clip_cards: {
            start: 'Searching your video library...',
            done: 'Found relevant content from your videos',
        },
        get_creator_brand: {
            start: 'Loading your brand identity...',
            done: 'Brand colors and style loaded',
        },
        validate_product_dsl: {
            start: 'Validating product structure...',
            done: 'Product structure validated',
        },
        web_search: {
            start: 'Researching niche market data...',
            done: 'Market research complete',
        },
        rethink: {
            start: 'Reflecting on product strategy...',
            done: 'Strategic reflection complete',
        },
    };

    return labels[tool]?.[phase] ?? `${phase === 'start' ? 'Running' : 'Completed'} ${tool}`;
}
