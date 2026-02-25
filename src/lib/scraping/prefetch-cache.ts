import type { NormalizedProfile } from '@/lib/scraping/scrapeCreators';

interface PrefetchEntry {
    profile: NormalizedProfile;
    expiresAt: number;
}

const PREFETCH_TTL_MS = 10 * 60 * 1000;
const store = new Map<string, PrefetchEntry>();

function keyForHandle(handle: string): string {
    return handle.replace(/^@/, '').trim().toLowerCase();
}

function pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) {
            store.delete(key);
        }
    }
}

setInterval(pruneExpired, 60_000);

export function getPrefetchedProfile(handle: string): NormalizedProfile | null {
    const key = keyForHandle(handle);
    const entry = store.get(key);

    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
    }

    return entry.profile;
}

export function setPrefetchedProfile(handle: string, profile: NormalizedProfile): void {
    const key = keyForHandle(handle);
    store.set(key, {
        profile,
        expiresAt: Date.now() + PREFETCH_TTL_MS,
    });
}
