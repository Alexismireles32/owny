// Test: Webhook idempotency
// PRD §8.6: stripe_events table for dedup

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate the webhook idempotency logic
interface StripeEventRecord {
    stripe_event_id: string;
    event_type: string;
    processing_status: 'received' | 'processed' | 'failed';
    processed_at: string | null;
    error_message: string | null;
}

class MockStripeEventsStore {
    private events = new Map<string, StripeEventRecord>();

    async checkExists(eventId: string): Promise<boolean> {
        return this.events.has(eventId);
    }

    async record(eventId: string, eventType: string): Promise<void> {
        this.events.set(eventId, {
            stripe_event_id: eventId,
            event_type: eventType,
            processing_status: 'received',
            processed_at: null,
            error_message: null,
        });
    }

    async markProcessed(eventId: string): Promise<void> {
        const event = this.events.get(eventId);
        if (event) {
            event.processing_status = 'processed';
            event.processed_at = new Date().toISOString();
        }
    }

    async markFailed(eventId: string, error: string): Promise<void> {
        const event = this.events.get(eventId);
        if (event) {
            event.processing_status = 'failed';
            event.error_message = error;
        }
    }

    getEvent(eventId: string): StripeEventRecord | undefined {
        return this.events.get(eventId);
    }

    clear(): void {
        this.events.clear();
    }
}

async function processWebhookEvent(
    store: MockStripeEventsStore,
    eventId: string,
    eventType: string,
    handler: () => Promise<void>
): Promise<{ received: boolean; duplicate?: boolean; error?: string }> {
    // Idempotency check
    const exists = await store.checkExists(eventId);
    if (exists) {
        return { received: true, duplicate: true };
    }

    // Record event
    await store.record(eventId, eventType);

    try {
        await handler();
        await store.markProcessed(eventId);
        return { received: true };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await store.markFailed(eventId, errorMsg);
        return { received: true, error: errorMsg };
    }
}

describe('Webhook Idempotency', () => {
    let store: MockStripeEventsStore;

    const mockHandler = vi.fn(async () => {
        return;
    });

    beforeEach(() => {
        store = new MockStripeEventsStore();
        mockHandler.mockClear();
    });

    it('should process a new event', async () => {
        const result = await processWebhookEvent(
            store,
            'evt_123',
            'checkout.session.completed',
            mockHandler
        );

        expect(result.received).toBe(true);
        expect(result.duplicate).toBeUndefined();
        expect(mockHandler).toHaveBeenCalledOnce();
    });

    it('should skip duplicate events (idempotency)', async () => {
        // Process first time
        await processWebhookEvent(store, 'evt_dup', 'checkout.session.completed', mockHandler);
        expect(mockHandler).toHaveBeenCalledTimes(1);

        // Process same event again
        const result = await processWebhookEvent(store, 'evt_dup', 'checkout.session.completed', mockHandler);
        expect(result.duplicate).toBe(true);
        expect(mockHandler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should handle multiple different events', async () => {
        await processWebhookEvent(store, 'evt_1', 'checkout.session.completed', mockHandler);
        await processWebhookEvent(store, 'evt_2', 'charge.refunded', mockHandler);
        await processWebhookEvent(store, 'evt_3', 'account.updated', mockHandler);

        expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it('should not replay a duplicate even after processing', async () => {
        await processWebhookEvent(store, 'evt_done', 'checkout.session.completed', mockHandler);

        // Verify it was processed
        const event = store.getEvent('evt_done');
        expect(event?.processing_status).toBe('processed');

        // Try replay
        const result = await processWebhookEvent(store, 'evt_done', 'checkout.session.completed', mockHandler);
        expect(result.duplicate).toBe(true);
        expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should mark failed events correctly', async () => {
        const failingHandler = vi.fn(async () => {
            throw new Error('Database connection failed');
        });

        const result = await processWebhookEvent(
            store,
            'evt_fail',
            'checkout.session.completed',
            failingHandler
        );

        expect(result.error).toBe('Database connection failed');
        const event = store.getEvent('evt_fail');
        expect(event?.processing_status).toBe('failed');
        expect(event?.error_message).toBe('Database connection failed');
    });

    it('should record event type correctly', async () => {
        await processWebhookEvent(store, 'evt_type', 'charge.refunded', mockHandler);
        const event = store.getEvent('evt_type');
        expect(event?.event_type).toBe('charge.refunded');
    });

    it('should set processed_at timestamp', async () => {
        await processWebhookEvent(store, 'evt_ts', 'checkout.session.completed', mockHandler);
        const event = store.getEvent('evt_ts');
        expect(event?.processed_at).not.toBeNull();
    });
});
