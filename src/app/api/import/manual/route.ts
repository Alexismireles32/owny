// POST /api/import/manual
// Add a single video manually: { title?, url?, transcript, views? }

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { manualToVideoAndTranscript } from '@/lib/import/manual';

export async function POST(request: Request) {
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

    const body = await request.json();
    const { title, url, transcript, views, description } = body;

    if (!transcript?.trim()) {
        return NextResponse.json(
            { error: 'Transcript is required' },
            { status: 400 }
        );
    }

    const { video, transcript: transcriptData } = manualToVideoAndTranscript({
        title,
        url,
        transcript,
        views,
        description,
    });

    // Insert video
    const { data: insertedVideo, error: videoError } = await supabase
        .from('videos')
        .insert({
            creator_id: creator.id,
            source: 'manual',
            external_video_id: video.externalVideoId,
            url: video.url || null,
            title: video.title,
            description: video.description,
            views: video.views,
            likes: video.likes,
            comments_count: video.comments,
            shares: video.shares,
            duration: video.duration,
            thumbnail_url: video.thumbnailUrl,
            created_at_source: video.createdAt,
        })
        .select('id')
        .single();

    if (videoError || !insertedVideo) {
        return NextResponse.json({ error: 'Failed to add video' }, { status: 500 });
    }

    // Insert transcript
    const { error: transcriptError } = await supabase
        .from('video_transcripts')
        .insert({
            video_id: insertedVideo.id,
            transcript_text: transcriptData.transcriptText,
            language: transcriptData.language,
            source: 'manual',
        });

    if (transcriptError) {
        console.error('Transcript insert error:', transcriptError);
    }

    return NextResponse.json({
        videoId: insertedVideo.id,
        message: 'Video added successfully',
    }, { status: 201 });
}
