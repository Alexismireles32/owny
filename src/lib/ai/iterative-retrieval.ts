import type { SearchResult } from '@/lib/indexing/search';
import type { RerankResult } from '@/lib/ai/reranker';

export interface TopicSignal {
    topic: string;
    problem?: string;
    promise?: string;
    supportingVideoIds?: string[];
}

export interface IterativeRetrievalIteration {
    cycle: number;
    query: string;
    candidateCount: number;
    selectedCount: number;
    coverageGaps: string[];
    confidence: 'high' | 'medium' | 'low';
}

export interface IterativeRetrievalResult {
    candidatePool: SearchResult[];
    reranked: RerankResult;
    iterations: IterativeRetrievalIteration[];
    executedQueries: string[];
    boostedVideoIds: string[];
}

interface IterativeRetrievalInput {
    initialQuery: string;
    productType: string;
    topicSignal?: TopicSignal;
    initialCandidates?: SearchResult[];
    seedCandidates?: SearchResult[];
    searchLimit?: number;
    maxCycles?: number;
    targetSelectedVideos?: number;
    search: (query: string, options?: { limit?: number }) => Promise<SearchResult[]>;
    rerank: (
        candidates: Array<{ videoId: string; title: string | null; clipCard: Record<string, unknown> | null }>,
        productRequest: string,
        productType: string,
        options?: { preferredVideoIds?: string[] }
    ) => Promise<RerankResult>;
}

const GAP_PREFIXES = [
    /^no content about\s+/i,
    /^no content on\s+/i,
    /^missing\s+/i,
    /^need more content about\s+/i,
    /^need more evidence for\s+/i,
    /^not enough content about\s+/i,
    /^limited evidence for\s+/i,
];

function normalizeWhitespace(value: string | null | undefined, maxLen = 160): string {
    if (!value) return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeQueryKey(value: string): string {
    return normalizeWhitespace(value).toLowerCase();
}

function addQuery(queries: string[], seen: Set<string>, value?: string | null) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return;
    const key = normalizeQueryKey(normalized);
    if (!key || seen.has(key)) return;
    seen.add(key);
    queries.push(normalized);
}

function deriveCoverageGapQuery(gap: string): string | null {
    let normalized = normalizeWhitespace(gap, 180);
    if (!normalized) return null;

    for (const prefix of GAP_PREFIXES) {
        normalized = normalized.replace(prefix, '');
    }

    normalized = normalized
        .replace(/\bfound\b/gi, '')
        .replace(/\bdetected\b/gi, '')
        .replace(/\bavailable\b/gi, '')
        .replace(/[.:;]+$/g, '')
        .trim();

    if (normalized.length < 4) return null;
    return normalized;
}

function withSeedBoost(results: SearchResult[], preferredVideoIds: Set<string>): SearchResult[] {
    return results.map((result) => ({
        ...result,
        score: result.score + (preferredVideoIds.has(result.videoId) ? 0.35 : 0),
    }));
}

function mergeCandidates(existing: Map<string, SearchResult>, incoming: SearchResult[]) {
    for (const result of incoming) {
        const current = existing.get(result.videoId);
        if (!current) {
            existing.set(result.videoId, result);
            continue;
        }

        existing.set(result.videoId, {
            ...current,
            title: current.title || result.title,
            clipCard: current.clipCard || result.clipCard,
            score: Math.max(current.score, result.score),
            source: current.source === result.source ? current.source : 'both',
        });
    }
}

function buildInitialQueries(input: IterativeRetrievalInput): string[] {
    const queries: string[] = [];
    const seen = new Set<string>();

    addQuery(queries, seen, input.initialQuery);

    return queries;
}

function deriveRefinementQueries(input: {
    initialQuery: string;
    topicSignal?: TopicSignal;
    reranked: RerankResult;
    seenQueries: Set<string>;
}): string[] {
    const queries: string[] = [];

    for (const gap of input.reranked.coverageGaps.slice(0, 4)) {
        const gapQuery = deriveCoverageGapQuery(gap);
        if (!gapQuery) continue;

        addQuery(queries, input.seenQueries, gapQuery);
        addQuery(queries, input.seenQueries, `${input.initialQuery} ${gapQuery}`);
        if (input.topicSignal?.topic) {
            addQuery(queries, input.seenQueries, `${input.topicSignal.topic} ${gapQuery}`);
        }
    }

    addQuery(queries, input.seenQueries, input.topicSignal?.problem);
    addQuery(queries, input.seenQueries, input.topicSignal?.promise);

    return queries.slice(0, 4);
}

export async function runIterativeRetrieval(input: IterativeRetrievalInput): Promise<IterativeRetrievalResult> {
    const maxCycles = input.maxCycles ?? 3;
    const searchLimit = input.searchLimit ?? 100;
    const targetSelectedVideos = input.targetSelectedVideos ?? 8;
    const preferredVideoIds = Array.from(new Set(input.topicSignal?.supportingVideoIds || []));
    const preferredSet = new Set(preferredVideoIds);

    const candidateMap = new Map<string, SearchResult>();
    mergeCandidates(candidateMap, withSeedBoost(input.seedCandidates || [], preferredSet));
    mergeCandidates(candidateMap, withSeedBoost(input.initialCandidates || [], preferredSet));

    const pendingQueries = buildInitialQueries(input);
    const seenQueries = new Set(pendingQueries.map(normalizeQueryKey));
    const executedQueries: string[] = [];
    const iterations: IterativeRetrievalIteration[] = [];

    let lastReranked: RerankResult = {
        selectedVideos: [],
        coverageGaps: ['No candidate videos available for reranking.'],
        confidence: 'low',
    };

    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
        const query = pendingQueries.shift() || input.initialQuery;
        executedQueries.push(query);

        const searched = await input.search(query, { limit: searchLimit });
        mergeCandidates(candidateMap, withSeedBoost(searched, preferredSet));

        const rankedCandidates = [...candidateMap.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 80);

        lastReranked = await input.rerank(
            rankedCandidates.map((row) => ({
                videoId: row.videoId,
                title: row.title,
                clipCard: row.clipCard,
            })),
            input.initialQuery,
            input.productType,
            { preferredVideoIds },
        );

        iterations.push({
            cycle,
            query,
            candidateCount: rankedCandidates.length,
            selectedCount: lastReranked.selectedVideos.length,
            coverageGaps: lastReranked.coverageGaps,
            confidence: lastReranked.confidence,
        });

        const hasCoverage = lastReranked.coverageGaps.length === 0;
        const hasEnoughVideos = lastReranked.selectedVideos.length >= targetSelectedVideos;
        if (hasCoverage && hasEnoughVideos) {
            break;
        }

        const refinementQueries = deriveRefinementQueries({
            initialQuery: input.initialQuery,
            topicSignal: input.topicSignal,
            reranked: lastReranked,
            seenQueries,
        });

        if (refinementQueries.length === 0) {
            break;
        }

        pendingQueries.push(...refinementQueries);
    }

    return {
        candidatePool: [...candidateMap.values()].sort((a, b) => b.score - a.score),
        reranked: lastReranked,
        iterations,
        executedQueries,
        boostedVideoIds: preferredVideoIds,
    };
}
