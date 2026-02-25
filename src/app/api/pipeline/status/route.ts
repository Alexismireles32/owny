// GET /api/pipeline/status
// Returns creator pipeline status + niche + topTopics for polling
// Per SCRAPE_CREATORS_FLOW.md §Builder Side

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { enqueuePipelineStartEvent } from '@/lib/inngest/enqueue';
import { log } from '@/lib/logger';

const RUNNING_STATES = new Set(['scraping', 'transcribing', 'cleaning', 'clustering', 'extracting']);
const STALE_PIPELINE_MS = 2 * 60 * 1000;
const AUTO_RETRY_MARKER = 'Auto-retry enqueued at ';

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const creatorId = url.searchParams.get('creatorId');

    if (!creatorId) {
        return NextResponse.json({ error: 'creatorId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch creator pipeline status
    const { data: creator, error: creatorError } = await supabase
        .from('creators')
        .select('id, profile_id, handle, display_name, avatar_url, pipeline_status, pipeline_error, visual_dna, voice_profile, bio, updated_at')
        .eq('id', creatorId)
        .single();

    if (creatorError || !creator) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.profile_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Auto-heal stale pipeline runs that never began writing data.
    if (creator.pipeline_status && RUNNING_STATES.has(creator.pipeline_status)) {
        const updatedAtMs = creator.updated_at ? new Date(creator.updated_at).getTime() : 0;
        const isStale = updatedAtMs > 0 && Date.now() - updatedAtMs > STALE_PIPELINE_MS;

        if (isStale) {
            const db = getServiceDb();
            const [{ count: videos = 0 }, { count: transcripts = 0 }] = await Promise.all([
                db.from('videos').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id),
                db.from('video_transcripts').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id),
            ]);

            if ((videos || 0) === 0 && (transcripts || 0) === 0) {
                const alreadyRetried =
                    typeof creator.pipeline_error === 'string' &&
                    creator.pipeline_error.startsWith(AUTO_RETRY_MARKER);

                if (alreadyRetried) {
                    await db
                        .from('creators')
                        .update({
                            pipeline_status: 'error',
                            pipeline_error: 'Pipeline stalled after retry. Please retry from your dashboard.',
                        })
                        .eq('id', creator.id);

                    const { data: refreshed } = await db
                        .from('creators')
                        .select('id, profile_id, handle, display_name, avatar_url, pipeline_status, pipeline_error, visual_dna, voice_profile, bio, updated_at')
                        .eq('id', creator.id)
                        .single();

                    if (refreshed) {
                        Object.assign(creator, refreshed);
                    }

                    return NextResponse.json({
                        status: creator.pipeline_status,
                        error: creator.pipeline_error,
                        creator: {
                            id: creator.id,
                            handle: creator.handle,
                            displayName: creator.display_name,
                            avatarUrl: creator.avatar_url,
                            bio: creator.bio,
                        },
                        niche: null,
                        topTopics: [],
                    });
                }

                try {
                    await enqueuePipelineStartEvent({ creatorId: creator.id, handle: creator.handle });

                    await db
                        .from('creators')
                        .update({
                            pipeline_status: 'scraping',
                            pipeline_error: `${AUTO_RETRY_MARKER}${new Date().toISOString()}`,
                        })
                        .eq('id', creator.id);
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Unknown enqueue error';
                    log.error('Auto-recovery enqueue failed', { creatorId: creator.id, error: message });
                    await db
                        .from('creators')
                        .update({
                            pipeline_status: 'error',
                            pipeline_error: `Pipeline failed to start: ${message}`,
                        })
                        .eq('id', creator.id);
                }

                const { data: refreshed } = await db
                    .from('creators')
                    .select('id, profile_id, handle, display_name, avatar_url, pipeline_status, pipeline_error, visual_dna, voice_profile, bio, updated_at')
                    .eq('id', creator.id)
                    .single();

                if (refreshed) {
                    Object.assign(creator, refreshed);
                }
            }
        }
    }

    // If pipeline is ready, also fetch top clusters for niche/topic display
    let niche: string | null = null;
    let topTopics: string[] = [];

    if (creator.pipeline_status === 'ready') {
        const { data: clusters } = await supabase
            .from('content_clusters')
            .select('label, total_views, confidence_score')
            .eq('creator_id', creatorId)
            .order('total_views', { ascending: false })
            .limit(5);

        if (clusters && clusters.length > 0) {
            topTopics = clusters.map((c) => c.label);
            // Infer niche from the top cluster
            niche = clusters[0].label;
        }
    }

    return NextResponse.json({
        status: creator.pipeline_status,
        error: creator.pipeline_error,
        creator: {
            id: creator.id,
            handle: creator.handle,
            displayName: creator.display_name,
            avatarUrl: creator.avatar_url,
            bio: creator.bio,
        },
        niche,
        topTopics,
    });
}
