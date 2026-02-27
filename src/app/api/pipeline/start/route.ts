// POST /api/pipeline/start
// Sends pipeline event to Inngest for background execution
// Used for manual retries or re-running the pipeline

import { createClient } from '@/lib/supabase/server';
import { after, NextResponse } from 'next/server';
import { enqueuePipelineStartEvent } from '@/lib/inngest/enqueue';
import { rateLimitResponse } from '@/lib/rate-limit';
import { randomUUID } from 'crypto';
import { emitPipelineAlert } from '@/lib/inngest/reliability';
import { startDispatchFallbackWatchdog } from '@/lib/inngest/dispatch-fallback';
import { kickPipelineQueueProcessor } from '@/lib/pipeline/queue';

export async function POST(request: Request) {
    const supabase = await createClient();
    let body: { creatorId?: string; handle?: string };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { creatorId, handle } = body;

    if (!creatorId || !handle) {
        return NextResponse.json({ error: 'creatorId and handle are required' }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting
    const rl = rateLimitResponse(user.id, 'pipeline-start');
    if (rl) return rl;

    // Verify creator exists
    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle, pipeline_status, profile_id')
        .eq('id', creatorId)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.profile_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (creator.handle !== handle) {
        return NextResponse.json({ error: 'Handle does not match creator' }, { status: 400 });
    }

    // Don't restart if actively running
    const runningStates = ['scraping', 'transcribing', 'indexing', 'cleaning', 'clustering', 'extracting'];
    if (runningStates.includes(creator.pipeline_status)) {
        return NextResponse.json({
            message: 'Pipeline already running',
            status: creator.pipeline_status,
        });
    }

    try {
        const runId = randomUUID();
        const { error: reserveError } = await supabase
            .from('creators')
            .update({
                pipeline_status: 'scraping',
                pipeline_error: null,
                pipeline_run_id: runId,
            })
            .eq('id', creatorId)
            .eq('profile_id', user.id);
        if (reserveError) {
            throw new Error(`Failed to reserve pipeline run: ${reserveError.message}`);
        }

        const enqueue = await enqueuePipelineStartEvent({
            creatorId,
            handle,
            runId,
            trigger: 'manual_retry',
        });
        if (enqueue.transport === 'queue') {
            after(() => kickPipelineQueueProcessor('pipeline_start_enqueue', 2));
        } else {
            const fallbackGraceMs = enqueue.dispatchVerified === false ? 0 : undefined;
            const fallbackInput = {
                creatorId,
                handle,
                runId,
                trigger: 'manual_retry' as const,
                source: 'pipeline_start',
                graceMs: fallbackGraceMs,
            };
            if (fallbackGraceMs === 0) {
                void startDispatchFallbackWatchdog(fallbackInput);
            } else {
                after(() => startDispatchFallbackWatchdog(fallbackInput));
            }
        }

        return NextResponse.json({
            message: 'Pipeline started',
            status: 'scraping',
            transport: enqueue.transport,
            runId,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown enqueue error';
        await supabase
            .from('creators')
            .update({
                pipeline_status: 'error',
                pipeline_error: `Failed to start pipeline: ${message}`,
                pipeline_run_id: null,
            })
            .eq('id', creatorId)
            .eq('profile_id', user.id);

        await emitPipelineAlert({
            level: 'error',
            code: 'pipeline_start_enqueue_failed',
            message,
            creatorId,
            runId: 'manual-start',
            details: { handle },
        });
        return NextResponse.json(
            { error: 'Failed to start pipeline. Please try again in a moment.', details: message },
            { status: 503 }
        );
    }
}
