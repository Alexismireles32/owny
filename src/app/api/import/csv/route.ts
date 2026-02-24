// POST /api/import/csv
// Upload CSV with video + transcript data

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { parseCSV, csvToVideosAndTranscripts } from '@/lib/import/csv';
import { createJob, updateJob } from '@/lib/import/jobs';

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

    // Accept either raw text body or FormData with a file
    let csvText: string;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'No CSV file provided' }, { status: 400 });
        }
        csvText = await file.text();
    } else {
        const body = await request.json();
        csvText = body.csv;
        if (!csvText) {
            return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
        }
    }

    // Parse CSV
    const rows = parseCSV(csvText);
    if (rows.length === 0) {
        return NextResponse.json({ error: 'CSV is empty or has no valid rows' }, { status: 400 });
    }

    // Create import job
    const job = await createJob(supabase, {
        type: 'csv_parse',
        creatorId: creator.id,
        payload: { rowCount: rows.length },
    });

    if (!job) {
        return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 });
    }

    try {
        await updateJob(supabase, job.id, { status: 'running' });

        const { videos, transcripts } = csvToVideosAndTranscripts(rows);

        // Insert videos
        let videosImported = 0;
        for (const video of videos) {
            const { data: insertedVideo, error: videoError } = await supabase
                .from('videos')
                .insert({
                    creator_id: creator.id,
                    source: 'csv',
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

            if (videoError) {
                console.error('CSV video insert error:', videoError);
                continue;
            }

            // Insert matching transcript
            const transcript = transcripts.find(
                (t) => t.videoExternalId === video.externalVideoId
            );
            if (transcript && insertedVideo) {
                await supabase.from('video_transcripts').insert({
                    video_id: insertedVideo.id,
                    transcript_text: transcript.transcriptText,
                    language: transcript.language,
                    source: 'manual',
                });
            }

            videosImported++;
        }

        await updateJob(supabase, job.id, {
            status: 'succeeded',
            result: {
                videosImported,
                transcriptsImported: transcripts.length,
                totalRows: rows.length,
            },
        });

        return NextResponse.json({
            jobId: job.id,
            videosImported,
            transcriptsImported: transcripts.length,
        });
    } catch (error) {
        await updateJob(supabase, job.id, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'CSV import failed',
        });
        return NextResponse.json({ error: 'CSV import failed' }, { status: 500 });
    }
}
