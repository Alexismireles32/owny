// src/lib/logger.ts
// PRD §M13 — Structured JSON logging for webhook processing, AI calls, job processing

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context,
    };
    return JSON.stringify(entry);
}

export const log = {
    info(message: string, context?: LogContext) {
        console.log(formatLog('info', message, context));
    },

    warn(message: string, context?: LogContext) {
        console.warn(formatLog('warn', message, context));
    },

    error(message: string, context?: LogContext) {
        console.error(formatLog('error', message, context));
    },

    /**
     * Log an AI pipeline call with cost and latency tracking.
     */
    ai(operation: string, context: LogContext & { durationMs: number; model?: string; estimatedCost?: number }) {
        console.log(formatLog('info', `AI: ${operation}`, {
            category: 'ai',
            ...context,
        }));
    },

    /**
     * Log a webhook processing event.
     */
    webhook(eventType: string, context: LogContext & { stripeEventId: string; status: string }) {
        console.log(formatLog('info', `Webhook: ${eventType}`, {
            category: 'webhook',
            ...context,
        }));
    },

    /**
     * Log a job processing event.
     */
    job(jobType: string, context: LogContext & { jobId: string; status: string }) {
        console.log(formatLog('info', `Job: ${jobType}`, {
            category: 'job',
            ...context,
        }));
    },
};
