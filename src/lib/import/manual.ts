// src/lib/import/manual.ts
// Manual paste adapter — creator adds one video at a time

import type { VideoMeta, TranscriptResult } from '@/types/import';

export interface ManualVideoInput {
    title?: string;
    url?: string;
    transcript: string;
    views?: number;
    description?: string;
}

/**
 * Convert a manual video input to VideoMeta + TranscriptResult
 */
export function manualToVideoAndTranscript(input: ManualVideoInput): {
    video: VideoMeta;
    transcript: TranscriptResult;
} {
    const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const video: VideoMeta = {
        externalVideoId: externalId,
        url: input.url || '',
        title: input.title || null,
        description: input.description || null,
        views: input.views ?? null,
        likes: null,
        comments: null,
        shares: null,
        duration: null,
        createdAt: new Date().toISOString(),
        thumbnailUrl: null,
    };

    const transcript: TranscriptResult = {
        videoExternalId: externalId,
        transcriptText: input.transcript.trim(),
        language: 'en',
        source: 'caption', // manual entry
    };

    return { video, transcript };
}
