import { createClient as createServiceClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { runScrapePipeline } from '@/lib/pipeline/pipeline';
import {
    beginPipelineRun,
    completePipelineRun,
    emitPipelineAlert,
    failPipelineRun,
    markPipelineRunSuperseded,
    type PipelineTrigger,
} from '@/lib/inngest/reliability';

type PipelineQueueJobStatus =
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'dead_letter'
    | 'cancelled';

interface PipelineQueueJobRow {
    id: string;
    creator_id: string;
    handle: string;
    run_id: string;
    trigger: string;
    status: PipelineQueueJobStatus;
    attempts: number;
    max_attempts: number;
    worker_id: string | null;
    next_attempt_at: string;
    locked_at: string | null;
    lock_expires_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    last_error: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

interface EnqueuePipelineQueueJobInput {
    creatorId: string;
    handle: string;
    runId: string;
    trigger: PipelineTrigger;
    replayOfRunId?: string | null;
    maxAttempts?: number;
}

export interface EnqueuePipelineQueueJobResult {
    jobId: string;
}

type PipelineJobOutcome = 'succeeded' | 'requeued' | 'dead_letter' | 'cancelled';

export interface PipelineQueueBatchResult {
    releasedStale: number;
    claimed: number;
    processed: number;
    succeeded: number;
    requeued: number;
    deadLettered: number;
    cancelled: number;
    failed: number;
    workerId: string;
}

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_BACKOFF_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 15 * 60;
const CLAIM_LOCK_SECONDS = 180;

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

function asMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function buildWorkerId() {
    const region = process.env.VERCEL_REGION || process.env.VERCEL_ENV || 'local';
    const nonce = Math.random().toString(36).slice(2, 8);
    return `pipeline-worker:${region}:${nonce}`;
}

function normalizeTrigger(value: string): PipelineTrigger {
    if (value === 'onboarding') return 'onboarding';
    if (value === 'manual_retry') return 'manual_retry';
    if (value === 'auto_recovery') return 'auto_recovery';
    if (value === 'dlq_replay') return 'dlq_replay';
    return 'unknown';
}

function calculateBackoffSeconds(attempt: number): number {
    const exponent = Math.max(0, attempt - 1);
    return Math.min(BASE_BACKOFF_SECONDS * (2 ** exponent), MAX_BACKOFF_SECONDS);
}

async function releaseExpiredPipelineJobs(limit: number): Promise<number> {
    const db = getServiceDb();
    const { data, error } = await db.rpc('release_expired_pipeline_jobs', {
        p_limit: Math.max(1, limit),
    });

    if (error) {
        log.warn('Failed to release expired pipeline jobs', {
            error: error.message,
        });
        return 0;
    }

    return Number(data || 0);
}

async function claimPipelineJobs(
    maxJobs: number,
    workerId: string
): Promise<PipelineQueueJobRow[]> {
    const db = getServiceDb();
    const { data, error } = await db.rpc('claim_pipeline_jobs', {
        p_limit: Math.max(1, maxJobs),
        p_worker_id: workerId,
        p_lock_seconds: CLAIM_LOCK_SECONDS,
    });

    if (error) {
        throw new Error(`Failed to claim pipeline jobs: ${error.message}`);
    }

    if (!Array.isArray(data)) return [];
    return data as PipelineQueueJobRow[];
}

async function markJobCancelled(
    job: PipelineQueueJobRow,
    reason: string,
    activeRunId: string | null
) {
    const db = getServiceDb();
    const { error } = await db
        .from('pipeline_jobs')
        .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            worker_id: null,
            locked_at: null,
            lock_expires_at: null,
            last_error: reason,
        })
        .eq('id', job.id)
        .in('status', ['queued', 'running']);

    if (error) {
        log.warn('Failed to cancel superseded pipeline job', {
            jobId: job.id,
            runId: job.run_id,
            error: error.message,
        });
    }

    await markPipelineRunSuperseded(job.run_id, job.creator_id, {
        reason,
        activeRunId,
        jobId: job.id,
    });
}

async function processClaimedJob(
    job: PipelineQueueJobRow,
    workerId: string
): Promise<PipelineJobOutcome> {
    const db = getServiceDb();
    const trigger = normalizeTrigger(job.trigger);

    const { data: creator, error: creatorError } = await db
        .from('creators')
        .select('pipeline_run_id')
        .eq('id', job.creator_id)
        .maybeSingle();

    if (creatorError || !creator) {
        throw new Error(`Failed to verify creator run ownership: ${creatorError?.message || 'Creator not found'}`);
    }

    const activeRunId = creator.pipeline_run_id ? String(creator.pipeline_run_id) : null;
    if (activeRunId !== job.run_id) {
        await markJobCancelled(job, 'Superseded by newer pipeline run', activeRunId);
        return 'cancelled';
    }

    await beginPipelineRun({
        runId: job.run_id,
        creatorId: job.creator_id,
        handle: job.handle,
        eventId: job.id,
        trigger,
    });

    try {
        await runScrapePipeline(job.creator_id, job.handle);
    } catch (error) {
        const message = asMessage(error);
        const maxAttempts = Math.max(job.max_attempts || DEFAULT_MAX_ATTEMPTS, 1);

        if (job.attempts >= maxAttempts) {
            const { error: deadError } = await db
                .from('pipeline_jobs')
                .update({
                    status: 'dead_letter',
                    completed_at: new Date().toISOString(),
                    worker_id: null,
                    locked_at: null,
                    lock_expires_at: null,
                    last_error: message,
                })
                .eq('id', job.id)
                .eq('status', 'running')
                .eq('worker_id', workerId);

            if (deadError) {
                log.warn('Failed to mark pipeline job dead_letter', {
                    jobId: job.id,
                    runId: job.run_id,
                    error: deadError.message,
                });
            }

            await failPipelineRun({
                runId: job.run_id,
                creatorId: job.creator_id,
                handle: job.handle,
                eventId: job.id,
                failedStep: 'supabase_queue',
                errorMessage: message,
                payload: {
                    workerId,
                    jobId: job.id,
                    attempt: job.attempts,
                    maxAttempts,
                },
            });
            return 'dead_letter';
        }

        const backoffSeconds = calculateBackoffSeconds(job.attempts);
        const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        const { error: retryError } = await db
            .from('pipeline_jobs')
            .update({
                status: 'queued',
                worker_id: null,
                locked_at: null,
                lock_expires_at: null,
                next_attempt_at: nextAttemptAt,
                last_error: `Attempt ${job.attempts} failed: ${message}`,
            })
            .eq('id', job.id)
            .eq('status', 'running')
            .eq('worker_id', workerId);

        if (retryError) {
            throw new Error(`Failed to requeue pipeline job: ${retryError.message}`);
        }

        await emitPipelineAlert({
            level: 'warn',
            code: 'pipeline_job_requeued',
            message,
            creatorId: job.creator_id,
            runId: job.run_id,
            details: {
                workerId,
                jobId: job.id,
                attempt: job.attempts,
                nextAttemptAt,
                backoffSeconds,
            },
        });

        return 'requeued';
    }

    const { data: completed, error: completeError } = await db
        .from('pipeline_jobs')
        .update({
            status: 'succeeded',
            completed_at: new Date().toISOString(),
            worker_id: null,
            locked_at: null,
            lock_expires_at: null,
            last_error: null,
        })
        .eq('id', job.id)
        .eq('status', 'running')
        .eq('worker_id', workerId)
        .select('id')
        .maybeSingle();

    if (completeError) {
        throw new Error(`Failed to mark pipeline job succeeded: ${completeError.message}`);
    }

    if (!completed) {
        await markJobCancelled(job, 'Pipeline job lost lock ownership before completion', null);
        return 'cancelled';
    }

    await completePipelineRun(job.run_id, {
        workerId,
        jobId: job.id,
        attempt: job.attempts,
        transport: 'supabase_queue',
    });

    return 'succeeded';
}

export async function enqueuePipelineQueueJob(
    input: EnqueuePipelineQueueJobInput
): Promise<EnqueuePipelineQueueJobResult> {
    const db = getServiceDb();
    const nowIso = new Date().toISOString();

    const { error: cancelError } = await db
        .from('pipeline_jobs')
        .update({
            status: 'cancelled',
            completed_at: nowIso,
            worker_id: null,
            locked_at: null,
            lock_expires_at: null,
            last_error: 'Superseded by newer pipeline run',
        })
        .eq('creator_id', input.creatorId)
        .eq('status', 'queued')
        .neq('run_id', input.runId);

    if (cancelError) {
        log.warn('Failed to cancel queued superseded pipeline jobs', {
            creatorId: input.creatorId,
            runId: input.runId,
            error: cancelError.message,
        });
    }

    const { data: existing, error: existingError } = await db
        .from('pipeline_jobs')
        .select('id')
        .eq('run_id', input.runId)
        .maybeSingle();

    if (existingError) {
        throw new Error(`Failed to lookup existing pipeline job: ${existingError.message}`);
    }

    if (existing) {
        return { jobId: existing.id };
    }

    const payload: Record<string, unknown> = {
        trigger: input.trigger,
        replayOfRunId: input.replayOfRunId || null,
    };

    const { data, error } = await db
        .from('pipeline_jobs')
        .insert({
            creator_id: input.creatorId,
            handle: input.handle,
            run_id: input.runId,
            trigger: input.trigger,
            status: 'queued',
            max_attempts: Math.max(input.maxAttempts || DEFAULT_MAX_ATTEMPTS, 1),
            next_attempt_at: nowIso,
            payload,
        })
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505') {
            const { data: duplicate, error: duplicateError } = await db
                .from('pipeline_jobs')
                .select('id')
                .eq('run_id', input.runId)
                .single();

            if (duplicateError || !duplicate) {
                throw new Error(`Failed to resolve duplicate pipeline job: ${duplicateError?.message || error.message}`);
            }

            return { jobId: duplicate.id };
        }

        throw new Error(`Failed to enqueue pipeline job: ${error.message}`);
    }

    return { jobId: data.id };
}

export async function processPipelineJobBatch(maxJobs: number = 5): Promise<PipelineQueueBatchResult> {
    const workerId = buildWorkerId();
    const releasedStale = await releaseExpiredPipelineJobs(Math.max(maxJobs * 5, 25));
    const claimedJobs = await claimPipelineJobs(maxJobs, workerId);

    const result: PipelineQueueBatchResult = {
        releasedStale,
        claimed: claimedJobs.length,
        processed: 0,
        succeeded: 0,
        requeued: 0,
        deadLettered: 0,
        cancelled: 0,
        failed: 0,
        workerId,
    };

    for (const job of claimedJobs) {
        try {
            const outcome = await processClaimedJob(job, workerId);
            result.processed += 1;

            if (outcome === 'succeeded') result.succeeded += 1;
            else if (outcome === 'requeued') result.requeued += 1;
            else if (outcome === 'dead_letter') result.deadLettered += 1;
            else if (outcome === 'cancelled') result.cancelled += 1;
        } catch (error) {
            result.failed += 1;
            const message = asMessage(error);
            log.error('Pipeline queue worker crashed while processing job', {
                workerId,
                jobId: job.id,
                runId: job.run_id,
                creatorId: job.creator_id,
                error: message,
            });

            const backoffSeconds = calculateBackoffSeconds(job.attempts || 1);
            const db = getServiceDb();
            const { error: unlockError } = await db
                .from('pipeline_jobs')
                .update({
                    status: 'queued',
                    worker_id: null,
                    locked_at: null,
                    lock_expires_at: null,
                    next_attempt_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
                    last_error: `Worker crash: ${message}`,
                })
                .eq('id', job.id)
                .eq('worker_id', workerId);

            if (unlockError) {
                log.warn('Failed to unlock crashed pipeline job', {
                    workerId,
                    jobId: job.id,
                    error: unlockError.message,
                });
            }
        }
    }

    return result;
}

export async function kickPipelineQueueProcessor(source: string, maxJobs: number = 1): Promise<void> {
    try {
        const result = await processPipelineJobBatch(maxJobs);
        log.info('Pipeline queue kickoff processed', {
            source,
            ...result,
        });
    } catch (error) {
        log.error('Pipeline queue kickoff failed', {
            source,
            error: asMessage(error),
        });
    }
}
