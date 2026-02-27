// POST /api/ai/build-product
// PRD §8.5: Build Packet → HTML+Tailwind product page (Claude→Kimi fallback)
// Default: Full HTML code generation
// Legacy DSL: ?mode=dsl for backward compatibility
// Streaming: ?stream=true (DSL streaming via Kimi agent loop)
// Body: { buildPacket }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateDSLWithRetry, generateProductWithRetry, KimiBuilder } from '@/lib/ai/router';
import { buildCreatorDNA, buildCreatorDNAContext } from '@/lib/ai/creator-dna';
import {
    buildDesignCanonContext,
    chooseCreativeDirection,
    getEvergreenDesignCanon,
} from '@/lib/ai/design-canon';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { runEvergreenCriticLoop } from '@/lib/ai/critic-loop';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import type { BuildPacket } from '@/types/build-packet';

async function loadCreatorCatalogHtml(
    supabase: Awaited<ReturnType<typeof createClient>>,
    creatorId: string
): Promise<string[]> {
    const { data: products, error: productsError } = await supabase
        .from('products')
        .select('active_version_id')
        .eq('creator_id', creatorId)
        .not('active_version_id', 'is', null)
        .limit(30);

    if (productsError || !products || products.length === 0) {
        return [];
    }

    const versionIds = products
        .map((row) => row.active_version_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, 30);

    if (versionIds.length === 0) return [];

    const { data: versions, error: versionsError } = await supabase
        .from('product_versions')
        .select('generated_html')
        .in('id', versionIds)
        .limit(30);

    if (versionsError || !versions) {
        return [];
    }

    return versions
        .map((row) => row.generated_html)
        .filter((html): html is string => typeof html === 'string' && html.trim().length > 0);
}

function buildSourceContextFromPacket(buildPacket: BuildPacket): string {
    return (buildPacket.sources || [])
        .slice(0, 25)
        .map((source, idx) => {
            const bullets = Array.isArray(source.keyBullets) ? source.keyBullets.slice(0, 8) : [];
            const tags = Array.isArray(source.tags) ? source.tags.slice(0, 8) : [];

            return `--- SOURCE ${idx + 1} [ID: ${source.videoId}] ---
TITLE: ${source.title || 'Untitled'}
TAGS: ${tags.length > 0 ? tags.join(', ') : 'N/A'}
KEY BULLETS:
${bullets.length > 0 ? bullets.map((item) => `- ${item}`).join('\n') : '- (none)'}
---`;
        })
        .join('\n\n');
}

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
        .select('id, handle, display_name, bio, brand_tokens, voice_profile')
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
        const sourceVideoIds = (buildPacket.sources || [])
            .map((source) => source.videoId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        const catalogHtml = await loadCreatorCatalogHtml(supabase, creator.id);

        const creatorDna = buildCreatorDNA({
            handle: creator.handle,
            displayName: creator.display_name,
            bio: creator.bio,
            voiceProfile: (creator.voice_profile as Record<string, unknown> | null) || null,
            brandTokens: (creator.brand_tokens as Record<string, unknown> | null) || null,
        });
        const creatorDnaContext = buildCreatorDNAContext(creatorDna);
        const designCanon = getEvergreenDesignCanon();
        const creativeDirection = chooseCreativeDirection({
            productType: buildPacket.productType,
            creatorId: creator.id,
            topicQuery: buildPacket.userPrompt || 'creator product',
            creatorMood: creatorDna.visual.mood,
            priorProductCount: catalogHtml.length,
        });
        const designCanonContext = buildDesignCanonContext(designCanon, creativeDirection);
        const sourceContext = buildSourceContextFromPacket(buildPacket);

        let finalHtml = html;
        let qualityEvaluation = evaluateProductQuality({
            html: finalHtml,
            productType: buildPacket.productType,
            sourceVideoIds,
            catalogHtml,
            brandTokens: (creator.brand_tokens as Record<string, unknown> | null) || null,
            creatorHandle: creator.handle,
            qualityWeights: designCanon.qualityWeights,
        });

        let criticIterations = 0;
        let criticModels: string[] = [];

        if (!qualityEvaluation.overallPassed) {
            try {
                const criticResult = await runEvergreenCriticLoop({
                    html: finalHtml,
                    productType: buildPacket.productType,
                    sourceVideoIds,
                    catalogHtml,
                    brandTokens: (creator.brand_tokens as Record<string, unknown> | null) || null,
                    creatorHandle: creator.handle,
                    creatorDisplayName: creator.display_name || creator.handle,
                    topicQuery: buildPacket.userPrompt || 'creator product',
                    originalRequest: buildPacket.userPrompt || 'Build a creator digital product',
                    creatorDnaContext,
                    designCanonContext,
                    directionId: creativeDirection.id,
                    contentContext: sourceContext,
                    maxIterations: 2,
                    qualityWeights: designCanon.qualityWeights,
                });

                finalHtml = criticResult.html;
                qualityEvaluation = criticResult.evaluation;
                criticIterations = criticResult.iterationsRun;
                criticModels = criticResult.modelTrail;
            } catch (criticError) {
                log.warn('Evergreen critic loop failed in /api/ai/build-product', {
                    error: criticError instanceof Error ? criticError.message : 'Unknown critic error',
                    creatorId: creator.id,
                });
            }
        }

        return NextResponse.json({
            html: finalHtml,
            dsl,
            metadata: {
                model,
                generatedAt: new Date().toISOString(),
                htmlLength: finalHtml.length,
                qualityScore: qualityEvaluation.overallScore,
                qualityPassed: qualityEvaluation.overallPassed,
                failingGates: qualityEvaluation.failingGates,
                designCanonVersion: designCanon.version,
                creativeDirectionId: creativeDirection.id,
                criticIterations,
                criticModels,
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
