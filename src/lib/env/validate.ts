const ALWAYS_REQUIRED_KEYS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL',
] as const;

const PRODUCTION_REQUIRED_KEYS = [
    'CRON_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
] as const;

const OPTIONAL_WARNING_KEYS = [
    'ADMIN_EMAILS',
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'RESEND_API_KEY',
    'PIPELINE_ALERT_WEBHOOK_URL',
] as const;

const PLACEHOLDER_WARNING_KEYS = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
] as const;
const PIPELINE_DISPATCH_MODES = new Set(['supabase', 'inngest']);

let validated = false;

function isSet(value: string | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

function getMissing(keys: readonly string[]): string[] {
    return keys.filter((key) => !isSet(process.env[key]));
}

function isProductionLike(): boolean {
    const env = (process.env.VERCEL_ENV || process.env.NODE_ENV || '').toLowerCase();
    return env === 'production' || env === 'preview';
}

export function validateServerEnv(): void {
    if (validated) return;
    validated = true;

    const requiredKeys = isProductionLike()
        ? [...ALWAYS_REQUIRED_KEYS, ...PRODUCTION_REQUIRED_KEYS]
        : [...ALWAYS_REQUIRED_KEYS];
    const missingRequired = getMissing(requiredKeys);

    if (missingRequired.length > 0) {
        throw new Error(
            `[env] Missing required environment variables: ${missingRequired.join(', ')}`
        );
    }

    const missingOptional = getMissing(OPTIONAL_WARNING_KEYS);
    if (missingOptional.length > 0) {
        console.warn(
            `[env] Optional environment variables not set: ${missingOptional.join(', ')}`
        );
    }

    const placeholderKeys = PLACEHOLDER_WARNING_KEYS.filter((key) => {
        const value = process.env[key];
        return isSet(value) && value!.toLowerCase().includes('placeholder');
    });

    if (placeholderKeys.length > 0) {
        console.warn(
            `[env] Placeholder values detected for: ${placeholderKeys.join(', ')}`
        );
    }

    const dispatchMode = (process.env.PIPELINE_DISPATCH_MODE || 'supabase').trim().toLowerCase();
    if (!PIPELINE_DISPATCH_MODES.has(dispatchMode)) {
        console.warn(
            `[env] Invalid PIPELINE_DISPATCH_MODE="${process.env.PIPELINE_DISPATCH_MODE}". Falling back to "supabase".`
        );
    }
}
