// GET /api/import/status
// Get import job status for the current creator

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCreatorJobs } from '@/lib/import/jobs';

export async function GET() {
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator profile required' }, { status: 403 });
    }

    // Fetch recent import-related jobs
    const jobs = await getCreatorJobs(supabase, creator.id, { limit: 20 });

    // Also compute video/transcript counts
    const { count: videoCount } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creator.id);

    const { count: transcriptCount } = await supabase
        .from('video_transcripts')
        .select('*', { count: 'exact', head: true })
        .in(
            'video_id',
            (await supabase
                .from('videos')
                .select('id')
                .eq('creator_id', creator.id)
            ).data?.map((v) => v.id) || []
        );

    return NextResponse.json({
        jobs,
        stats: {
            totalVideos: videoCount ?? 0,
            totalTranscripts: transcriptCount ?? 0,
        },
    });
}
