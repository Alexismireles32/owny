// POST /api/products/[id]/versions
// Save a new version only after server-side quality evaluation

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getEvergreenDesignCanon } from '@/lib/ai/design-canon';
import {
    chooseStricterImproveBaseline,
    getImproveSaveRejection,
    parseImproveQualitySnapshot,
    parseQualityWeights,
    toImproveQualitySnapshot,
} from '@/lib/ai/improve-save-policy';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { loadCreatorCatalogHtml } from '@/lib/products/catalog-html';
import type { ProductType } from '@/types/build-packet';

interface ActiveVersionRow {
    id: string;
    version_number: number;
    build_packet: Record<string, unknown> | null;
    generated_html: string | null;
    source_video_ids: string[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function sanitizeSourceVideoIds(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle, display_name, brand_tokens')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const { data: product } = await supabase
        .from('products')
        .select('id, creator_id, status, type, active_version_id')
        .eq('id', id)
        .single();

    if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const body = await request.json();
    const incomingBuildPacket = isRecord(body.buildPacket) ? body.buildPacket : {};
    const dslJson = isRecord(body.dslJson) ? body.dslJson : {};
    const generatedHtml = typeof body.generatedHtml === 'string' ? body.generatedHtml.trim() : '';

    if (!generatedHtml) {
        return NextResponse.json({
            error: 'Generated HTML is required before saving a new version.',
            manualEditRequired: true,
        }, { status: 400 });
    }

    let activeVersion: ActiveVersionRow | null = null;
    if (product.active_version_id) {
        const { data: version } = await supabase
            .from('product_versions')
            .select('id, version_number, build_packet, generated_html, source_video_ids')
            .eq('id', product.active_version_id)
            .maybeSingle();
        activeVersion = (version as ActiveVersionRow | null) || null;
    }

    const designCanon = getEvergreenDesignCanon();
    const productType = normalizeProductType(incomingBuildPacket.productType ?? product.type);
    const qualityWeights = parseQualityWeights(incomingBuildPacket)
        || parseQualityWeights(activeVersion?.build_packet || null)
        || designCanon.qualityWeights;
    const sourceVideoIds = [
        ...sanitizeSourceVideoIds(body.sourceVideoIds),
        ...sanitizeSourceVideoIds(incomingBuildPacket.sourceVideoIdsUsed),
        ...sanitizeSourceVideoIds(activeVersion?.source_video_ids),
    ].filter((value, index, array) => array.indexOf(value) === index);
    const brandTokens = (creator.brand_tokens as Record<string, unknown> | null) || null;
    const catalogHtml = await loadCreatorCatalogHtml(supabase, creator.id, { excludeProductId: id });

    const nextQuality = evaluateProductQuality({
        html: generatedHtml,
        productType,
        sourceVideoIds,
        catalogHtml,
        brandTokens,
        creatorHandle: creator.handle,
        qualityWeights,
    });

    const previousQuality = chooseStricterImproveBaseline(
        parseImproveQualitySnapshot(activeVersion?.build_packet || null),
        activeVersion?.generated_html
            ? toImproveQualitySnapshot(evaluateProductQuality({
                html: activeVersion.generated_html,
                productType,
                sourceVideoIds: sanitizeSourceVideoIds(activeVersion.source_video_ids),
                catalogHtml,
                brandTokens,
                creatorHandle: creator.handle,
                qualityWeights,
            }))
            : { score: null, passed: null, failingGateCount: Number.POSITIVE_INFINITY }
    );

    const rejectionReason = getImproveSaveRejection({
        productStatus: product.status,
        previous: previousQuality,
        next: toImproveQualitySnapshot(nextQuality),
    });

    if (rejectionReason) {
        return NextResponse.json({
            error: `${rejectionReason} The active version was left unchanged.`,
            manualEditRequired: true,
            metadata: {
                qualityScore: nextQuality.overallScore,
                qualityPassed: nextQuality.overallPassed,
                failingGates: nextQuality.failingGates,
            },
        }, { status: 422 });
    }

    const gateScores = Object.fromEntries(
        Object.entries(nextQuality.gates).map(([key, gate]) => [
            key,
            {
                score: gate.score,
                threshold: gate.threshold,
                passed: gate.passed,
                notes: gate.notes,
            },
        ])
    );

    const { data: latestVersion } = await supabase
        .from('product_versions')
        .select('version_number')
        .eq('product_id', id)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
    const nextBuildPacket: Record<string, unknown> = {
        ...(activeVersion?.build_packet || {}),
        ...incomingBuildPacket,
        productType,
        creatorHandle: creator.handle,
        creatorDisplayName: creator.display_name,
        brandTokens,
        sourceVideoIdsUsed: sourceVideoIds,
        qualityWeights,
        qualityOverallScore: nextQuality.overallScore,
        qualityOverallPassed: nextQuality.overallPassed,
        qualityFailingGates: nextQuality.failingGates,
        qualityGateScores: gateScores,
        maxCatalogSimilarity: nextQuality.maxCatalogSimilarity,
    };

    const { data: version, error } = await supabase
        .from('product_versions')
        .insert({
            product_id: id,
            version_number: nextVersionNumber,
            build_packet: nextBuildPacket,
            dsl_json: dslJson,
            generated_html: generatedHtml,
            source_video_ids: sourceVideoIds,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase
        .from('products')
        .update({ active_version_id: version.id })
        .eq('id', id);

    return NextResponse.json({
        version,
        metadata: {
            qualityScore: nextQuality.overallScore,
            qualityPassed: nextQuality.overallPassed,
            failingGates: nextQuality.failingGates,
        },
    }, { status: 201 });
}
