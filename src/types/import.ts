// src/types/import.ts
// PRD §3.4 — Provider adapter interface for video ingestion

export interface VideoMeta {
    externalVideoId: string;
    url: string;
    title: string | null;
    description: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    duration: number | null; // seconds
    createdAt: string | null; // ISO date
    thumbnailUrl: string | null;
}

export interface ProfileMeta {
    handle: string;
    displayName: string;
    bio: string | null;
    followers: number | null;
    following: number | null;
    likes: number | null;
    avatarUrl: string | null;
}

export interface TranscriptResult {
    videoExternalId: string;
    transcriptText: string;
    language: string;
    source: 'caption' | 'ai_fallback';
}

export interface ImportProvider {
    getProfile(handle: string): Promise<ProfileMeta>;
    listVideos(
        handle: string,
        options: {
            maxVideos?: number;
            sortBy?: 'latest' | 'popular';
            cursor?: string;
        }
    ): AsyncGenerator<VideoMeta[], void, unknown>;
    getTranscript(
        videoUrl: string,
        options: {
            language?: string;
            useAiFallback?: boolean;
        }
    ): Promise<TranscriptResult | null>;
}
