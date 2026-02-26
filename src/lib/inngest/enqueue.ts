import { inngest } from '@/lib/inngest/client';
import { log } from '@/lib/logger';
import { randomUUID } from 'crypto';
import type { PipelineTrigger } from '@/lib/inngest/reliability';

interface PipelineStartEventInput {
    creatorId: string;
    handle: string;
    runId?: string;
    trigger?: PipelineTrigger;
    replayOfRunId?: string;
}

interface EnqueueResult {
    ids: string[];
    transport: 'sdk' | 'http';
    endpoint?: string;
    runId: string;
    eventId: string;
}

interface InngestSdkSendResult {
    ids?: string[];
    status?: number;
    error?: string;
}

const ENQUEUE_TIMEOUT_MS = 10_000;
const HTTP_RETRY_ATTEMPTS = 2;
const SYNC_TIMEOUT_MS = 5_000;
const SYNC_RETRY_WINDOW_MS = 5 * 60 * 1000;

let lastSyncAttemptAt = 0;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        const cause = (error as Error & { cause?: unknown }).cause;
        if (cause instanceof Error) {
            return `${error.message} (cause: ${cause.message})`;
        }
        return error.message;
    }
    return String(error);
}

function buildFallbackEndpoints(eventKey: string): string[] {
    const endpoints: string[] = [];
    const fromEnv = process.env.INNGEST_EVENT_API_BASE_URL || process.env.INNGEST_BASE_URL;

    if (fromEnv) {
        try {
            endpoints.push(new URL(`e/${eventKey}`, fromEnv).toString());
        } catch {
            // Ignore invalid custom URLs and continue with defaults.
        }
    }

    endpoints.push(`https://inn.gs/e/${eventKey}`);

    return Array.from(new Set(endpoints));
}

function getAppBaseUrl(): string | null {
    const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (explicitUrl) return explicitUrl;

    const vercelUrl = process.env.VERCEL_URL?.trim();
    if (vercelUrl) return `https://${vercelUrl}`;

    return null;
}

async function ensureInngestRegistration(): Promise<void> {
    const now = Date.now();
    if (now - lastSyncAttemptAt < SYNC_RETRY_WINDOW_MS) return;
    lastSyncAttemptAt = now;

    const baseUrl = getAppBaseUrl();
    if (!baseUrl) return;

    const endpoint = new URL('/api/inngest', baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ''}`);
        }
    } catch (error) {
        log.warn('Inngest out-of-band sync attempt failed', {
            endpoint,
            error: getErrorMessage(error),
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function postEventBatch(endpoint: string, body: string, ingressEnv?: string | null): Promise<string[]> {
    const errors: string[] = [];

    for (let attempt = 1; attempt <= HTTP_RETRY_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ENQUEUE_TIMEOUT_MS);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(ingressEnv ? { 'x-inngest-env': ingressEnv } : {}),
                },
                body,
                signal: controller.signal,
            });

            let payload: unknown = null;
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }

            if (!response.ok) {
                const err =
                    typeof payload === 'object' &&
                        payload !== null &&
                        'error' in payload &&
                        typeof payload.error === 'string'
                        ? payload.error
                        : `HTTP ${response.status}`;
                throw new Error(err);
            }

            if (
                typeof payload === 'object' &&
                payload !== null &&
                'status' in payload &&
                payload.status !== 200
            ) {
                const err =
                    'error' in payload && typeof payload.error === 'string'
                        ? payload.error
                        : `Unexpected response status: ${String(payload.status)}`;
                throw new Error(err);
            }

            if (
                typeof payload === 'object' &&
                payload !== null &&
                'ids' in payload &&
                Array.isArray(payload.ids)
            ) {
                return payload.ids.filter((id): id is string => typeof id === 'string');
            }

            return [];
        } catch (error) {
            errors.push(`attempt ${attempt}: ${getErrorMessage(error)}`);
            if (attempt < HTTP_RETRY_ATTEMPTS) {
                await sleep(attempt * 200);
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    throw new Error(errors.join(' | '));
}

export async function enqueuePipelineStartEvent({
    creatorId,
    handle,
    runId,
    trigger = 'unknown',
    replayOfRunId,
}: PipelineStartEventInput): Promise<EnqueueResult> {
    await ensureInngestRegistration();
    const normalizedRunId = runId || randomUUID();
    const eventId = `pipeline-start-${creatorId}-${normalizedRunId}`;
    const eventData = {
        creatorId,
        handle,
        runId: normalizedRunId,
        trigger,
        replayOfRunId: replayOfRunId || null,
    };

    try {
        const result = await inngest.send({
            id: eventId,
            name: 'pipeline/start',
            data: eventData,
        }) as InngestSdkSendResult;

        const status = typeof result?.status === 'number' ? result.status : 200;
        const ids = Array.isArray(result?.ids)
            ? result.ids.filter((id): id is string => typeof id === 'string')
            : [];

        if (status !== 200) {
            const errorMessage =
                typeof result?.error === 'string' && result.error.length > 0
                    ? result.error
                    : `Inngest SDK returned status ${status}`;
            throw new Error(errorMessage);
        }

        if (ids.length === 0) {
            throw new Error('Inngest SDK did not return an event id');
        }

        return {
            ids,
            transport: 'sdk',
            runId: normalizedRunId,
            eventId,
        };
    } catch (sdkError) {
        const sdkMessage = getErrorMessage(sdkError);
        const eventKey = process.env.INNGEST_EVENT_KEY;
        const ingressEnv = inngest.env || process.env.INNGEST_ENV?.trim() || null;

        if (!eventKey) {
            throw new Error(`Inngest enqueue failed via SDK and HTTP fallback is unavailable: ${sdkMessage}`);
        }

        const body = JSON.stringify([
            {
                id: eventId,
                name: 'pipeline/start',
                ts: Date.now(),
                data: eventData,
            },
        ]);

        const endpointErrors: string[] = [];

        for (const endpoint of buildFallbackEndpoints(eventKey)) {
            try {
                const ids = await postEventBatch(endpoint, body, ingressEnv);
                log.warn('Inngest enqueue recovered via HTTP fallback', {
                    creatorId,
                    handle,
                    endpoint,
                    ingressEnv,
                    sdkError: sdkMessage,
                });

                return {
                    ids,
                    transport: 'http',
                    endpoint,
                    runId: normalizedRunId,
                    eventId,
                };
            } catch (error) {
                endpointErrors.push(`${endpoint}: ${getErrorMessage(error)}`);
            }
        }

        throw new Error(
            `Inngest enqueue failed via SDK (${sdkMessage}) and HTTP fallback (${endpointErrors.join(' || ')})`
        );
    }
}
