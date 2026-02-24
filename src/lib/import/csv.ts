// src/lib/import/csv.ts
// CSV upload adapter — parses CSV with columns: title, url, transcript, views, created_at

import type { VideoMeta, TranscriptResult } from '@/types/import';

export interface CSVRow {
    title?: string;
    url?: string;
    transcript?: string;
    views?: string;
    created_at?: string;
    description?: string;
    likes?: string;
    duration?: string;
}

/**
 * Parse CSV text into rows. Expects headers in first row.
 * Supports both comma and tab-delimited.
 */
export function parseCSV(text: string): CSVRow[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

    return lines.slice(1).map((line) => {
        const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
            if (values[i] !== undefined) row[h] = values[i];
        });
        return row as CSVRow;
    }).filter((row) => row.url || row.transcript || row.title); // skip fully empty rows
}

/**
 * Convert parsed CSV rows to VideoMeta + TranscriptResult pairs
 */
export function csvToVideosAndTranscripts(rows: CSVRow[]): {
    videos: VideoMeta[];
    transcripts: TranscriptResult[];
} {
    const videos: VideoMeta[] = [];
    const transcripts: TranscriptResult[] = [];

    rows.forEach((row, index) => {
        const externalId = `csv-${index}-${Date.now()}`;

        videos.push({
            externalVideoId: externalId,
            url: row.url || '',
            title: row.title || null,
            description: row.description || null,
            views: row.views ? parseInt(row.views, 10) || null : null,
            likes: row.likes ? parseInt(row.likes, 10) || null : null,
            comments: null,
            shares: null,
            duration: row.duration ? parseInt(row.duration, 10) || null : null,
            createdAt: row.created_at || null,
            thumbnailUrl: null,
        });

        if (row.transcript?.trim()) {
            transcripts.push({
                videoExternalId: externalId,
                transcriptText: row.transcript.trim(),
                language: 'en',
                source: 'manual' as 'caption', // CSV uploads treated as manual
            });
        }
    });

    return { videos, transcripts };
}
