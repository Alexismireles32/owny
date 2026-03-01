// POST /api/ai/plan-product
// PRD §8.5: Retrieve → Rerank → Build Packet
// Body: { productType, prompt, audience, tone, mood }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { hybridSearch } from '@/lib/indexing/search';
import { rerankCandidates } from '@/lib/ai/reranker';
import { generateBuildPacket } from '@/lib/ai/planner';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import type { ProductType, BrandTokens } from '@/types/build-packet';

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
        .select('id, handle, display_name, brand_tokens, voice_profile')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const body = await request.json();
    const {
        productType,
        prompt,
        audience,
        tone,
        mood,
    } = body as {
        productType: ProductType;
        prompt: string;
        audience?: string;
        tone?: string;
        mood?: string;
    };

    if (!productType || !prompt) {
        return NextResponse.json(
            { error: 'productType and prompt are required' },
            { status: 400 }
        );
    }

    try {
        // Step 1: Hybrid retrieval — search creator's content
        const searchResults = await hybridSearch(supabase, creator.id, prompt, {
            limit: 100,
        });

        if (searchResults.length === 0) {
            return NextResponse.json({
                error: 'No content found. Please import some videos first.',
                lowConfidence: true,
            }, { status: 400 });
        }

        // Step 2: Rerank via Kimi K2.5
        const reranked = await rerankCandidates(
            searchResults.map((r) => ({
                videoId: r.videoId,
                title: r.title,
                clipCard: r.clipCard,
            })),
            prompt,
            productType
        );

        // Handle low confidence
        if (reranked.confidence === 'low') {
            return NextResponse.json({
                error: 'Not enough relevant content found for this product.',
                lowConfidence: true,
                coverageGaps: reranked.coverageGaps,
                candidatesFound: reranked.selectedVideos.length,
            }, { status: 400 });
        }

        // Step 3: Fetch full clip cards + transcript snippets for selected videos
        const selectedVideoIds = reranked.selectedVideos.map((v) => v.videoId);
        const { data: clipCards } = await supabase
            .from('clip_cards')
            .select('video_id, card_json')
            .in('video_id', selectedVideoIds);

        const clipCardMap = new Map(
            (clipCards || []).map((c) => [c.video_id, c.card_json])
        );

        // Fetch transcript snippets for richer content generation
        const { data: transcripts } = await supabase
            .from('video_transcripts')
            .select('video_id, transcript_text')
            .in('video_id', selectedVideoIds);

        const transcriptMap = new Map(
            (transcripts || []).map((t) => [t.video_id, t.transcript_text])
        );

        // Step 4: Generate Build Packet via Kimi K2.5
        const brandTokens = (creator.brand_tokens || {
            primaryColor: '#6366f1',
            secondaryColor: '#8b5cf6',
            backgroundColor: '#ffffff',
            textColor: '#1f2937',
            fontFamily: 'inter',
            mood: 'professional',
        }) as BrandTokens;

        const buildPacket = await generateBuildPacket({
            productType,
            userPrompt: prompt,
            audience,
            tone,
            mood,
            voiceProfile: creator.voice_profile as Record<string, unknown> | null,
            creator: {
                handle: creator.handle,
                displayName: creator.display_name,
                brandTokens,
            },
            selectedVideos: reranked.selectedVideos.map((v) => ({
                videoId: v.videoId,
                title: searchResults.find((s) => s.videoId === v.videoId)?.title || null,
                clipCard: clipCardMap.get(v.videoId) || null,
                transcriptSnippet: (transcriptMap.get(v.videoId) || '').slice(0, 2000) || null,
                reason: v.reason,
            })),
        });

        return NextResponse.json({
            buildPacket,
            reranking: {
                confidence: reranked.confidence,
                coverageGaps: reranked.coverageGaps,
                videosUsed: reranked.selectedVideos.length,
                totalCandidates: searchResults.length,
            },
        });
    } catch (err) {
        log.error('Plan product error', { error: err instanceof Error ? err.message : 'Unknown' });
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to generate plan' },
            { status: 500 }
        );
    }
}
