import { createClient as createServiceClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

const ALERT_TIMEOUT_MS = 4_000;

export type PipelineTrigger =
    | 'onboarding'
    | 'manual_retry'
    | 'auto_recovery'
    | 'dlq_replay'
    | 'unknown';

export class PipelineRunSupersededError extends Error {
    constructor(
        public readonly creatorId: string,
        public readonly expectedRunId: string,
        public readonly actualRunId: string | null
    ) {
        super(
            `Pipeline run superseded for creator ${creatorId}: expected ${expectedRunId}, actual ${actualRunId ?? 'null'}`
        );
        this.name = 'PipelineRunSupersededError';
    }
}

interface BeginPipelineRunInput {
    runId: string;
    creatorId: string;
    handle: string;
    eventId?: string | null;
    trigger: PipelineTrigger;
}

interface PipelineHeartbeatInput {
    runId: string;
    step: string;
    metrics?: Record<string, unknown>;
}

interface PipelineFailureInput {
    runId: string;
    creatorId: string;
    handle: string;
    eventId?: string | null;
    failedStep: string;
    errorMessage: string;
    payload?: Record<string, unknown>;
}

interface PipelineAlertInput {
    level: 'warn' | 'error';
    code: string;
    message: string;
    creatorId: string;
    runId: string;
    details?: Record<string, unknown>;
}

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

function asErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

async function maybeSendAlertWebhook(payload: Record<string, unknown>) {
    const webhookUrl = process.env.PIPELINE_ALERT_WEBHOOK_URL?.trim();
    if (!webhookUrl) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Alert webhook HTTP ${response.status}${text ? `: ${text}` : ''}`);
        }
    } catch (error) {
        log.warn('Pipeline alert webhook failed', {
            error: asErrorMessage(error),
        });
    } finally {
        clearTimeout(timeout);
    }
}

export async function emitPipelineAlert(input: PipelineAlertInput) {
    const entry = {
        category: 'pipeline_alert',
        ...input,
        timestamp: new Date().toISOString(),
    };

    if (input.level === 'error') {
        log.error('Pipeline alert', entry);
    } else {
        log.warn('Pipeline alert', entry);
    }

    await maybeSendAlertWebhook({
        type: 'pipeline_alert',
        ...entry,
    });
}

export async function beginPipelineRun(input: BeginPipelineRunInput) {
    const db = getServiceDb();
    const nowIso = new Date().toISOString();

    const { data: existing, error: existingError } = await db
        .from('pipeline_runs')
        .select('id, attempt_count')
        .eq('run_id', input.runId)
        .maybeSingle();

    if (existingError) {
        throw new Error(`Failed to lookup pipeline run: ${existingError.message}`);
    }

    if (existing) {
        const { error: updateError } = await db
            .from('pipeline_runs')
            .update({
                status: 'running',
                current_step: 'bootstrap',
                attempt_count: (existing.attempt_count || 1) + 1,
                error_message: null,
                event_id: input.eventId || null,
                metrics: { trigger: input.trigger },
                last_heartbeat_at: nowIso,
                finished_at: null,
            })
            .eq('id', existing.id);

        if (updateError) {
            throw new Error(`Failed to update existing pipeline run: ${updateError.message}`);
        }

        return;
    }

    const { error: insertError } = await db.from('pipeline_runs').insert({
        run_id: input.runId,
        creator_id: input.creatorId,
        handle: input.handle,
        event_id: input.eventId || null,
        status: 'running',
        current_step: 'bootstrap',
        attempt_count: 1,
        metrics: { trigger: input.trigger },
        started_at: nowIso,
        last_heartbeat_at: nowIso,
    });

    if (insertError) {
        throw new Error(`Failed to insert pipeline run: ${insertError.message}`);
    }
}

export async function heartbeatPipelineRun(input: PipelineHeartbeatInput) {
    const db = getServiceDb();

    const { error } = await db
        .from('pipeline_runs')
        .update({
            current_step: input.step,
            metrics: input.metrics ?? {},
            last_heartbeat_at: new Date().toISOString(),
        })
        .eq('run_id', input.runId);

    if (error) {
        log.warn('Pipeline run heartbeat failed', {
            runId: input.runId,
            step: input.step,
            error: error.message,
        });
    }
}

export async function completePipelineRun(runId: string, metrics?: Record<string, unknown>) {
    const db = getServiceDb();
    const nowIso = new Date().toISOString();

    const { error } = await db
        .from('pipeline_runs')
        .update({
            status: 'succeeded',
            current_step: 'completed',
            last_heartbeat_at: nowIso,
            finished_at: nowIso,
            metrics: metrics ?? {},
            error_message: null,
        })
        .eq('run_id', runId);

    if (error) {
        log.warn('Failed to mark pipeline run complete', {
            runId,
            error: error.message,
        });
    }

    const { error: resolveError } = await db
        .from('pipeline_dead_letters')
        .update({
            status: 'resolved',
            resolved_at: nowIso,
        })
        .eq('run_id', runId)
        .in('status', ['open', 'replayed']);

    if (resolveError) {
        log.warn('Failed to resolve DLQ row for run', {
            runId,
            error: resolveError.message,
        });
    }
}

export async function markPipelineRunSuperseded(
    runId: string,
    creatorId: string,
    details?: Record<string, unknown>
) {
    const db = getServiceDb();
    const nowIso = new Date().toISOString();

    const { error } = await db
        .from('pipeline_runs')
        .update({
            status: 'superseded',
            current_step: 'superseded',
            last_heartbeat_at: nowIso,
            finished_at: nowIso,
            metrics: details ?? {},
        })
        .eq('run_id', runId);

    if (error) {
        log.warn('Failed to mark pipeline run superseded', {
            runId,
            creatorId,
            error: error.message,
        });
    }
}

export async function failPipelineRun(input: PipelineFailureInput) {
    const db = getServiceDb();
    const nowIso = new Date().toISOString();

    const { error: runError } = await db
        .from('pipeline_runs')
        .update({
            status: 'failed',
            current_step: input.failedStep,
            last_heartbeat_at: nowIso,
            finished_at: nowIso,
            error_message: input.errorMessage,
            metrics: input.payload ?? {},
        })
        .eq('run_id', input.runId);

    if (runError) {
        log.warn('Failed to mark pipeline run failed', {
            runId: input.runId,
            error: runError.message,
        });
    }

    const { error: dlqError } = await db.from('pipeline_dead_letters').upsert(
        {
            run_id: input.runId,
            creator_id: input.creatorId,
            handle: input.handle,
            event_id: input.eventId || null,
            failed_step: input.failedStep,
            error_message: input.errorMessage,
            payload: input.payload ?? {},
            status: 'open',
            resolved_at: null,
        },
        { onConflict: 'run_id' }
    );

    if (dlqError) {
        log.warn('Failed to write pipeline dead letter', {
            runId: input.runId,
            creatorId: input.creatorId,
            error: dlqError.message,
        });
    }

    await emitPipelineAlert({
        level: 'error',
        code: 'pipeline_failed',
        message: input.errorMessage,
        creatorId: input.creatorId,
        runId: input.runId,
        details: {
            handle: input.handle,
            failedStep: input.failedStep,
            eventId: input.eventId || null,
            ...(input.payload ?? {}),
        },
    });
}

export async function markLatestDeadLetterReplayed(creatorId: string) {
    const db = getServiceDb();
    const { data: dlqRow, error: fetchError } = await db
        .from('pipeline_dead_letters')
        .select('id, replay_count, status')
        .eq('creator_id', creatorId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (fetchError) {
        log.warn('Failed to fetch latest dead letter for replay', {
            creatorId,
            error: fetchError.message,
        });
        return;
    }

    if (!dlqRow) return;

    const { error: updateError } = await db
        .from('pipeline_dead_letters')
        .update({
            status: 'replayed',
            replay_count: (dlqRow.replay_count || 0) + 1,
            replayed_at: new Date().toISOString(),
        })
        .eq('id', dlqRow.id);

    if (updateError) {
        log.warn('Failed to update dead letter replay state', {
            creatorId,
            deadLetterId: dlqRow.id,
            error: updateError.message,
        });
    }
}

export async function ensureActivePipelineRun(creatorId: string, runId: string) {
    const db = getServiceDb();
    const { data, error } = await db
        .from('creators')
        .select('pipeline_run_id')
        .eq('id', creatorId)
        .single();

    if (error || !data) {
        throw new Error(
            `Failed to verify active pipeline run for creator ${creatorId}: ${error?.message || 'Creator not found'}`
        );
    }

    const activeRunId = data.pipeline_run_id ? String(data.pipeline_run_id) : null;

    // If no token is set, allow legacy behavior; when set, enforce strict ownership.
    if (!activeRunId) return;
    if (activeRunId !== runId) {
        throw new PipelineRunSupersededError(creatorId, runId, activeRunId);
    }
}

export async function setCreatorPipelineStatus(params: {
    creatorId: string;
    status: string;
    runId?: string;
    pipelineError?: string | null;
    extra?: Record<string, unknown>;
}) {
    const db = getServiceDb();
    const updates: Record<string, unknown> = {
        pipeline_status: params.status,
        ...(params.extra ?? {}),
    };

    if (params.pipelineError !== undefined) {
        updates.pipeline_error = params.pipelineError;
    }

    let query = db.from('creators').update(updates).eq('id', params.creatorId);

    if (params.runId) {
        query = query.eq('pipeline_run_id', params.runId);
    }

    const { data, error } = await query.select('id').maybeSingle();

    if (error) {
        throw new Error(`Failed to update creator pipeline status: ${error.message}`);
    }

    if (params.runId && !data) {
        throw new PipelineRunSupersededError(params.creatorId, params.runId, null);
    }
}
