// POST /api/ai/improve-html
// Takes current HTML + improvement instruction, returns improved HTML
// Uses Kimi for targeted HTML editing

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { improveProductWithKimiStages } from '@/lib/ai/kimi-product-improve';
import {
    chooseStricterImproveBaseline,
    getImproveSaveRejection,
    parseQualityWeights,
    parseImproveQualitySnapshot,
    toImproveQualitySnapshot,
} from '@/lib/ai/improve-save-policy';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { loadCreatorCatalogHtml } from '@/lib/products/catalog-html';
import type { ProductType } from '@/types/build-packet';

interface ActiveVersionRow {
    build_packet: Record<string, unknown> | null;
    source_video_ids: string[] | null;
}

function inferProductType(html: string, hinted?: unknown): ProductType {
    switch (hinted) {
        case 'mini_course':
        case 'challenge_7day':
        case 'checklist_toolkit':
        case 'pdf_guide':
            return hinted;
        default:
            if (/id="module-\d+"/i.test(html)) return 'mini_course';
            if (/id="day-\d+"/i.test(html)) return 'challenge_7day';
            if (/id="category-\d+"/i.test(html)) return 'checklist_toolkit';
            return 'pdf_guide';
    }
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

    const body = await request.json();
    const { html, instruction, buildPacket, productId } = body as {
        html: string;
        instruction: string;
        buildPacket?: Record<string, unknown> | null;
        productId?: string;
    };

    if (!html || !instruction) {
        return NextResponse.json(
            { error: 'html and instruction are required' },
            { status: 400 }
        );
    }

    try {
        const { data: creator } = await supabase
            .from('creators')
            .select('id, handle, display_name, brand_tokens')
            .eq('profile_id', user.id)
            .single();

        if (!creator) {
            return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
        }

        let productStatus = typeof buildPacket?.productStatus === 'string' ? buildPacket.productStatus : 'draft';
        let activeVersion: ActiveVersionRow | null = null;
        let sourceVideoIds = Array.isArray(buildPacket?.sourceVideoIdsUsed)
            ? buildPacket.sourceVideoIdsUsed.filter((item): item is string => typeof item === 'string')
            : [];
        let qualityWeights = parseQualityWeights(buildPacket || null);
        let creatorHandle = typeof buildPacket?.creatorHandle === 'string' ? buildPacket.creatorHandle : creator.handle;
        let creatorDisplayName = typeof buildPacket?.title === 'string' ? buildPacket.title : 'Owny Product';
        let brandTokens = buildPacket?.brandTokens && typeof buildPacket.brandTokens === 'object'
            ? buildPacket.brandTokens as Record<string, unknown>
            : (creator.brand_tokens as Record<string, unknown> | null);
        let catalogHtml: string[] = [];

        if (productId) {
            const { data: product } = await supabase
                .from('products')
                .select('id, status, active_version_id, creator_id')
                .eq('id', productId)
                .maybeSingle();

            if (!product || product.creator_id !== creator.id) {
                return NextResponse.json({ error: 'Product not found' }, { status: 404 });
            }

            productStatus = product.status;
            creatorHandle = creator.handle;
            creatorDisplayName = creator.display_name || creator.handle;
            brandTokens = (creator.brand_tokens as Record<string, unknown> | null) || brandTokens;
            catalogHtml = await loadCreatorCatalogHtml(supabase, creator.id, { excludeProductId: productId });

            if (product.active_version_id) {
                const { data: version } = await supabase
                    .from('product_versions')
                    .select('build_packet, source_video_ids')
                    .eq('id', product.active_version_id)
                    .maybeSingle();
                activeVersion = (version as ActiveVersionRow | null) || null;
            }

            if (sourceVideoIds.length === 0 && Array.isArray(activeVersion?.source_video_ids)) {
                sourceVideoIds = activeVersion.source_video_ids.filter((item): item is string => typeof item === 'string');
            }
            qualityWeights = qualityWeights || parseQualityWeights(activeVersion?.build_packet || null);
        }

        const result = await improveProductWithKimiStages({
            currentHtml: html,
            instruction,
            productType: inferProductType(html, buildPacket?.productType),
            creatorDisplayName,
            creatorHandle,
            creatorDna: null,
        });

        const productType = inferProductType(html, buildPacket?.productType);
        const currentQuality = evaluateProductQuality({
            html,
            productType,
            sourceVideoIds,
            catalogHtml,
            brandTokens,
            creatorHandle,
            qualityWeights,
        });
        const qualityEvaluation = evaluateProductQuality({
            html: result.html,
            productType,
            sourceVideoIds,
            catalogHtml,
            brandTokens,
            creatorHandle,
            qualityWeights,
        });
        const previousQuality = chooseStricterImproveBaseline(
            parseImproveQualitySnapshot(activeVersion?.build_packet || buildPacket || null),
            toImproveQualitySnapshot(currentQuality)
        );
        const rejectionReason = getImproveSaveRejection({
            productStatus,
            previous: previousQuality,
            next: toImproveQualitySnapshot(qualityEvaluation),
        });

        const metadata = {
            model: result.htmlBuildMode,
            htmlBuildMode: result.htmlBuildMode,
            stageTimingsMs: result.stageTimingsMs,
            touchedSectionIds: result.touchedSectionIds,
            improvedAt: new Date().toISOString(),
            qualityScore: qualityEvaluation.overallScore,
            qualityPassed: qualityEvaluation.overallPassed,
            failingGates: qualityEvaluation.failingGates,
            saveRejected: Boolean(rejectionReason),
            rejectionReason,
        };

        if (rejectionReason) {
            return NextResponse.json({
                error: `${rejectionReason} The saved version was left unchanged.`,
                manualEditRequired: true,
                metadata,
            }, { status: 422 });
        }

        return NextResponse.json({
            html: result.html,
            metadata,
        });
    } catch (err) {
        log.error('Improve HTML error', { error: err instanceof Error ? err.message : 'Unknown' });
        return NextResponse.json({
            error: err instanceof Error ? err.message : 'Failed to improve HTML',
        }, { status: 500 });
    }
}
