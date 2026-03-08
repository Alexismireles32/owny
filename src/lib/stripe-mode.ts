const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readEnv(name: string): string {
    return process.env[name]?.trim() || '';
}

function readFlag(name: string): boolean {
    return TRUE_VALUES.has(readEnv(name).toLowerCase());
}

function isPlaceholder(value: string): boolean {
    return value.toLowerCase().includes('placeholder');
}

export function isFakeStripeModeEnabled(): boolean {
    return readFlag('OWNY_FAKE_STRIPE') || readFlag('OWNY_E2E_FAKE_STRIPE');
}

export function hasUsableStripeSecretKey(): boolean {
    const secretKey = readEnv('STRIPE_SECRET_KEY');
    return secretKey.length > 0 && !isPlaceholder(secretKey);
}

export function getStripeCheckoutSetupMessage(): string {
    return 'Stripe checkout is not configured yet. Add STRIPE_SECRET_KEY and webhook secrets, or set OWNY_FAKE_STRIPE=1 for local simulated purchases.';
}

export function getStripeConnectSetupMessage(): string {
    return 'Stripe Connect is not configured yet. Add STRIPE_SECRET_KEY to enable creator onboarding and payout status checks.';
}
