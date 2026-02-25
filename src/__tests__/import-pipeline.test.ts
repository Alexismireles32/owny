// Test: Import pipeline adapters
// PRD §3 + §8.3: ImportProvider adapter validation

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the ImportProvider interface ---
interface VideoMeta {
    videoId: string;
    title: string;
    description: string;
    views: number;
    likes: number;
    publishedAt: string;
    url: string;
    thumbnailUrl: string;
    duration: number;
}

interface ProfileMeta {
    handle: string;
    displayName: string;
    avatarUrl: string;
    followerCount: number;
    videoCount: number;
    platform: string;
}

interface ImportProvider {
    getProfile(handle: string): Promise<ProfileMeta>;
    listVideos(handle: string, limit: number): Promise<VideoMeta[]>;
    getTranscript(videoId: string): Promise<string>;
}

// --- ScrapeCreators adapter test double ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockScrapeCreatorsProvider(mockFetch: any): ImportProvider {
    const BASE_URL = 'https://api.scrapecreators.com/v2';

    return {
        async getProfile(handle: string): Promise<ProfileMeta> {
            const res = await mockFetch(`${BASE_URL}/tiktok/user/info?username=${handle}`);
            const data = await res.json() as { user?: { uniqueId?: string; nickname?: string; avatarLarger?: string }; stats?: { followerCount?: number; videoCount?: number } };
            return {
                handle: data.user?.uniqueId || handle,
                displayName: data.user?.nickname || handle,
                avatarUrl: data.user?.avatarLarger || '',
                followerCount: data.stats?.followerCount || 0,
                videoCount: data.stats?.videoCount || 0,
                platform: 'tiktok',
            };
        },

        async listVideos(handle: string, limit: number): Promise<VideoMeta[]> {
            const res = await mockFetch(`${BASE_URL}/tiktok/user/posts?username=${handle}&count=${limit}`);
            const data = await res.json() as { videos?: Array<{ id: string; desc: string; playCount: number; diggCount: number; createTime: number; cover: string; duration: number }> };
            return (data.videos || []).map((v) => ({
                videoId: v.id,
                title: v.desc,
                description: v.desc,
                views: v.playCount || 0,
                likes: v.diggCount || 0,
                publishedAt: new Date((v.createTime || 0) * 1000).toISOString(),
                url: `https://tiktok.com/@${handle}/video/${v.id}`,
                thumbnailUrl: v.cover || '',
                duration: v.duration || 0,
            }));
        },

        async getTranscript(videoId: string): Promise<string> {
            const res = await mockFetch(`${BASE_URL}/tiktok/video/transcript?video_id=${videoId}`);
            const data = await res.json() as { transcript?: string };
            return data.transcript || '';
        },
    };
}

// --- CSV adapter test ---
function parseCSV(csvText: string): VideoMeta[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const titleIdx = headers.indexOf('title');
    const urlIdx = headers.indexOf('url');
    const viewsIdx = headers.indexOf('views');

    return lines.slice(1).map((line, i) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
            videoId: `csv_${i}`,
            title: titleIdx >= 0 ? cols[titleIdx] : `Video ${i + 1}`,
            description: titleIdx >= 0 ? cols[titleIdx] : '',
            views: viewsIdx >= 0 ? parseInt(cols[viewsIdx]) || 0 : 0,
            likes: 0,
            publishedAt: new Date().toISOString(),
            url: urlIdx >= 0 ? cols[urlIdx] : '',
            thumbnailUrl: '',
            duration: 0,
        };
    });
}

// --- Manual paste adapter test ---
function parseManual(urls: string[]): VideoMeta[] {
    return urls
        .filter((url) => url.trim().length > 0)
        .map((url, i) => {
            const videoIdMatch = url.match(/video\/(\d+)/);
            return {
                videoId: videoIdMatch?.[1] || `manual_${i}`,
                title: `Video ${i + 1}`,
                description: '',
                views: 0,
                likes: 0,
                publishedAt: new Date().toISOString(),
                url: url.trim(),
                thumbnailUrl: '',
                duration: 0,
            };
        });
}

describe('Import Pipeline', () => {
    describe('ScrapeCreators Adapter', () => {
        let mockFetch: ReturnType<typeof vi.fn>;
        let provider: ImportProvider;

        beforeEach(() => {
            mockFetch = vi.fn();
            provider = createMockScrapeCreatorsProvider(mockFetch);
        });

        it('should map profile response correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    user: { uniqueId: 'testcreator', nickname: 'Test Creator', avatarLarger: 'https://example.com/avatar.jpg' },
                    stats: { followerCount: 50000, videoCount: 120 },
                }),
            });

            const profile = await provider.getProfile('testcreator');

            expect(profile.handle).toBe('testcreator');
            expect(profile.displayName).toBe('Test Creator');
            expect(profile.followerCount).toBe(50000);
            expect(profile.videoCount).toBe(120);
            expect(profile.platform).toBe('tiktok');
        });

        it('should map video list response correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    videos: [
                        { id: '123', desc: 'Video 1', playCount: 1000, diggCount: 50, createTime: 1700000000, cover: 'img1.jpg', duration: 30 },
                        { id: '456', desc: 'Video 2', playCount: 2000, diggCount: 100, createTime: 1700100000, cover: 'img2.jpg', duration: 45 },
                    ],
                }),
            });

            const videos = await provider.listVideos('testcreator', 10);

            expect(videos).toHaveLength(2);
            expect(videos[0].videoId).toBe('123');
            expect(videos[0].title).toBe('Video 1');
            expect(videos[0].views).toBe(1000);
            expect(videos[1].url).toContain('testcreator');
        });

        it('should handle empty video list', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ videos: [] }),
            });

            const videos = await provider.listVideos('emptyuser', 10);
            expect(videos).toHaveLength(0);
        });

        it('should return transcript text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ transcript: 'Hello this is my video about cooking...' }),
            });

            const transcript = await provider.getTranscript('123');
            expect(transcript).toBe('Hello this is my video about cooking...');
        });

        it('should handle missing transcript gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const transcript = await provider.getTranscript('999');
            expect(transcript).toBe('');
        });
    });

    describe('CSV Adapter', () => {
        it('should parse simple CSV with headers', () => {
            const csv = `title,url,views
My First Video,https://tiktok.com/video/1,5000
Second Video,https://tiktok.com/video/2,3000`;

            const videos = parseCSV(csv);

            expect(videos).toHaveLength(2);
            expect(videos[0].title).toBe('My First Video');
            expect(videos[0].views).toBe(5000);
            expect(videos[1].url).toBe('https://tiktok.com/video/2');
        });

        it('should handle CSV with only headers', () => {
            const csv = 'title,url,views';
            const videos = parseCSV(csv);
            expect(videos).toHaveLength(0);
        });

        it('should handle empty CSV', () => {
            const videos = parseCSV('');
            expect(videos).toHaveLength(0);
        });

        it('should assign default values for missing columns', () => {
            const csv = `title
My Video`;
            const videos = parseCSV(csv);

            expect(videos).toHaveLength(1);
            expect(videos[0].title).toBe('My Video');
            expect(videos[0].views).toBe(0);
            expect(videos[0].url).toBe('');
        });
    });

    describe('Manual Paste Adapter', () => {
        it('should parse URLs and extract video IDs', () => {
            const urls = [
                'https://tiktok.com/@user/video/1234567890',
                'https://tiktok.com/@user/video/9876543210',
            ];

            const videos = parseManual(urls);

            expect(videos).toHaveLength(2);
            expect(videos[0].videoId).toBe('1234567890');
            expect(videos[1].videoId).toBe('9876543210');
        });

        it('should filter out empty URLs', () => {
            const urls = ['', 'https://tiktok.com/@user/video/123', '', '  '];
            const videos = parseManual(urls);
            expect(videos).toHaveLength(1);
        });

        it('should handle URLs without video ID pattern', () => {
            const urls = ['https://example.com/other-format'];
            const videos = parseManual(urls);

            expect(videos).toHaveLength(1);
            expect(videos[0].videoId).toBe('manual_0');
        });
    });
});
