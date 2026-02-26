// POST /api/pipeline/retry — Re-enqueue a failed/stale pipeline run
// Authenticated endpoint: validates creator ownership, checks restartable states

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { enqueuePipelineStartEvent } from '@/lib/inngest/enqueue';
import { log } from '@/lib/logger';
import { randomUUID } from 'crypto';
import { emitPipelineAlert, markLatestDeadLetterReplayed } from '@/lib/inngest/reliability';

const RESTARTABLE_STATES = new Set(['pending', 'error', 'insufficient_content']);

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { creatorId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.creatorId) {
        return NextResponse.json({ error: 'creatorId is required' }, { status: 400 });
    }

    const db = getServiceDb();

    const { data: creator, error: fetchError } = await db
        .from('creators')
        .select('id, profile_id, handle, pipeline_status')
        .eq('id', body.creatorId)
        .single();

    if (fetchError || !creator) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.profile_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = creator.pipeline_status || 'pending';

    if (!RESTARTABLE_STATES.has(status)) {
        return NextResponse.json({
            error: `Pipeline is currently "${status}" and cannot be restarted.`,
            status: creator.pipeline_status,
        }, { status: 409 });
    }

    try {
        const runId = randomUUID();
        const { error: reserveError } = await db
            .from('creators')
            .update({
                pipeline_status: 'scraping',
                pipeline_error: null,
                pipeline_run_id: runId,
            })
            .eq('id', creator.id);
        if (reserveError) {
            throw new Error(`Failed to reserve pipeline run: ${reserveError.message}`);
        }

        await enqueuePipelineStartEvent({
            creatorId: creator.id,
            handle: creator.handle,
            runId,
            trigger: 'dlq_replay',
        });
        await markLatestDeadLetterReplayed(creator.id);

        log.info('Pipeline retry enqueued', {
            creatorId: creator.id,
            handle: creator.handle,
            runId,
        });

        return NextResponse.json({
            success: true,
            status: 'scraping',
            runId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log.error('Pipeline retry failed', { creatorId: creator.id, error: message });
        await emitPipelineAlert({
            level: 'error',
            code: 'pipeline_retry_enqueue_failed',
            message,
            creatorId: creator.id,
            runId: 'manual-retry',
            details: { handle: creator.handle },
        });

        await db
            .from('creators')
            .update({
                pipeline_status: 'error',
                pipeline_error: `Retry failed: ${message}`,
                pipeline_run_id: null,
            })
            .eq('id', creator.id);

        return NextResponse.json({
            error: 'Failed to restart pipeline. Please try again later.',
        }, { status: 503 });
    }
}
