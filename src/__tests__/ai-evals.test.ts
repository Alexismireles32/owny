import { describe, expect, it, vi } from 'vitest';
import { gradeRetrievalSelection, gradeTopicSuggestionSet } from '@/lib/ai/eval-harness';
import { runIterativeRetrieval } from '@/lib/ai/iterative-retrieval';
import type { SearchResult } from '@/lib/indexing/search';

function makeCandidate(videoId: string, title: string, score: number): SearchResult {
    return {
        videoId,
        title,
        clipCard: {
            topicTags: [title.toLowerCase()],
            keySteps: [],
        },
        score,
        source: 'vector',
    };
}

describe('Owny AI eval harness', () => {
    it('passes transcript-topic suggestions that are specific and problem-based', () => {
        const report = gradeTopicSuggestionSet({
            name: 'ram-dass-topic-suggestions',
            suggestions: [
                {
                    topic: 'How to age gracefully with presence',
                    videoCount: 3,
                    problem: 'Fear and resistance around aging.',
                    promise: 'Meet aging with softness and steadiness.',
                },
                {
                    topic: 'Letting go of control in uncertain times',
                    videoCount: 4,
                    problem: 'Life feels unstable and mentally noisy.',
                    promise: 'Feel calmer and less reactive in uncertainty.',
                },
                {
                    topic: 'Practices for being here in daily life',
                    videoCount: 5,
                    problem: 'Daily life feels scattered and distracted.',
                    promise: 'Return to presence in ordinary moments.',
                },
            ],
            requiredKeywords: ['aging', 'uncertain', 'presence'],
        });

        expect(report.passed).toBe(true);
        expect(report.passedChecks).toBe(report.totalChecks);
    });

    it('fails generic topic buckets', () => {
        const report = gradeTopicSuggestionSet({
            name: 'generic-topic-buckets',
            suggestions: [
                { topic: 'Spirituality', videoCount: 9 },
                { topic: 'Motivation', videoCount: 7 },
                { topic: 'Mindset', videoCount: 6 },
            ],
        });

        expect(report.passed).toBe(false);
        expect(report.checks.find((check) => check.label === 'avoid-generic-labels')?.passed).toBe(false);
    });
});

describe('Iterative retrieval refinement', () => {
    it('uses coverage gaps to refine retrieval and recover missing evidence', async () => {
        const baseResults = [
            makeCandidate('presence-1', 'Being here now in daily life', 0.92),
            makeCandidate('presence-2', 'The game of presence', 0.88),
            makeCandidate('presence-3', 'Remembering the present moment', 0.84),
        ];
        const agingResults = [
            makeCandidate('aging-1', 'How to age gracefully', 0.96),
            makeCandidate('aging-2', 'Meeting aging without fear', 0.93),
            makeCandidate('aging-3', 'Aging and letting go', 0.9),
            makeCandidate('aging-4', 'Presence in later life', 0.87),
            makeCandidate('aging-5', 'Fear of death and aging', 0.85),
        ];

        const search = vi.fn(async (query: string) => {
            if (query.toLowerCase().includes('aging gracefully')) {
                return agingResults;
            }
            return baseResults;
        });

        const rerank = vi
            .fn()
            .mockResolvedValueOnce({
                selectedVideos: [
                    { videoId: 'presence-1', reason: 'General presence context.', relevanceScore: 0.8 },
                    { videoId: 'presence-2', reason: 'General presence context.', relevanceScore: 0.76 },
                    { videoId: 'aging-1', reason: 'Known support video from topic graph.', relevanceScore: 0.72 },
                ],
                coverageGaps: ['No content about aging gracefully found'],
                confidence: 'medium' as const,
            })
            .mockResolvedValueOnce({
                selectedVideos: [
                    { videoId: 'aging-1', reason: 'Directly covers aging gracefully.', relevanceScore: 0.98 },
                    { videoId: 'aging-2', reason: 'Covers fear around aging.', relevanceScore: 0.94 },
                    { videoId: 'aging-3', reason: 'Covers letting go in later life.', relevanceScore: 0.9 },
                    { videoId: 'aging-4', reason: 'Expands the transformation angle.', relevanceScore: 0.88 },
                    { videoId: 'aging-5', reason: 'Supports the emotional struggle.', relevanceScore: 0.84 },
                    { videoId: 'presence-1', reason: 'Adds presence practice.', relevanceScore: 0.8 },
                ],
                coverageGaps: [],
                confidence: 'high' as const,
            });

        const result = await runIterativeRetrieval({
            initialQuery: 'Create a PDF guide',
            productType: 'pdf_guide',
            topicSignal: {
                topic: 'How to age gracefully with presence',
                problem: 'Fear and resistance around aging',
                promise: 'Meet aging with softness and steadiness',
                supportingVideoIds: ['aging-1'],
            },
            initialCandidates: baseResults,
            seedCandidates: [makeCandidate('aging-1', 'How to age gracefully', 1.5)],
            search,
            rerank,
            targetSelectedVideos: 6,
        });

        expect(result.iterations).toHaveLength(2);
        expect(result.executedQueries.some((query) => query.toLowerCase().includes('aging gracefully'))).toBe(true);
        expect(result.reranked.coverageGaps).toHaveLength(0);

        const evalReport = gradeRetrievalSelection({
            name: 'aging-gracefully-retrieval',
            selectedVideoIds: result.reranked.selectedVideos.map((video) => video.videoId),
            expectedVideoIds: ['aging-1', 'aging-2'],
            executedQueries: result.executedQueries,
            expectedQueryFragments: ['aging gracefully'],
            coverageGaps: result.reranked.coverageGaps,
            minSelectedVideos: 6,
        });

        expect(evalReport.passed).toBe(true);
    });
});
