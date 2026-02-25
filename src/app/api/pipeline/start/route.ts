// POST /api/pipeline/start
// Sends pipeline event to Inngest for background execution
// Used for manual retries or re-running the pipeline

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { enqueuePipelineStartEvent } from '@/lib/inngest/enqueue';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
    const supabase = await createClient();
    let body: { creatorId?: string; handle?: string };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { creatorId, handle } = body;

    if (!creatorId || !handle) {
        return NextResponse.json({ error: 'creatorId and handle are required' }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting
    const rl = rateLimitResponse(user.id, 'pipeline-start');
    if (rl) return rl;

    // Verify creator exists
    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle, pipeline_status, profile_id')
        .eq('id', creatorId)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.profile_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (creator.handle !== handle) {
        return NextResponse.json({ error: 'Handle does not match creator' }, { status: 400 });
    }

    // Don't restart if actively running
    const runningStates = ['scraping', 'transcribing', 'cleaning', 'clustering', 'extracting'];
    if (runningStates.includes(creator.pipeline_status)) {
        return NextResponse.json({
            message: 'Pipeline already running',
            status: creator.pipeline_status,
        });
    }

    try {
        const enqueue = await enqueuePipelineStartEvent({ creatorId, handle });

        await supabase
            .from('creators')
            .update({ pipeline_status: 'scraping', pipeline_error: null })
            .eq('id', creatorId)
            .eq('profile_id', user.id);

        return NextResponse.json({
            message: 'Pipeline started via Inngest',
            status: 'scraping',
            transport: enqueue.transport,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown enqueue error';
        return NextResponse.json(
            { error: 'Failed to start pipeline. Please try again in a moment.', details: message },
            { status: 503 }
        );
    }
}
