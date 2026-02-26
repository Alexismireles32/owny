import { createClient as createServiceClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { runScrapePipeline } from '@/lib/pipeline/pipeline';
import { emitPipelineAlert, type PipelineTrigger } from '@/lib/inngest/reliability';

const DISPATCH_GRACE_MS = 20_000;
const RUNNING_STATES = new Set(['scraping', 'transcribing', 'indexing', 'cleaning', 'clustering', 'extracting']);

interface DispatchFallbackInput {
    creatorId: string;
    handle: string;
    runId: string;
    trigger: PipelineTrigger;
    source: string;
}

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function asMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export async function startDispatchFallbackWatchdog(input: DispatchFallbackInput): Promise<void> {
    await sleep(DISPATCH_GRACE_MS);
    const db = getServiceDb();

    const { data: runRow, error: runError } = await db
        .from('pipeline_runs')
        .select('id, status')
        .eq('run_id', input.runId)
        .maybeSingle();

    if (runError) {
        log.warn('Fallback watchdog failed to read pipeline_runs', {
            creatorId: input.creatorId,
            runId: input.runId,
            source: input.source,
            error: runError.message,
        });
        return;
    }

    if (runRow) {
        return;
    }

    const { data: creator, error: creatorError } = await db
        .from('creators')
        .select('pipeline_run_id, pipeline_status')
        .eq('id', input.creatorId)
        .maybeSingle();

    if (creatorError || !creator) {
        log.warn('Fallback watchdog failed to read creator state', {
            creatorId: input.creatorId,
            runId: input.runId,
            source: input.source,
            error: creatorError?.message || 'Creator not found',
        });
        return;
    }

    const activeRunId = creator.pipeline_run_id ? String(creator.pipeline_run_id) : null;
    if (activeRunId !== input.runId) {
        return;
    }

    const currentStatus = creator.pipeline_status || 'pending';
    if (!RUNNING_STATES.has(currentStatus)) {
        return;
    }

    const fallbackRunId = `fallback-${input.runId}`;
    const fallbackNote = `Fallback pipeline runner started at ${new Date().toISOString()} (source: ${input.source}).`;

    const { data: lockedCreator, error: lockError } = await db
        .from('creators')
        .update({
            pipeline_run_id: fallbackRunId,
            pipeline_status: 'scraping',
            pipeline_error: fallbackNote,
        })
        .eq('id', input.creatorId)
        .eq('pipeline_run_id', input.runId)
        .select('id')
        .maybeSingle();

    if (lockError || !lockedCreator) {
        log.warn('Fallback watchdog could not lock creator for fallback run', {
            creatorId: input.creatorId,
            runId: input.runId,
            fallbackRunId,
            source: input.source,
            error: lockError?.message || 'Creator state changed',
        });
        return;
    }

    await emitPipelineAlert({
        level: 'warn',
        code: 'pipeline_dispatch_fallback_started',
        message: 'No Inngest callback detected within dispatch grace window; running direct fallback pipeline.',
        creatorId: input.creatorId,
        runId: fallbackRunId,
        details: {
            handle: input.handle,
            source: input.source,
            trigger: input.trigger,
            originalRunId: input.runId,
        },
    });

    try {
        await runScrapePipeline(input.creatorId, input.handle);
    } catch (error) {
        const message = asMessage(error);
        log.error('Fallback pipeline execution failed', {
            creatorId: input.creatorId,
            handle: input.handle,
            runId: fallbackRunId,
            source: input.source,
            error: message,
        });

        await db
            .from('creators')
            .update({
                pipeline_status: 'error',
                pipeline_error: `Fallback pipeline failed: ${message}`,
                pipeline_run_id: null,
            })
            .eq('id', input.creatorId)
            .eq('pipeline_run_id', fallbackRunId);

        await emitPipelineAlert({
            level: 'error',
            code: 'pipeline_dispatch_fallback_failed',
            message,
            creatorId: input.creatorId,
            runId: fallbackRunId,
            details: {
                handle: input.handle,
                source: input.source,
                trigger: input.trigger,
                originalRunId: input.runId,
            },
        });
    }
}
