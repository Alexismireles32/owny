// POST /api/products/[id]/publish
// Publish only passing versions with real generated HTML

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { triggerProductPublishedEmail } from '@/lib/email/triggers';
import { getEvergreenDesignCanon } from '@/lib/ai/design-canon';
import { parseQualityWeights } from '@/lib/ai/improve-save-policy';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { loadCreatorCatalogHtml } from '@/lib/products/catalog-html';
import type { ProductType } from '@/types/build-packet';

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
    _request: Request,
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
        .select('id, handle, display_name, brand_tokens, profiles(email)')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const { data: product } = await supabase
        .from('products')
        .select('id, title, slug, creator_id, active_version_id, type')
        .eq('id', id)
        .single();

    if (!product || product.creator_id !== creator.id) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!product.active_version_id) {
        return NextResponse.json({ error: 'No version to publish' }, { status: 400 });
    }

    const { data: activeVersion } = await supabase
        .from('product_versions')
        .select('id, build_packet, generated_html, source_video_ids')
        .eq('id', product.active_version_id)
        .single();

    const generatedHtml = typeof activeVersion?.generated_html === 'string'
        ? activeVersion.generated_html.trim()
        : '';

    if (!generatedHtml) {
        return NextResponse.json({
            error: 'The active version does not contain generated product HTML.',
            manualEditRequired: true,
        }, { status: 422 });
    }

    const buildPacket = (activeVersion?.build_packet as Record<string, unknown> | null) || null;
    const productType = normalizeProductType(buildPacket?.productType ?? product.type);
    const qualityWeights = parseQualityWeights(buildPacket) || getEvergreenDesignCanon().qualityWeights;
    const sourceVideoIds = sanitizeSourceVideoIds(activeVersion?.source_video_ids);
    const catalogHtml = await loadCreatorCatalogHtml(supabase, creator.id, { excludeProductId: id });
    const qualityEvaluation = evaluateProductQuality({
        html: generatedHtml,
        productType,
        sourceVideoIds,
        catalogHtml,
        brandTokens: (creator.brand_tokens as Record<string, unknown> | null) || null,
        creatorHandle: creator.handle,
        qualityWeights,
    });

    if (!qualityEvaluation.overallPassed) {
        return NextResponse.json({
            error: 'The active version failed hard quality gates and cannot be published.',
            manualEditRequired: true,
            qualityScore: qualityEvaluation.overallScore,
            failingGates: qualityEvaluation.failingGates,
        }, { status: 422 });
    }

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

    await supabase
        .from('product_versions')
        .update({
            build_packet: {
                ...(buildPacket || {}),
                creatorHandle: creator.handle,
                creatorDisplayName: creator.display_name,
                brandTokens: creator.brand_tokens,
                qualityWeights,
                qualityOverallScore: qualityEvaluation.overallScore,
                qualityOverallPassed: qualityEvaluation.overallPassed,
                qualityFailingGates: qualityEvaluation.failingGates,
                qualityGateScores: gateScores,
                maxCatalogSimilarity: qualityEvaluation.maxCatalogSimilarity,
            },
        })
        .eq('id', product.active_version_id);

    const publishedAt = new Date().toISOString();
    const { error: publishError } = await supabase
        .from('products')
        .update({
            status: 'published',
            published_at: publishedAt,
        })
        .eq('id', id);

    if (publishError) {
        return NextResponse.json({ error: publishError.message }, { status: 500 });
    }

    await supabase
        .from('product_versions')
        .update({ published_at: publishedAt })
        .eq('id', product.active_version_id);

    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const profile = (creator as unknown as { profiles: { email: string } | null })?.profiles;
        if (profile?.email) {
            await triggerProductPublishedEmail({
                creatorEmail: profile.email,
                creatorName: (creator as unknown as { display_name: string })?.display_name || 'Creator',
                productTitle: product.title || 'Your product',
                hubUrl: `${appUrl}/c/${(creator as unknown as { handle: string })?.handle || ''}`,
                productUrl: `${appUrl}/p/${product.slug}`,
            });
        }
    } catch {
        // Best-effort email — don't fail the publish
    }

    return NextResponse.json({
        message: 'Product published',
        productId: id,
        qualityScore: qualityEvaluation.overallScore,
    });
}
