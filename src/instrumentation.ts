import { validateServerEnv } from '@/lib/env/validate';

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        validateServerEnv();
    }
}
