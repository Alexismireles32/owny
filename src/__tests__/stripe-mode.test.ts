import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getStripeCheckoutSetupMessage,
    getStripeConnectSetupMessage,
    hasUsableStripeSecretKey,
    isFakeStripeModeEnabled,
} from '@/lib/stripe-mode';

describe('stripe mode helpers', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('detects fake stripe mode from the primary env flag', () => {
        vi.stubEnv('OWNY_FAKE_STRIPE', '1');

        expect(isFakeStripeModeEnabled()).toBe(true);
    });

    it('detects fake stripe mode from the legacy e2e env flag', () => {
        vi.stubEnv('OWNY_E2E_FAKE_STRIPE', 'true');

        expect(isFakeStripeModeEnabled()).toBe(true);
    });

    it('rejects placeholder stripe secrets', () => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'placeholder-secret-key');

        expect(hasUsableStripeSecretKey()).toBe(false);
    });

    it('accepts real-looking stripe secrets', () => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123456789');

        expect(hasUsableStripeSecretKey()).toBe(true);
    });

    it('returns actionable setup messages', () => {
        expect(getStripeCheckoutSetupMessage()).toContain('OWNY_FAKE_STRIPE=1');
        expect(getStripeConnectSetupMessage()).toContain('Stripe Connect');
    });
});
