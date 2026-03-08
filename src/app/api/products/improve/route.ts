// POST /api/products/improve — SSE streaming endpoint for follow-up product edits
// Uses staged Kimi section refinement instead of monolithic whole-page rewrites

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { buildBrowserQaFeedbackForPrompt, runProductBrowserQa } from '@/lib/ai/browser-qa';
import { buildCreatorDNA, buildCreatorDNAContext } from '@/lib/ai/creator-dna';
import { buildDesignCanonContext, chooseCreativeDirection, getEvergreenDesignCanon } from '@/lib/ai/design-canon';
import { runEvergreenCriticLoop, runGuidedCriticRepairPass } from '@/lib/ai/critic-loop';
import {
    chooseStricterImproveBaseline,
    getImproveSaveRejection,
    parseQualityWeights,
    parseImproveQualitySnapshot,
    toImproveQualitySnapshot,
} from '@/lib/ai/improve-save-policy';
import { extractSections, improveProductWithKimiStages } from '@/lib/ai/kimi-product-improve';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { loadSourceEvidenceBundle } from '@/lib/ai/source-evidence';
import { log } from '@/lib/logger';
import { loadCreatorCatalogHtml } from '@/lib/products/catalog-html';
import type { ProductType } from '@/types/build-packet';

interface ActiveVersionRow {
    id: string;
    version_number: number;
    build_packet: Record<string, unknown> | null;
    source_video_ids: string[] | null;
}

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

const IMPROVE_TIMEOUT_MS = 240_000;
const CRITIC_LOOP_TIMEOUT_MS = 120_000;
const BROWSER_QA_TIMEOUT_MS = 25_000;

function normalizeProductType(value: unknown): ProductType {
    switch (value) {
        case 'mini_course':
        case 'challenge_7day':
        case 'checklist_toolkit':
        case 'pdf_guide':
            return value;
        default:
            return 'pdf_guide';
    }
}

function extractHtmlTextContext(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000);
}

function isQualityEvaluationBetter(
    candidate: ReturnType<typeof evaluateProductQuality>,
    current: ReturnType<typeof evaluateProductQuality>
): boolean {
    if (candidate.overallPassed && !current.overallPassed) return true;
    if (candidate.failingGates.length !== current.failingGates.length) {
        return candidate.failingGates.length < current.failingGates.length;
    }
    return candidate.overallScore > current.overallScore;
}

function salvageSectionedImprove(input: {
    currentHtml: string;
    candidateHtml: string;
    touchedSectionIds: string[];
    evaluate: (html: string) => ReturnType<typeof evaluateProductQuality>;
}): {
    html: string;
    evaluation: ReturnType<typeof evaluateProductQuality>;
    revertedSectionIds: string[];
} {
    const originalSections = new Map(extractSections(input.currentHtml).map((section) => [section.id, section.rawHtml]));
    const candidateSections = new Map(extractSections(input.candidateHtml).map((section) => [section.id, section.rawHtml]));

    let bestHtml = input.candidateHtml;
    let bestEvaluation = input.evaluate(bestHtml);
    const revertedSectionIds: string[] = [];

    for (const sectionId of input.touchedSectionIds) {
        const originalSection = originalSections.get(sectionId);
        const candidateSection = candidateSections.get(sectionId);
        if (!originalSection || !candidateSection) continue;
        if (!bestHtml.includes(candidateSection)) continue;

        const revertedHtml = bestHtml.replace(candidateSection, originalSection);
        const revertedEvaluation = input.evaluate(revertedHtml);
        if (isQualityEvaluationBetter(revertedEvaluation, bestEvaluation)) {
            bestHtml = revertedHtml;
            bestEvaluation = revertedEvaluation;
            revertedSectionIds.push(sectionId);
        }
    }

    return {
        html: bestHtml,
        evaluation: bestEvaluation,
        revertedSectionIds,
    };
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let handle: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            work,
            new Promise<T>((_, reject) => {
                handle = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
            }),
        ]);
    } finally {
        if (handle) clearTimeout(handle);
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    let body: { productId: string; instruction: string; currentHtml: string };
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    const { productId, instruction, currentHtml } = body;
    if (!productId || !instruction || !currentHtml) {
        return new Response(JSON.stringify({ error: 'productId, instruction, and currentHtml required' }), { status: 400 });
    }

    const { data: creator, error: creatorError } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

    if (creatorError) {
        return new Response(JSON.stringify({ error: creatorError.message }), { status: 500 });
    }

    if (!creator) {
        return new Response(JSON.stringify({ error: 'Creator profile required' }), { status: 403 });
    }

    const db = getServiceDb();
    const { data: product } = await db
        .from('products')
        .select('id, creator_id, title, type, status, active_version_id')
        .eq('id', productId)
        .eq('creator_id', creator.id)
        .single();

    if (!product) {
        return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    const { data: creatorProfile, error: creatorProfileError } = await db
        .from('creators')
        .select('id, handle, display_name, bio, brand_tokens, voice_profile')
        .eq('id', creator.id)
        .single();

    if (creatorProfileError || !creatorProfile) {
        return new Response(JSON.stringify({ error: creatorProfileError?.message || 'Creator profile not found' }), { status: 500 });
    }

    let activeVersion: ActiveVersionRow | null = null;

    if (product.active_version_id) {
        const { data: version } = await db
            .from('product_versions')
            .select('id, version_number, build_packet, source_video_ids')
            .eq('id', product.active_version_id)
            .maybeSingle();
        activeVersion = (version as ActiveVersionRow | null) || null;
    }

    const { count: priorProductCount } = await db
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creator.id);

    const productType = normalizeProductType(product.type);
    const creatorDna = buildCreatorDNA({
        handle: creatorProfile.handle,
        displayName: creatorProfile.display_name,
        bio: creatorProfile.bio,
        voiceProfile: creatorProfile.voice_profile,
        brandTokens: creatorProfile.brand_tokens,
    });
    const creatorDnaContext = buildCreatorDNAContext(creatorDna);
    const designCanon = getEvergreenDesignCanon();
    const creativeDirection = chooseCreativeDirection({
        productType,
        creatorId: creator.id,
        topicQuery: `${product.title} ${instruction}`,
        creatorMood: creatorDna.visual.mood,
        priorProductCount: priorProductCount || 0,
    });
    const designCanonContext = buildDesignCanonContext(designCanon, creativeDirection);
    const priorBuildPacket = activeVersion?.build_packet || null;
    const sourceVideoIds = Array.isArray(activeVersion?.source_video_ids) ? activeVersion!.source_video_ids : [];
    const brandTokens = creatorProfile.brand_tokens as Record<string, unknown> | null;
    const qualityWeights = parseQualityWeights(priorBuildPacket) || designCanon.qualityWeights;
    const catalogHtml = await loadCreatorCatalogHtml(db, creator.id, { excludeProductId: productId });
    const sourceEvidenceBundle = await loadSourceEvidenceBundle(db, sourceVideoIds);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let closed = false;

            const close = () => {
                if (closed) return;
                closed = true;
                try {
                    controller.close();
                } catch {
                    // already closed
                }
            };

            const send = (event: Record<string, unknown>) => {
                if (closed) return;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            try {
                send({ type: 'status', message: '🧭 Planning your edit with Kimi...', phase: 'planning' });

                const improveResult = await withTimeout(
                    improveProductWithKimiStages({
                        currentHtml,
                        instruction,
                        productType,
                        creatorDisplayName: creatorProfile.display_name || creatorProfile.handle,
                        creatorHandle: creatorProfile.handle,
                        creatorDna,
                        designCanonContext,
                        globalEvidenceContext: sourceEvidenceBundle.combinedContext,
                        sourceEvidenceByVideoId: sourceEvidenceBundle.byVideoId,
                    }),
                    IMPROVE_TIMEOUT_MS,
                    'Kimi staged improve'
                );

                let fullHtml = improveResult.html;
                send({
                    type: 'status',
                    message: `🧠 Kimi refined ${improveResult.touchedSectionIds.length || 1} section(s).`,
                    phase: 'building',
                });
                send({ type: 'html_chunk', html: fullHtml });

                let qualityEvaluation = evaluateProductQuality({
                    html: fullHtml,
                    productType,
                    sourceVideoIds,
                    catalogHtml,
                    brandTokens,
                    creatorHandle: creatorProfile.handle,
                    qualityWeights,
                });
                const evaluateCandidateHtml = (html: string) => evaluateProductQuality({
                    html,
                    productType,
                    sourceVideoIds,
                    catalogHtml,
                    brandTokens,
                    creatorHandle: creatorProfile.handle,
                    qualityWeights,
                });
                const currentQuality = evaluateProductQuality({
                    html: currentHtml,
                    productType,
                    sourceVideoIds,
                    catalogHtml,
                    brandTokens,
                    creatorHandle: creatorProfile.handle,
                    qualityWeights,
                });
                const priorQuality = chooseStricterImproveBaseline(
                    parseImproveQualitySnapshot(priorBuildPacket),
                    toImproveQualitySnapshot(currentQuality)
                );
                let criticIterations = 0;
                let criticModels: string[] = [];
                const stageTimingsMs = { ...improveResult.stageTimingsMs } as Record<string, number>;
                let browserQaReport: Awaited<ReturnType<typeof runProductBrowserQa>> | null = null;
                let initialBrowserQaReport: Awaited<ReturnType<typeof runProductBrowserQa>> | null = null;
                let browserQaRepairAttempted = false;
                let browserQaRepairModel: string | null = null;
                let salvagedSectionIds: string[] = [];

                if (!qualityEvaluation.overallPassed && improveResult.touchedSectionIds.length > 0) {
                    const salvageStart = Date.now();
                    const salvaged = salvageSectionedImprove({
                        currentHtml,
                        candidateHtml: fullHtml,
                        touchedSectionIds: improveResult.touchedSectionIds,
                        evaluate: evaluateCandidateHtml,
                    });

                    if (isQualityEvaluationBetter(salvaged.evaluation, qualityEvaluation)) {
                        salvagedSectionIds = salvaged.revertedSectionIds;
                        fullHtml = salvaged.html;
                        qualityEvaluation = salvaged.evaluation;
                        stageTimingsMs.sectionSalvage = Date.now() - salvageStart;
                        if (salvagedSectionIds.length > 0) {
                            send({
                                type: 'status',
                                message: `🛟 Rebalanced ${salvagedSectionIds.length} section edit(s) to preserve draft quality.`,
                                phase: 'building',
                            });
                            send({ type: 'html_chunk', html: fullHtml });
                        }
                    }
                }

                if (!qualityEvaluation.overallPassed) {
                    send({
                        type: 'status',
                        message: '🧪 Running quality critic pass...',
                        phase: 'building',
                    });

                    try {
                        const criticStart = Date.now();
                        const criticResult = await withTimeout(
                            runEvergreenCriticLoop({
                                html: fullHtml,
                                productType,
                                sourceVideoIds,
                                catalogHtml,
                                brandTokens,
                                creatorHandle: creatorProfile.handle,
                                creatorDisplayName: creatorProfile.display_name || creatorProfile.handle,
                                topicQuery: product.title,
                                originalRequest: instruction,
                                creatorDnaContext,
                                designCanonContext,
                                directionId: creativeDirection.id,
                                contentContext: extractHtmlTextContext(currentHtml),
                                maxIterations: 1,
                                qualityWeights,
                                preferredModel: 'kimi',
                            }),
                            CRITIC_LOOP_TIMEOUT_MS,
                            'Kimi critic loop'
                        );
                        stageTimingsMs.critic = Date.now() - criticStart;
                        fullHtml = criticResult.html;
                        qualityEvaluation = criticResult.evaluation;
                        criticIterations = criticResult.iterationsRun;
                        criticModels = criticResult.modelTrail;
                        send({ type: 'html_chunk', html: fullHtml });
                    } catch (criticError) {
                        stageTimingsMs.critic = stageTimingsMs.critic || CRITIC_LOOP_TIMEOUT_MS;
                        log.warn('Improve critic loop failed; keeping staged improve result', {
                            error: criticError instanceof Error ? criticError.message : 'Unknown critic error',
                            productId,
                        });
                    }
                }

                send({
                    type: 'status',
                    message: '🔎 Running browser QA on desktop and mobile...',
                    phase: 'building',
                });

                const browserQaStart = Date.now();
                browserQaReport = await withTimeout(
                    runProductBrowserQa({
                        html: fullHtml,
                        productType,
                    }),
                    BROWSER_QA_TIMEOUT_MS,
                    'Browser QA'
                );
                stageTimingsMs.browserQa = Date.now() - browserQaStart;
                initialBrowserQaReport = browserQaReport;

                if (browserQaReport.attempted && !browserQaReport.skipped && !browserQaReport.passed) {
                    send({
                        type: 'status',
                        message: `⚠️ Browser QA flagged issues${browserQaReport.score !== null ? ` at ${browserQaReport.score}/100` : ''}. Attempting a targeted Kimi repair pass...`,
                        phase: 'building',
                    });

                    const browserQaRepairStart = Date.now();
                    browserQaRepairAttempted = true;

                    try {
                        const repairFeedback = buildBrowserQaFeedbackForPrompt(browserQaReport);
                        const repairResult = await withTimeout(
                            runGuidedCriticRepairPass({
                                html: fullHtml,
                                feedback: repairFeedback,
                                productType,
                                creatorHandle: creatorProfile.handle,
                                creatorDisplayName: creatorProfile.display_name || creatorProfile.handle,
                                topicQuery: product.title,
                                originalRequest: instruction,
                                creatorDnaContext,
                                designCanonContext,
                                directionId: creativeDirection.id,
                                contentContext: extractHtmlTextContext(fullHtml),
                                preferredModel: 'kimi',
                            }),
                            CRITIC_LOOP_TIMEOUT_MS,
                            'Browser QA repair'
                        );
                        stageTimingsMs.browserQaRepair = Date.now() - browserQaRepairStart;
                        browserQaRepairModel = repairResult.model;
                        criticIterations += 1;
                        criticModels = [...criticModels, repairResult.model];
                        fullHtml = repairResult.html;
                        qualityEvaluation = evaluateProductQuality({
                            html: fullHtml,
                            productType,
                            sourceVideoIds,
                            catalogHtml,
                            brandTokens,
                            creatorHandle: creatorProfile.handle,
                            qualityWeights,
                        });
                        send({ type: 'html_chunk', html: fullHtml });
                        send({
                            type: 'status',
                            message: '🔁 Re-running browser QA after the targeted repair...',
                            phase: 'building',
                        });

                        const browserQaRetryStart = Date.now();
                        browserQaReport = await withTimeout(
                            runProductBrowserQa({
                                html: fullHtml,
                                productType,
                            }),
                            BROWSER_QA_TIMEOUT_MS,
                            'Browser QA retry'
                        );
                        stageTimingsMs.browserQaRetry = Date.now() - browserQaRetryStart;
                    } catch (browserQaRepairError) {
                        stageTimingsMs.browserQaRepair = stageTimingsMs.browserQaRepair || CRITIC_LOOP_TIMEOUT_MS;
                        log.warn('Improve browser QA repair pass failed; keeping best available HTML', {
                            error: browserQaRepairError instanceof Error ? browserQaRepairError.message : 'Unknown browser QA repair error',
                            productId,
                        });
                    }
                }

                send({
                    type: 'status',
                    message: browserQaReport.skipped
                        ? `✅ Quality score ${qualityEvaluation.overallScore}/100 (${qualityEvaluation.overallPassed ? 'pass' : 'partial pass'}). Browser QA skipped in this runtime.`
                        : `✅ Quality score ${qualityEvaluation.overallScore}/100 (${qualityEvaluation.overallPassed ? 'pass' : 'partial pass'}). Browser QA ${browserQaRepairAttempted ? (browserQaReport.passed ? 'passed after targeted repair' : 'still flagged issues') : (browserQaReport.passed ? 'passed' : 'flagged issues')}${browserQaReport.score !== null ? ` at ${browserQaReport.score}/100` : ''}.`,
                    phase: 'building',
                });
                send({ type: 'html_complete', html: fullHtml });

                const saveRejection = getImproveSaveRejection({
                    productStatus: product.status,
                    previous: priorQuality,
                    next: toImproveQualitySnapshot(qualityEvaluation),
                });

                if (saveRejection) {
                    send({
                        type: 'error',
                        message: `${saveRejection} The preview was generated, but the saved version was left unchanged.`,
                        manualEditRequired: true,
                        qualityScore: qualityEvaluation.overallScore,
                        failingGates: qualityEvaluation.failingGates,
                        candidateHtml: fullHtml,
                    });
                    log.warn('Rejected improve save to protect active version quality', {
                        productId,
                        productStatus: product.status,
                        priorScore: priorQuality.score,
                        nextScore: qualityEvaluation.overallScore,
                        priorPassed: priorQuality.passed,
                        nextPassed: qualityEvaluation.overallPassed,
                        priorFailingGateCount: priorQuality.failingGateCount,
                        nextFailingGateCount: qualityEvaluation.failingGates.length,
                    });
                    close();
                    return;
                }

                if (browserQaReport.attempted && !browserQaReport.skipped && !browserQaReport.passed) {
                    send({
                        type: 'error',
                        message: 'Browser QA found desktop or mobile rendering issues. The preview was generated, but the saved version was left unchanged.',
                        manualEditRequired: true,
                        qualityScore: qualityEvaluation.overallScore,
                        browserQaScore: browserQaReport.score,
                        browserQaIssues: browserQaReport.issues,
                        browserQaViewports: browserQaReport.viewports,
                        candidateHtml: fullHtml,
                    });
                    close();
                    return;
                }

                send({ type: 'status', message: '💾 Saving changes...', phase: 'saving' });

                const { data: latestVersion } = await db
                    .from('product_versions')
                    .select('version_number')
                    .eq('product_id', productId)
                    .order('version_number', { ascending: false })
                    .limit(1)
                    .single();

                const nextVersion = (latestVersion?.version_number || 0) + 1;
                const gateScores = Object.fromEntries(
                    Object.entries(qualityEvaluation.gates).map(([key, gate]) => [
                        key,
                        {
                            score: gate.score,
                            threshold: gate.threshold,
                            passed: gate.passed,
                            notes: gate.notes,
                        },
                    ])
                );

                const { data: version } = await db
                    .from('product_versions')
                    .insert({
                        product_id: productId,
                        version_number: nextVersion,
                        build_packet: {
                            ...(priorBuildPacket || {}),
                            improvementInstruction: instruction,
                            htmlBuildMode: improveResult.htmlBuildMode,
                            improvedSectionIds: improveResult.touchedSectionIds,
                            stageTimingsMs,
                            brandTokens,
                            creatorDisplayName: creatorProfile.display_name,
                            creatorHandle: creatorProfile.handle,
                            qualityWeights,
                            salvagedSectionIds,
                            qualityOverallScore: qualityEvaluation.overallScore,
                            qualityOverallPassed: qualityEvaluation.overallPassed,
                            qualityFailingGates: qualityEvaluation.failingGates,
                            qualityGateScores: gateScores,
                            criticIterations,
                            criticModels,
                            browserQaInitialScore: initialBrowserQaReport?.score ?? browserQaReport?.score ?? null,
                            browserQaInitialPassed: initialBrowserQaReport?.passed ?? browserQaReport?.passed ?? null,
                            browserQaInitialSkipped: initialBrowserQaReport?.skipped ?? browserQaReport?.skipped ?? false,
                            browserQaInitialIssues: initialBrowserQaReport?.issues || [],
                            browserQaInitialViewports: initialBrowserQaReport?.viewports || [],
                            browserQaRepairAttempted,
                            browserQaRepairModel,
                            browserQaScore: browserQaReport?.score ?? null,
                            browserQaPassed: browserQaReport?.passed ?? null,
                            browserQaSkipped: browserQaReport?.skipped ?? false,
                            browserQaIssues: browserQaReport?.issues || [],
                            browserQaViewports: browserQaReport?.viewports || [],
                        },
                        dsl_json: {},
                        generated_html: fullHtml,
                        source_video_ids: sourceVideoIds,
                    })
                    .select('id')
                    .single();

                if (version) {
                    await db
                        .from('products')
                        .update({ active_version_id: version.id })
                        .eq('id', productId);
                }

                send({
                    type: 'complete',
                    productId,
                    versionId: version?.id,
                    qualityScore: qualityEvaluation.overallScore,
                    qualityPassed: qualityEvaluation.overallPassed,
                    browserQaScore: browserQaReport?.score ?? null,
                    browserQaPassed: browserQaReport?.passed ?? null,
                    htmlBuildMode: improveResult.htmlBuildMode,
                });

                log.info('Product improved via staged Kimi flow', {
                    productId,
                    instruction: instruction.slice(0, 120),
                    touchedSections: improveResult.touchedSectionIds,
                    htmlLength: fullHtml.length,
                    qualityScore: qualityEvaluation.overallScore,
                    qualityPassed: qualityEvaluation.overallPassed,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                log.error('Improve stream error', { error: msg });
                send({ type: 'error', message: msg });
            }

            close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
