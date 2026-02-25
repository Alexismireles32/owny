// POST /api/scrape/profile
// Main entry point: receives TikTok handle → verifies → creates creator → kicks off pipeline
// Per SCRAPE_CREATORS_FLOW.md
//
// Strategy: insert with ONLY base schema columns first (guaranteed to exist),
// then attempt to update with pipeline columns (may not exist if migration 00009 not applied).

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchTikTokProfile, AppError } from '@/lib/scraping/scrapeCreators';
import { getPrefetchedProfile, setPrefetchedProfile } from '@/lib/scraping/prefetch-cache';
import { enqueuePipelineStartEvent } from '@/lib/inngest/enqueue';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const HANDLE_REGEX = /^[a-zA-Z0-9._]{1,24}$/;
const RESTARTABLE_STATES = new Set(['pending', 'error', 'insufficient_content']);

function normalizeHandle(raw: string): string {
    return raw.replace(/^@/, '').trim().toLowerCase();
}

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

async function enqueuePipelineEvent(db: ReturnType<typeof getServiceDb>, creatorId: string, handle: string) {
    try {
        await enqueuePipelineStartEvent({ creatorId, handle });
        return { ok: true as const };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown enqueue error';
        log.error('Pipeline enqueue failed', { creatorId, handle, error: message });
        await db
            .from('creators')
            .update({
                pipeline_status: 'error',
                pipeline_error: `Failed to start background pipeline: ${message}`,
            })
            .eq('id', creatorId);
        return { ok: false as const, message };
    }
}

export async function POST(request: Request) {
    let body: { handle?: string };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.handle || typeof body.handle !== 'string') {
        return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    const handle = normalizeHandle(body.handle);

    if (!HANDLE_REGEX.test(handle)) {
        return NextResponse.json(
            { error: 'Invalid TikTok handle. Use 1-24 characters: letters, numbers, dots, underscores.' },
            { status: 400 }
        );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { error: 'Please sign in first to connect your TikTok account.' },
            { status: 401 }
        );
    }

    // Rate limiting
    const rl = rateLimitResponse(user.id, 'scrape-profile');
    if (rl) return rl;

    const db = getServiceDb();

    // Check reserved handles (graceful — table may not exist)
    const { data: reserved } = await db
        .from('reserved_handles')
        .select('handle')
        .eq('handle', handle)
        .maybeSingle();

    if (reserved) {
        return NextResponse.json(
            { error: 'This handle is reserved. Try a different one.' },
            { status: 409 }
        );
    }

    // Check if creator already exists (use only base columns)
    const { data: existingCreator } = await db
        .from('creators')
        .select('id, handle, profile_id, pipeline_status')
        .eq('handle', handle)
        .maybeSingle();

    if (existingCreator) {
        if (existingCreator.profile_id !== user.id) {
            return NextResponse.json(
                { error: 'That TikTok handle is already connected to another account.' },
                { status: 409 }
            );
        }

        const status = existingCreator.pipeline_status || 'pending';

        if (RESTARTABLE_STATES.has(status)) {
            await db
                .from('creators')
                .update({ pipeline_status: 'scraping', pipeline_error: null })
                .eq('id', existingCreator.id);

            const enqueued = await enqueuePipelineEvent(db, existingCreator.id, handle);
            if (!enqueued.ok) {
                return NextResponse.json(
                    { error: 'We could not start your pipeline. Please try again.' },
                    { status: 503 }
                );
            }

            return NextResponse.json({
                exists: true,
                creatorId: existingCreator.id,
                pipelineStatus: 'scraping',
            });
        }

        return NextResponse.json({
            exists: true,
            creatorId: existingCreator.id,
            pipelineStatus: status,
        });
    }

    // New creator flow
    try {
        // 1. Use prefetched profile when available, fallback to provider fetch.
        const prefetched = getPrefetchedProfile(handle);
        const profile = prefetched ?? await fetchTikTokProfile(handle);

        if (prefetched) {
            log.info('Using prefetched TikTok profile', { handle });
        } else {
            log.info('Fetched TikTok profile from provider', { handle });
            setPrefetchedProfile(handle, profile);
        }

        if (!profile.nickname) {
            return NextResponse.json(
                { error: 'Could not find that TikTok account. Please check the username.' },
                { status: 404 }
            );
        }

        log.info('Profile fetched', {
            handle,
            nickname: profile.nickname,
            followers: profile.followerCount,
        });

        // 2. Ensure profile row exists
        const { data: existingProfile } = await db
            .from('profiles')
            .select('id, role')
            .eq('id', user.id)
            .maybeSingle();

        if (!existingProfile) {
            await db.from('profiles').upsert({
                id: user.id,
                email: user.email || '',
                role: 'creator',
            });
        } else if (existingProfile.role === 'buyer') {
            await db
                .from('profiles')
                .update({ role: 'creator' })
                .eq('id', user.id);
        }

        // 2.5. Check if THIS USER already has a creator (idx_creators_profile is unique)
        const { data: userCreator } = await db
            .from('creators')
            .select('id, handle')
            .eq('profile_id', user.id)
            .maybeSingle();

        if (userCreator) {
            // User already has a creator — update it with the new TikTok data
            log.info('Updating existing creator with new TikTok data', {
                creatorId: userCreator.id,
                oldHandle: userCreator.handle,
                newHandle: handle,
            });

            await db.from('creators').update({
                handle,
                display_name: profile.nickname,
                bio: profile.bio,
                avatar_url: profile.avatarUrl,
            }).eq('id', userCreator.id);

            // Try to set pipeline columns too
            await db.from('creators').update({
                follower_count: profile.followerCount,
                following_count: profile.followingCount,
                video_count: profile.videoCount,
                is_verified: profile.isVerified,
                tiktok_url: profile.tiktokUrl,
                pipeline_status: 'scraping',
            }).eq('id', userCreator.id);

            // Kick off pipeline via Inngest (multi-step, retries, no timeout issues)
            const enqueued = await enqueuePipelineEvent(db, userCreator.id, handle);
            if (!enqueued.ok) {
                return NextResponse.json(
                    { error: 'We could not start your pipeline. Please try again.' },
                    { status: 503 }
                );
            }

            return NextResponse.json({
                created: true,
                creatorId: userCreator.id,
                pipelineStatus: 'scraping',
            });
        }

        // 4. Insert creator with BASE columns ONLY (these always exist)
        const { data: newCreator, error: insertError } = await db
            .from('creators')
            .insert({
                profile_id: user.id,
                handle,
                display_name: profile.nickname,
                bio: profile.bio,
                avatar_url: profile.avatarUrl,
            })
            .select('id')
            .single();

        if (insertError) {
            // Handle race condition (23505 = unique violation)
            if (insertError.code === '23505') {
                const { data: winner } = await db
                    .from('creators')
                    .select('id, profile_id, pipeline_status')
                    .eq('handle', handle)
                    .maybeSingle();

                if (winner) {
                    if (winner.profile_id !== user.id) {
                        return NextResponse.json(
                            { error: 'That TikTok handle is already connected to another account.' },
                            { status: 409 }
                        );
                    }

                    const status = winner.pipeline_status || 'pending';
                    if (RESTARTABLE_STATES.has(status)) {
                        await db
                            .from('creators')
                            .update({ pipeline_status: 'scraping', pipeline_error: null })
                            .eq('id', winner.id);

                        const enqueued = await enqueuePipelineEvent(db, winner.id, handle);
                        if (!enqueued.ok) {
                            return NextResponse.json(
                                { error: 'We could not start your pipeline. Please try again.' },
                                { status: 503 }
                            );
                        }

                        return NextResponse.json({
                            exists: true,
                            creatorId: winner.id,
                            pipelineStatus: 'scraping',
                        });
                    }

                    return NextResponse.json({
                        exists: true,
                        creatorId: winner.id,
                        pipelineStatus: status,
                    });
                }
            }

            log.error('Creator insert error', {
                msg: insertError.message,
                code: insertError.code,
                details: insertError.details,
                hint: insertError.hint,
                handle,
                userId: user.id,
            });
            return NextResponse.json({
                error: 'Failed to create creator profile. ' + insertError.message,
            }, { status: 500 });
        }

        const creatorId = newCreator.id;
        log.info('Creator created', { creatorId, handle });

        // 5. Attempt to set pipeline columns (may fail if migration not applied — that's OK)
        const { error: updateError } = await db
            .from('creators')
            .update({
                follower_count: profile.followerCount,
                following_count: profile.followingCount,
                video_count: profile.videoCount,
                is_verified: profile.isVerified,
                tiktok_url: profile.tiktokUrl,
                pipeline_status: 'scraping',
            })
            .eq('id', creatorId);

        const pipelineReady = !updateError;
        if (updateError) {
            log.warn('Pipeline columns not available (migration 00009 not applied)', {
                error: updateError.message,
            });
        }

        // 6. Kick off pipeline via Inngest
        if (pipelineReady) {
            const enqueued = await enqueuePipelineEvent(db, creatorId, handle);
            if (!enqueued.ok) {
                return NextResponse.json(
                    { error: 'We could not start your pipeline. Please try again.' },
                    { status: 503 }
                );
            }
        }

        return NextResponse.json({
            created: true,
            creatorId,
            pipelineStatus: pipelineReady ? 'scraping' : 'pending',
        }, { status: 201 });

    } catch (err) {
        if (err instanceof AppError) {
            return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
        }
        log.error('Scrape profile error', {
            error: err instanceof Error ? err.message : 'Unknown',
            stack: err instanceof Error ? err.stack : undefined,
            handle,
        });
        return NextResponse.json(
            { error: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
