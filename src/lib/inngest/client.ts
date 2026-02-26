// Inngest client — singleton used across all functions
import { Inngest } from 'inngest';

function resolveInngestEnv(): string | undefined {
    const explicit = process.env.INNGEST_ENV?.trim();
    if (explicit) return explicit;

    // On Vercel, bind Inngest environment to git ref so event send + webhook serve
    // resolve to the same cloud environment.
    const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
    if (branch) return branch;

    // Fallback for production contexts where git metadata can be absent.
    if ((process.env.VERCEL_ENV || '').trim() === 'production') {
        return 'main';
    }

    return undefined;
}

export const inngest = new Inngest({
    // Use a dedicated app namespace to avoid collisions with stale/legacy registrations.
    id: process.env.INNGEST_APP_ID?.trim() || 'owny-core',
    env: resolveInngestEnv(),
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
});
