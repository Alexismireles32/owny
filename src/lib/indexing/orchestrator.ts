// src/lib/indexing/orchestrator.ts
// Ties together chunking, clip card generation, and embedding generation.
// Called after transcripts are stored to process a video through the full pipeline.

import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkAndStoreTranscript } from './chunker';
import { generateAndStoreClipCard } from './clip-card-generator';
import { embedTranscriptChunks, embedClipCard } from './embeddings';
import { createJob, updateJob } from '@/lib/import/jobs';

/**
 * Process a single video through the full indexing pipeline:
 * 1. Chunk transcript → transcript_chunks
 * 2. Generate clip card → clip_cards
 * 3. Generate embeddings for chunks + clip card
 */
export async function indexVideo(
    supabase: SupabaseClient,
    videoId: string,
    options?: { skipClipCard?: boolean; skipEmbeddings?: boolean }
): Promise<{
    chunksCreated: number;
    clipCardCreated: boolean;
    chunksEmbedded: number;
    clipCardEmbedded: boolean;
}> {
    // 1. Fetch transcript
    const { data: transcript } = await supabase
        .from('video_transcripts')
        .select('transcript_text')
        .eq('video_id', videoId)
        .single();

    if (!transcript) {
        return { chunksCreated: 0, clipCardCreated: false, chunksEmbedded: 0, clipCardEmbedded: false };
    }

    // 2. Fetch video metadata for clip card
    const { data: video } = await supabase
        .from('videos')
        .select('title, views, likes, duration, created_at_source')
        .eq('id', videoId)
        .single();

    // Step 1: Chunk transcript
    const chunksCreated = await chunkAndStoreTranscript(
        supabase,
        videoId,
        transcript.transcript_text
    );

    // Step 2: Generate clip card
    let clipCardCreated = false;
    if (!options?.skipClipCard) {
        clipCardCreated = await generateAndStoreClipCard(
            supabase,
            videoId,
            transcript.transcript_text,
            {
                title: video?.title,
                views: video?.views,
                likes: video?.likes,
                duration: video?.duration,
                createdAt: video?.created_at_source,
            }
        );
    }

    // Step 3: Generate embeddings
    let chunksEmbedded = 0;
    let clipCardEmbedded = false;
    if (!options?.skipEmbeddings) {
        chunksEmbedded = await embedTranscriptChunks(supabase, videoId);
        if (clipCardCreated) {
            clipCardEmbedded = await embedClipCard(supabase, videoId);
        }
    }

    return { chunksCreated, clipCardCreated, chunksEmbedded, clipCardEmbedded };
}

/**
 * Index all unindexed videos for a creator.
 * Creates a job and processes each video.
 */
export async function indexAllCreatorVideos(
    supabase: SupabaseClient,
    creatorId: string
): Promise<string | null> {
    // Find videos with transcripts but no clip cards
    const { data: videos } = await supabase
        .from('videos')
        .select(`
            id,
            video_transcripts!inner(id)
        `)
        .eq('creator_id', creatorId);

    if (!videos?.length) return null;

    // Filter to only videos without clip cards
    const videoIds = videos.map((v) => v.id);
    const { data: existingCards } = await supabase
        .from('clip_cards')
        .select('video_id')
        .in('video_id', videoIds);

    const indexedVideoIds = new Set(existingCards?.map((c) => c.video_id) || []);
    const unindexedVideos = videoIds.filter((id) => !indexedVideoIds.has(id));

    if (unindexedVideos.length === 0) return null;

    // Create indexing job
    const job = await createJob(supabase, {
        type: 'clip_card_gen',
        creatorId,
        payload: { totalVideos: unindexedVideos.length },
    });

    if (!job) return null;

    // Process in background
    processIndexingJob(supabase, job.id, unindexedVideos).catch((err) => {
        console.error('Indexing job failed:', err);
    });

    return job.id;
}

async function processIndexingJob(
    supabase: SupabaseClient,
    jobId: string,
    videoIds: string[]
): Promise<void> {
    let processed = 0;
    let failed = 0;

    try {
        await updateJob(supabase, jobId, { status: 'running' });

        for (const videoId of videoIds) {
            try {
                await indexVideo(supabase, videoId);
                processed++;
            } catch (err) {
                console.error(`Failed to index video ${videoId}:`, err);
                failed++;
            }

            // Update progress
            await updateJob(supabase, jobId, {
                result: {
                    processed,
                    failed,
                    total: videoIds.length,
                    phase: 'indexing',
                },
            });

            // Throttle to avoid AI provider rate limits
            await new Promise((r) => setTimeout(r, 500));
        }

        await updateJob(supabase, jobId, {
            status: failed === videoIds.length ? 'failed' : 'succeeded',
            result: { processed, failed, total: videoIds.length, phase: 'complete' },
        });
    } catch (error) {
        await updateJob(supabase, jobId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Indexing failed',
            result: { processed, failed, total: videoIds.length },
        });
    }
}
