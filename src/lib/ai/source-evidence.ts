import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseLike = Pick<SupabaseClient, 'from'>;

interface VideoRow {
    id: string;
    title: string | null;
    views: number | null;
}

interface ClipCardRow {
    video_id: string;
    card_json: Record<string, unknown> | null;
}

interface TranscriptRow {
    video_id: string;
    transcript_text: string | null;
}

export interface SourceEvidenceBundle {
    byVideoId: Record<string, string>;
    combinedContext: string;
}

function readString(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
}

function readStringArray(value: unknown, limit = 5): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => readString(entry))
        .filter(Boolean)
        .slice(0, limit);
}

function trimTranscript(text: string | null | undefined, maxChars = 900): string {
    return readString(text).slice(0, maxChars);
}

function buildEvidenceBlock(input: {
    videoId: string;
    title: string | null;
    views: number | null;
    clipCard: Record<string, unknown> | null;
    transcript: string | null;
}): string {
    const clipCard = input.clipCard || {};
    const topicTags = readStringArray(clipCard.topicTags || clipCard.topics || clipCard.tags, 6);
    const keySteps = readStringArray(clipCard.keySteps || clipCard.keyBullets || clipCard.key_points, 6);

    const lines = [
        `VIDEO ID: ${input.videoId}`,
        `TITLE: ${readString(input.title, 'Unknown video')}`,
        `VIEWS: ${typeof input.views === 'number' ? input.views : 'n/a'}`,
    ];

    if (topicTags.length > 0) {
        lines.push(`TOPICS: ${topicTags.join(', ')}`);
    }
    if (keySteps.length > 0) {
        lines.push(`KEY STEPS: ${keySteps.join(' | ')}`);
    }

    const whoItsFor = readString(clipCard.whoItsFor);
    if (whoItsFor) {
        lines.push(`WHO IT'S FOR: ${whoItsFor}`);
    }

    const outcome = readString(clipCard.outcome);
    if (outcome) {
        lines.push(`OUTCOME: ${outcome}`);
    }

    const bestHook = readString(clipCard.bestHook);
    if (bestHook) {
        lines.push(`HOOK: ${bestHook}`);
    }

    const transcriptExcerpt = trimTranscript(input.transcript);
    if (transcriptExcerpt) {
        lines.push(`TRANSCRIPT EVIDENCE: ${transcriptExcerpt}`);
    }

    return lines.join('\n');
}

export async function loadSourceEvidenceBundle(
    supabase: SupabaseLike,
    sourceVideoIds: string[]
): Promise<SourceEvidenceBundle> {
    const uniqueVideoIds = Array.from(new Set(sourceVideoIds.filter((videoId) => typeof videoId === 'string' && videoId.length > 0)));

    if (uniqueVideoIds.length === 0) {
        return {
            byVideoId: {},
            combinedContext: '',
        };
    }

    const [
        { data: videos },
        { data: clipCards },
        { data: transcripts },
    ] = await Promise.all([
        supabase
            .from('videos')
            .select('id, title, views')
            .in('id', uniqueVideoIds),
        supabase
            .from('clip_cards')
            .select('video_id, card_json')
            .in('video_id', uniqueVideoIds),
        supabase
            .from('video_transcripts')
            .select('video_id, transcript_text')
            .in('video_id', uniqueVideoIds),
    ]);

    const videoMap = new Map(((videos || []) as VideoRow[]).map((row) => [row.id, row]));
    const clipCardMap = new Map(((clipCards || []) as ClipCardRow[]).map((row) => [row.video_id, row.card_json]));
    const transcriptMap = new Map(((transcripts || []) as TranscriptRow[]).map((row) => [row.video_id, row.transcript_text]));

    const byVideoId = Object.fromEntries(
        uniqueVideoIds.map((videoId) => {
            const video = videoMap.get(videoId);
            return [videoId, buildEvidenceBlock({
                videoId,
                title: video?.title || null,
                views: video?.views || null,
                clipCard: clipCardMap.get(videoId) || null,
                transcript: transcriptMap.get(videoId) || null,
            })];
        })
    );

    return {
        byVideoId,
        combinedContext: uniqueVideoIds
            .map((videoId) => byVideoId[videoId])
            .filter(Boolean)
            .join('\n\n---\n\n')
            .slice(0, 9000),
    };
}
