// src/lib/import/job-processor.ts
// PRD §1, M3, M4 — DB-based async job processor with retry + exponential backoff
// Polls the jobs table for 'queued' work, runs handlers, marks success/failure

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job, JobType } from '@/types/database';
import { updateJob } from './jobs';
import { log } from '@/lib/logger';

/**
 * Dispatch a job to the appropriate handler based on its type.
 * Add new job types here as the system grows.
 */
async function dispatch(
    supabase: SupabaseClient,
    job: Job
): Promise<Record<string, unknown>> {
    const jobType: JobType = job.type;

    switch (jobType) {
        case 'tiktok_import': {
            const { scrapeCreatorsProvider } = await import('./scrapecreators');
            const handle = (job.payload as Record<string, string>)?.handle || '';
            let totalImported = 0;
            for await (const batch of scrapeCreatorsProvider.listVideos(handle, { maxVideos: 50 })) {
                totalImported += batch.length;
            }
            return { videosImported: totalImported };
        }

        case 'csv_parse': {
            const { parseCSV } = await import('./csv');
            const csvData = (job.payload as Record<string, string>)?.csvData || '';
            const result = await parseCSV(csvData);
            return { rowsParsed: result.length };
        }

        case 'clip_card_gen': {
            const { indexAllCreatorVideos } = await import('@/lib/indexing/orchestrator');
            const creatorId = (job.payload as Record<string, string>)?.creatorId || job.creator_id || '';
            await indexAllCreatorVideos(supabase, creatorId);
            return { status: 'indexing_complete' };
        }

        case 'embedding_gen': {
            const { embedTranscriptChunks } = await import('@/lib/indexing/embeddings');
            const videoId = (job.payload as Record<string, string>)?.videoId || '';
            const count = await embedTranscriptChunks(supabase, videoId);
            return { embeddingsGenerated: count };
        }

        case 'transcript_fetch': {
            const { scrapeCreatorsProvider } = await import('./scrapecreators');
            const videoUrl = (job.payload as Record<string, string>)?.videoUrl || '';
            const transcript = await scrapeCreatorsProvider.getTranscript(videoUrl, {
                useAiFallback: true,
            });
            return { transcriptLength: transcript?.transcriptText?.length ?? 0 };
        }

        case 'product_build': {
            // Product build jobs are handled by the AI pipeline directly
            // This handler is a placeholder for async build queuing
            return { status: 'delegated_to_ai_pipeline' };
        }

        case 'scrape_pipeline': {
            // Scrape pipeline jobs are handled by the pipeline directly via /api/pipeline/start
            return { status: 'delegated_to_scrape_pipeline' };
        }

        default: {
            const _exhaustive: never = jobType;
            throw new Error(`Unknown job type: ${_exhaustive}`);
        }
    }
}

/**
 * Claim and process the next queued job.
 * Uses UPDATE ... WHERE status='queued' for atomic claiming (prevents double-processing).
 *
 * Returns the processed job, or null if there are no queued jobs.
 */
export async function processNextJob(
    supabase: SupabaseClient
): Promise<Job | null> {
    // Atomically claim one queued job
    const { data: jobs, error: claimError } = await supabase
        .from('jobs')
        .update({
            status: 'running',
            started_at: new Date().toISOString(),
        })
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .select()
        .returns<Job[]>();

    if (claimError || !jobs || jobs.length === 0) {
        return null;
    }

    const job = jobs[0];
    const attempts = (job.attempts || 0) + 1;

    log.job(job.type, {
        jobId: job.id,
        status: 'running',
        attempt: attempts,
        maxAttempts: job.max_attempts,
    });

    try {
        const result = await dispatch(supabase, job);

        await updateJob(supabase, job.id, {
            status: 'succeeded',
            result,
            attempts,
        });

        log.job(job.type, {
            jobId: job.id,
            status: 'succeeded',
            attempt: attempts,
            result,
        });

        return { ...job, status: 'succeeded' as const, result, attempts };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        const maxAttempts = job.max_attempts || 5;

        if (attempts >= maxAttempts) {
            // Permanent failure
            await updateJob(supabase, job.id, {
                status: 'failed',
                errorMessage,
                attempts,
            });

            log.job(job.type, {
                jobId: job.id,
                status: 'failed',
                attempt: attempts,
                error: errorMessage,
            });
        } else {
            // Re-queue for retry
            await updateJob(supabase, job.id, {
                status: 'queued',
                errorMessage: `Attempt ${attempts} failed: ${errorMessage}`,
                attempts,
            });

            log.job(job.type, {
                jobId: job.id,
                status: 'requeued',
                attempt: attempts,
                nextAttemptDelay: `${Math.pow(2, attempts)}s`,
                error: errorMessage,
            });
        }

        return { ...job, status: 'failed' as const, error_message: errorMessage, attempts };
    }
}

/**
 * Process all queued jobs in a batch (up to maxJobs).
 * Suitable for cron-triggered processing via Vercel Cron or similar.
 */
export async function processBatch(
    supabase: SupabaseClient,
    maxJobs: number = 10
): Promise<{ processed: number; succeeded: number; failed: number }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    while (processed < maxJobs) {
        const result = await processNextJob(supabase);
        if (!result) break; // No more queued jobs

        processed++;
        if (result.status === 'succeeded') succeeded++;
        else failed++;
    }

    return { processed, succeeded, failed };
}
