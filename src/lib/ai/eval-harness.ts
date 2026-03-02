import type { ProductTopicSuggestion } from '@/lib/ai/topic-discovery';

export interface EvalCheck {
    label: string;
    passed: boolean;
    detail: string;
}

export interface EvalReport {
    name: string;
    passed: boolean;
    passedChecks: number;
    totalChecks: number;
    checks: EvalCheck[];
}

function buildReport(name: string, checks: EvalCheck[]): EvalReport {
    const passedChecks = checks.filter((check) => check.passed).length;
    return {
        name,
        passed: passedChecks === checks.length,
        passedChecks,
        totalChecks: checks.length,
        checks,
    };
}

function normalize(value: string | null | undefined): string {
    return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(haystack: string, needles: string[]): boolean {
    return needles.some((needle) => haystack.includes(normalize(needle)));
}

const GENERIC_TOPIC_TERMS = [
    'spirituality',
    'motivation',
    'philosophy',
    'mindset',
    'general',
    'content',
];

export function gradeTopicSuggestionSet(input: {
    name: string;
    suggestions: ProductTopicSuggestion[];
    minSuggestions?: number;
    requiredKeywords?: string[];
    bannedKeywords?: string[];
}): EvalReport {
    const suggestions = input.suggestions || [];
    const bannedKeywords = [...GENERIC_TOPIC_TERMS, ...(input.bannedKeywords || [])].map(normalize);
    const combinedText = suggestions
        .map((suggestion) => `${suggestion.topic} ${suggestion.problem || ''} ${suggestion.promise || ''}`)
        .join(' ')
        .toLowerCase();

    const checks: EvalCheck[] = [
        {
            label: 'minimum-suggestions',
            passed: suggestions.length >= (input.minSuggestions ?? 3),
            detail: `Expected at least ${input.minSuggestions ?? 3} topic suggestions, received ${suggestions.length}.`,
        },
        {
            label: 'problem-or-promise-framing',
            passed: suggestions.every((suggestion) => Boolean(normalize(suggestion.problem) || normalize(suggestion.promise))),
            detail: 'Each topic suggestion should include a problem or promise statement.',
        },
        {
            label: 'avoid-generic-labels',
            passed: suggestions.every((suggestion) => {
                const topic = normalize(suggestion.topic);
                return !bannedKeywords.some((term) => topic === term);
            }),
            detail: 'Topic suggestions should avoid broad generic labels.',
        },
        {
            label: 'specific-topic-language',
            passed: suggestions.every((suggestion) => normalize(suggestion.topic).split(' ').length >= 2),
            detail: 'Topics should be at least two words so they read like product angles, not buckets.',
        },
    ];

    if (input.requiredKeywords && input.requiredKeywords.length > 0) {
        checks.push({
            label: 'required-keywords-covered',
            passed: includesAny(combinedText, input.requiredKeywords),
            detail: `Expected at least one of these keywords to appear: ${input.requiredKeywords.join(', ')}.`,
        });
    }

    return buildReport(input.name, checks);
}

export function gradeRetrievalSelection(input: {
    name: string;
    selectedVideoIds: string[];
    expectedVideoIds?: string[];
    forbiddenVideoIds?: string[];
    executedQueries?: string[];
    expectedQueryFragments?: string[];
    coverageGaps?: string[];
    minSelectedVideos?: number;
}): EvalReport {
    const selectedSet = new Set(input.selectedVideoIds);
    const queryText = (input.executedQueries || []).join(' ').toLowerCase();

    const checks: EvalCheck[] = [
        {
            label: 'minimum-selected-videos',
            passed: input.selectedVideoIds.length >= (input.minSelectedVideos ?? 6),
            detail: `Expected at least ${input.minSelectedVideos ?? 6} selected videos, received ${input.selectedVideoIds.length}.`,
        },
        {
            label: 'no-coverage-gaps',
            passed: (input.coverageGaps || []).length === 0,
            detail: 'Retrieval should resolve coverage gaps before building when possible.',
        },
    ];

    if (input.expectedVideoIds && input.expectedVideoIds.length > 0) {
        checks.push({
            label: 'expected-videos-present',
            passed: input.expectedVideoIds.every((videoId) => selectedSet.has(videoId)),
            detail: `Expected these support videos to be selected: ${input.expectedVideoIds.join(', ')}.`,
        });
    }

    if (input.forbiddenVideoIds && input.forbiddenVideoIds.length > 0) {
        checks.push({
            label: 'forbidden-videos-excluded',
            passed: input.forbiddenVideoIds.every((videoId) => !selectedSet.has(videoId)),
            detail: `These videos should not be selected: ${input.forbiddenVideoIds.join(', ')}.`,
        });
    }

    if (input.expectedQueryFragments && input.expectedQueryFragments.length > 0) {
        checks.push({
            label: 'refinement-queries-used',
            passed: input.expectedQueryFragments.every((fragment) => queryText.includes(normalize(fragment))),
            detail: `Expected refinement queries to include: ${input.expectedQueryFragments.join(', ')}.`,
        });
    }

    return buildReport(input.name, checks);
}
