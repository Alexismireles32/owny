import { z } from 'zod';
import { requestKimiStructuredObject } from '@/lib/ai/kimi-structured';
import type { ProductType } from '@/types/build-packet';

export interface TopicDiscoveryTranscriptRow {
    video_id: string;
    title: string | null;
    description: string | null;
    transcript_text: string | null;
    views: number | null;
}

export interface ProductTopicSuggestion {
    topic: string;
    videoCount: number;
    problem?: string;
    promise?: string;
    supportingVideoIds?: string[];
}

interface TopicBucket {
    phrase: string;
    videoIds: Set<string>;
    examples: string[];
    titles: Set<string>;
    score: number;
}

const TOPIC_STOPWORDS = new Set([
    'about', 'after', 'also', 'and', 'are', 'around', 'because', 'been', 'being', 'build', 'challenge',
    'checklist', 'content', 'course', 'create', 'from', 'guide', 'have', 'help', 'into', 'just', 'lesson',
    'like', 'make', 'mini', 'more', 'only', 'pdf', 'real', 'that', 'their', 'there', 'these', 'this',
    'through', 'tips', 'toolkit', 'video', 'videos', 'what', 'when', 'with', 'your',
]);

const GENERIC_LABELS = new Set([
    'be here now',
    'consciousness',
    'general',
    'mindfulness',
    'motivation',
    'philosophy',
    'self improvement',
    'spirituality',
    'wellbeing',
]);

const HIGH_SIGNAL_TERMS = [
    'accept', 'aging', 'anxiety', 'attention', 'awake', 'boundaries', 'calm', 'change', 'daily',
    'death', 'ego', 'fear', 'focus', 'forgive', 'gracefully', 'grief', 'habit', 'heal', 'identity',
    'judgment', 'letting', 'love', 'mind', 'pain', 'peace', 'practice', 'presence', 'relationship',
    'resistance', 'routine', 'self', 'shame', 'silence', 'suffering', 'time', 'uncertainty',
];

const TopicSynthesisSchema = z.object({
    suggestions: z.array(z.object({
        topic: z.string().min(4),
        problem: z.string().default(''),
        promise: z.string().default(''),
        videoIds: z.array(z.string()).default([]),
    })).min(1).max(6),
});

function normalizeWhitespace(value: string | null | undefined, maxLen = 220): string {
    if (!value) return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildCreatorNoiseTokens(creator: { handle?: string | null; display_name?: string | null }): Set<string> {
    const source = `${creator.handle || ''} ${creator.display_name || ''}`;
    const tokens = normalizeToken(source)
        .split(/\s+/)
        .filter((token) => token.length >= 3);

    const output = new Set<string>(tokens);

    const compactHandle = normalizeToken(creator.handle || '').replace(/\s+/g, '');
    if (compactHandle.length >= 4) output.add(compactHandle);

    const compactName = normalizeToken(creator.display_name || '').replace(/\s+/g, '');
    if (compactName.length >= 4) output.add(compactName);

    return output;
}

function normalizeTopicPhrase(input: string, creatorNoise: Set<string>): string | null {
    const tokens = normalizeToken(input)
        .split(/\s+/)
        .filter((token) =>
            token.length >= 3
            && !/^\d+$/.test(token)
            && !TOPIC_STOPWORDS.has(token)
            && !creatorNoise.has(token)
        );

    if (tokens.length === 0) return null;
    const phrase = tokens.slice(0, 6).join(' ');
    if (GENERIC_LABELS.has(phrase)) return null;
    if (tokens.length === 1 && !HIGH_SIGNAL_TERMS.includes(tokens[0])) return null;
    return phrase;
}

function splitSentences(transcript: string): string[] {
    return transcript
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 32 && sentence.length <= 240);
}

function scoreSentence(sentence: string): number {
    const lower = sentence.toLowerCase();
    let score = 0;

    for (const term of HIGH_SIGNAL_TERMS) {
        if (lower.includes(term)) score += 1.6;
    }

    if (/\bhow to\b|\bwhen you\b|\bif you\b|\bthe way\b|\bpractice\b|\blearn\b|\bremember\b|\blet go\b/i.test(lower)) {
        score += 2.5;
    }
    if (/\byou\b|\byour\b|\bwe\b|\bour\b/i.test(lower)) {
        score += 1;
    }
    if (sentence.length >= 60 && sentence.length <= 180) {
        score += 1.2;
    }

    return score;
}

function selectTranscriptHighlights(transcript: string | null | undefined): string[] {
    const sentences = splitSentences(transcript || '');
    if (sentences.length === 0) return [];

    return [...sentences]
        .sort((a, b) => scoreSentence(b) - scoreSentence(a))
        .slice(0, 2);
}

function deriveCandidatePhrases(text: string, creatorNoise: Set<string>): string[] {
    const tokens = normalizeToken(text)
        .split(/\s+/)
        .filter((token) =>
            token.length >= 3
            && !/^\d+$/.test(token)
            && !TOPIC_STOPWORDS.has(token)
            && !creatorNoise.has(token)
        );

    const phrases: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const unigram = normalizeTopicPhrase(tokens[i], creatorNoise);
        if (unigram) phrases.push(unigram);

        if (i + 1 < tokens.length) {
            const bigram = normalizeTopicPhrase(`${tokens[i]} ${tokens[i + 1]}`, creatorNoise);
            if (bigram) phrases.push(bigram);
        }

        if (i + 2 < tokens.length) {
            const trigram = normalizeTopicPhrase(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`, creatorNoise);
            if (trigram) phrases.push(trigram);
        }
    }

    return phrases;
}

function pushBucket(
    buckets: Map<string, TopicBucket>,
    phrase: string | null,
    row: TopicDiscoveryTranscriptRow,
    title: string,
    evidence: string,
    weight: number
) {
    if (!phrase) return;
    const existing = buckets.get(phrase) || {
        phrase,
        videoIds: new Set<string>(),
        examples: [],
        titles: new Set<string>(),
        score: 0,
    };

    existing.videoIds.add(row.video_id);
    existing.titles.add(title);
    existing.score += weight + ((row.views || 0) > 0 ? Math.min(2, Math.log10((row.views || 0) + 1) * 0.18) : 0);
    if (evidence && existing.examples.length < 3 && !existing.examples.includes(evidence)) {
        existing.examples.push(evidence);
    }
    buckets.set(phrase, existing);
}

function buildClusterSummary(input: {
    transcripts: TopicDiscoveryTranscriptRow[];
    creator: { handle?: string | null; display_name?: string | null };
}) {
    const creatorNoise = buildCreatorNoiseTokens(input.creator);
    const buckets = new Map<string, TopicBucket>();

    for (const row of input.transcripts) {
        const title = normalizeWhitespace(row.title, 120) || normalizeWhitespace(row.description, 120) || 'Untitled video';
        const highlights = selectTranscriptHighlights(row.transcript_text);
        const evidence = highlights[0] || normalizeWhitespace(row.description, 160) || title;
        const sourceText = [title, row.description || '', ...highlights].join(' ');
        const phrases = deriveCandidatePhrases(sourceText, creatorNoise);

        for (const phrase of phrases.slice(0, 10)) {
            const wordCount = phrase.split(' ').length;
            const weight = wordCount >= 3 ? 2.2 : wordCount === 2 ? 1.6 : 0.8;
            pushBucket(buckets, phrase, row, title, evidence, weight);
        }
    }

    const minimumSupport = input.transcripts.length <= 4 ? 1 : 2;
    return [...buckets.values()]
        .filter((bucket) => bucket.videoIds.size >= minimumSupport)
        .sort((a, b) => {
            if (b.videoIds.size !== a.videoIds.size) return b.videoIds.size - a.videoIds.size;
            return b.score - a.score;
        })
        .slice(0, 18);
}

export async function synthesizeTranscriptDrivenTopics(input: {
    creator: { handle?: string | null; display_name?: string | null };
    productType: ProductType;
    transcripts: TopicDiscoveryTranscriptRow[];
}): Promise<ProductTopicSuggestion[]> {
    if (input.transcripts.length === 0) return [];

    const clusters = buildClusterSummary({
        transcripts: input.transcripts,
        creator: input.creator,
    });

    if (clusters.length === 0) return [];

    const response = await requestKimiStructuredObject({
        systemPrompt: `You are the Owny Topic Strategist.
Your job is to turn transcript-derived creator themes into product-worthy topic options.
Return only a JSON object.

Rules:
- Base suggestions strictly on the supplied transcript-derived evidence.
- Suggest concrete, buyer-relevant topic angles that solve a problem or create a transformation.
- Avoid broad labels like "spirituality", "mindset", "motivation", "philosophy", or creator-brand phrases unless they are tied to a concrete problem/outcome.
- The topic itself should sound like something a customer would choose, not like an internal content bucket.
- Prefer outcome language such as "how to", "a guide to", or a clear transformation angle when supported by the evidence.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creator.display_name || input.creator.handle || 'Creator'}
TOTAL VIDEOS ANALYZED: ${input.transcripts.length}

TRANSCRIPT-DERIVED CLUSTERS FROM THE FULL LIBRARY:
${clusters.map((cluster, index) => `CLUSTER ${index + 1}
label: ${cluster.phrase}
supporting videos: ${cluster.videoIds.size}
representative titles: ${[...cluster.titles].slice(0, 3).join(' | ')}
evidence: ${cluster.examples.join(' | ')}
videoIds: ${[...cluster.videoIds].slice(0, 6).join(', ')}`).join('\n\n')}

Return a JSON object:
{
  "suggestions": [
    {
      "topic": "string",
      "problem": "string",
      "promise": "string",
      "videoIds": ["video-id"]
    }
  ]
}

Return 3-6 topic suggestions. Each topic should be concise, specific, and product-worthy.`,
        schema: TopicSynthesisSchema,
        maxTokens: 1600,
        thinking: 'enabled',
    });

    return response.suggestions.map((row) => ({
        topic: row.topic.trim(),
        problem: row.problem.trim(),
        promise: row.promise.trim(),
        supportingVideoIds: row.videoIds,
        videoCount: row.videoIds.length,
    }));
}
