// POST /api/import/tiktok
// Start a TikTok import job: { handle, maxVideos, consent }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { scrapeCreatorsProvider } from '@/lib/import/scrapecreators';
import { createJob, updateJob } from '@/lib/import/jobs';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting: 3 imports/day per creator
    const rl = rateLimitResponse(user.id, 'import');
    if (rl) return rl;

    // Get creator record
    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    const body = await request.json();
    const { handle, maxVideos = 500, consent } = body;

    if (!handle || !consent) {
        return NextResponse.json(
            { error: 'TikTok handle and consent are required' },
            { status: 400 }
        );
    }

    // Create the import job
    const job = await createJob(supabase, {
        type: 'tiktok_import',
        creatorId: creator.id,
        payload: { handle, maxVideos, consent },
    });

    if (!job) {
        return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 });
    }

    // Start the import in the background (non-blocking)
    runTikTokImport(supabase, creator.id, job.id, handle, maxVideos).catch((err) => {
        log.error('TikTok import failed', { jobId: job.id, error: err instanceof Error ? err.message : 'Unknown' });
    });

    return NextResponse.json({ jobId: job.id, status: 'queued' }, { status: 201 });
}

/**
 * Background import function — runs after responding to the client
 */
async function runTikTokImport(
    supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
    creatorId: string,
    jobId: string,
    handle: string,
    maxVideos: number
) {
    let videosImported = 0;
    let transcriptsFetched = 0;

    try {
        await updateJob(supabase, jobId, { status: 'running' });

        // 1. Fetch profile metadata
        const profile = await scrapeCreatorsProvider.getProfile(handle);

        // Update creator with imported profile data (if they don't have bio/avatar yet)
        await supabase
            .from('creators')
            .update({
                bio: profile.bio,
                avatar_url: profile.avatarUrl,
            })
            .eq('id', creatorId)
            .is('bio', null); // Only if empty

        // 2. Fetch videos (paginated via AsyncGenerator)
        const videoGenerator = scrapeCreatorsProvider.listVideos(handle, {
            maxVideos,
            sortBy: 'latest',
        });

        for await (const batch of videoGenerator) {
            // Upsert videos into DB
            const videoRows = batch.map((v) => ({
                creator_id: creatorId,
                source: 'scrapecreators' as const,
                external_video_id: v.externalVideoId,
                url: v.url,
                title: v.title || v.description || null,
                description: v.description,
                views: v.views,
                likes: v.likes,
                comments_count: v.comments,
                shares: v.shares,
                duration: v.duration,
                thumbnail_url: v.thumbnailUrl,
                created_at_source: v.createdAt,
            }));

            const { error: insertError } = await supabase
                .from('videos')
                .upsert(videoRows, {
                    onConflict: 'creator_id,external_video_id',
                    ignoreDuplicates: false,
                });

            if (insertError) {
                log.error('Video insert error', { error: insertError.message });
            }

            videosImported += batch.length;

            // Update job progress
            await updateJob(supabase, jobId, {
                result: { videosImported, transcriptsFetched, phase: 'importing_videos' },
            });
        }

        // 3. Fetch transcripts for videos without them
        const { data: videosNeedingTranscripts } = await supabase
            .from('videos')
            .select('id, url, title, description, views, likes, comments_count, shares, thumbnail_url, duration, created_at_source')
            .eq('creator_id', creatorId)
            .not('url', 'is', null);

        if (videosNeedingTranscripts) {
            // Process in batches of 5 (throttled)
            const BATCH_SIZE = 5;
            for (let i = 0; i < videosNeedingTranscripts.length; i += BATCH_SIZE) {
                const transcriptBatch = videosNeedingTranscripts.slice(i, i + BATCH_SIZE);

                const transcriptPromises = transcriptBatch.map(async (video) => {
                    if (!video.url) return;

                    // Check if transcript already exists
                    const { data: existing } = await supabase
                        .from('video_transcripts')
                        .select('id')
                        .eq('video_id', video.id)
                        .single();

                    if (existing) return;

                    const result = await scrapeCreatorsProvider.getTranscript(video.url, {
                        useAiFallback: true,
                    });

                    if (result) {
                        await supabase.from('video_transcripts').upsert({
                            creator_id: creatorId,
                            video_id: video.id,
                            platform: 'tiktok',
                            title: video.title || video.description || null,
                            description: video.description || null,
                            views: video.views || 0,
                            likes: video.likes || 0,
                            comments: video.comments_count || 0,
                            shares: video.shares || 0,
                            thumbnail_url: video.thumbnail_url || null,
                            transcript_text: result.transcriptText,
                            webvtt_url: null,
                            duration_seconds: video.duration || 0,
                            posted_at: video.created_at_source || null,
                            language: result.language,
                            source: result.source,
                        }, {
                            onConflict: 'creator_id,video_id',
                            ignoreDuplicates: false,
                        });
                        transcriptsFetched++;
                    }
                });

                await Promise.all(transcriptPromises);

                // Update progress
                await updateJob(supabase, jobId, {
                    result: { videosImported, transcriptsFetched, phase: 'fetching_transcripts' },
                });

                // Throttle between batches
                if (i + BATCH_SIZE < videosNeedingTranscripts.length) {
                    await new Promise((r) => setTimeout(r, 200));
                }
            }
        }

        // Mark job as succeeded
        await updateJob(supabase, jobId, {
            status: 'succeeded',
            result: { videosImported, transcriptsFetched, phase: 'complete' },
        });
    } catch (error) {
        log.error('TikTok import error', { jobId, error: error instanceof Error ? error.message : 'Unknown' });
        await updateJob(supabase, jobId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            result: { videosImported, transcriptsFetched, phase: 'failed' },
        });
    }
}
