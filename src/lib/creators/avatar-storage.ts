import { createClient as createServiceClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

const DEFAULT_AVATAR_BUCKET = 'creator-avatars';
const IMAGE_CONTENT_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml',
]);

let ensureBucketPromise: Promise<void> | null = null;

function getServiceStorageClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;
    return createServiceClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

function getAvatarBucketName() {
    return process.env.CREATOR_AVATAR_BUCKET || DEFAULT_AVATAR_BUCKET;
}

function sanitizePathSegment(input: string): string {
    const cleaned = input.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned.length > 0 ? cleaned : 'unknown';
}

function isSupabasePublicStorageUrl(url: string): boolean {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return false;
    return url.startsWith(`${base}/storage/v1/object/public/`);
}

function parseImageContentType(header: string | null): string | null {
    if (!header) return null;
    const normalized = header.split(';')[0]?.trim().toLowerCase() || '';
    if (!IMAGE_CONTENT_TYPES.has(normalized)) return null;
    return normalized;
}

async function ensureAvatarBucket() {
    const client = getServiceStorageClient();
    if (!client) return;

    if (!ensureBucketPromise) {
        ensureBucketPromise = (async () => {
            const bucket = getAvatarBucketName();
            const existing = await client.storage.getBucket(bucket);

            if (existing.data) {
                if (!existing.data.public) {
                    const { error: updateError } = await client.storage.updateBucket(bucket, { public: true });
                    if (updateError) {
                        throw new Error(`Failed to set avatar bucket public: ${updateError.message}`);
                    }
                }
                return;
            }

            const { error: createError } = await client.storage.createBucket(bucket, {
                public: true,
                fileSizeLimit: 5 * 1024 * 1024,
                allowedMimeTypes: Array.from(IMAGE_CONTENT_TYPES),
            });

            if (createError && !/already exists/i.test(createError.message)) {
                throw new Error(`Failed to create avatar bucket: ${createError.message}`);
            }
        })().catch((error) => {
            ensureBucketPromise = null;
            throw error;
        });
    }

    await ensureBucketPromise;
}

export async function persistCreatorAvatarToStorage(input: {
    sourceAvatarUrl: string | null | undefined;
    creatorKey: string;
    handle: string;
}): Promise<string | null> {
    const sourceAvatarUrl = input.sourceAvatarUrl?.trim() || null;
    if (!sourceAvatarUrl) return null;
    if (isSupabasePublicStorageUrl(sourceAvatarUrl)) return sourceAvatarUrl;

    const client = getServiceStorageClient();
    if (!client) return null;

    try {
        const parsed = new URL(sourceAvatarUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
    } catch {
        return null;
    }

    try {
        await ensureAvatarBucket();

        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => fetchController.abort(), 15_000);
        const response = await fetch(sourceAvatarUrl, {
            signal: fetchController.signal,
            redirect: 'follow',
            cache: 'no-store',
            headers: { Accept: 'image/*' },
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            log.warn('Avatar fetch failed; not updating creator avatar URL', {
                status: response.status,
                sourceAvatarUrl,
            });
            return null;
        }

        const contentType = parseImageContentType(response.headers.get('content-type'));
        if (!contentType) {
            log.warn('Avatar fetch returned unsupported content-type', {
                contentType: response.headers.get('content-type'),
                sourceAvatarUrl,
            });
            return null;
        }

        const buffer = await response.arrayBuffer();
        if (!buffer.byteLength) return null;

        const key = `${sanitizePathSegment(input.creatorKey)}/${sanitizePathSegment(input.handle)}/avatar`;
        const bucket = getAvatarBucketName();
        const { error: uploadError } = await client.storage.from(bucket).upload(key, buffer, {
            contentType,
            upsert: true,
            cacheControl: '3600',
        });

        if (uploadError) {
            log.warn('Avatar upload to Supabase Storage failed; not updating creator avatar URL', {
                error: uploadError.message,
                sourceAvatarUrl,
                bucket,
            });
            return null;
        }

        const { data } = client.storage.from(bucket).getPublicUrl(key);
        return data.publicUrl || null;
    } catch (error) {
        log.warn('Avatar persistence failed; not updating creator avatar URL', {
            error: error instanceof Error ? error.message : 'unknown',
            sourceAvatarUrl,
        });
        return null;
    }
}
