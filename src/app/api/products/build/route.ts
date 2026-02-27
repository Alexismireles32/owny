// POST /api/products/build — SSE streaming endpoint for live product generation
// Phase 1: Topic discovery (if vague) → Phase 2: Retrieve+Rerank → Phase 3: Plan → Phase 4: Stream HTML

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { hybridSearch } from '@/lib/indexing/search';
import { rerankCandidates } from '@/lib/ai/reranker';
import { postProcessHTML } from '@/lib/ai/router';
import { buildCreatorDNA, buildCreatorDNAContext } from '@/lib/ai/creator-dna';
import {
    buildDesignCanonContext,
    chooseCreativeDirection,
    getEvergreenDesignCanon,
} from '@/lib/ai/design-canon';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { runEvergreenCriticLoop } from '@/lib/ai/critic-loop';
import { log } from '@/lib/logger';
import type { ProductType } from '@/types/build-packet';

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── Product-type-specific CONTENT system prompts ───
// These generate the ACTUAL product, NOT a sales/landing page.

const PRODUCT_SYSTEM_PROMPTS: Record<string, string> = {
    pdf_guide: `You are a Digital Product Writer creating a REAL, COMPREHENSIVE PDF-style guide.

OUTPUT RULES:
- Output ONLY raw HTML. No markdown fences. Start with <!DOCTYPE html>.
- Include Tailwind CSS CDN, Inter font, and Alpine.js CDN.
- Include <meta name="viewport" content="width=device-width, initial-scale=1">.

THIS IS THE ACTUAL PRODUCT — NOT A LANDING PAGE. No hero sections, no CTAs, no pricing, no "Get Access" buttons.

STRUCTURE:
1. COVER PAGE — Title, subtitle, author name, a tasteful gradient cover design
2. TABLE OF CONTENTS — Clickable chapter titles with anchor links (href="#chapter-1" etc)
3. CHAPTERS — Each chapter wrapped in <section id="chapter-N"> with:
   - Chapter number + title (h2)
   - Introduction paragraph
   - Main content body (2-5 paragraphs per section)
   - Key takeaways / bullet points
   - Actionable tips or step-by-step instructions
   - Pro tips in highlighted callout boxes
   - "Back to Top ↑" link at the bottom of each chapter (href="#toc")
4. CONCLUSION — Summary of key learnings

NAVIGATION:
- Table of Contents must have id="toc" and each chapter link must be clickable anchor links
- Each chapter section must have a unique id (e.g., id="chapter-1", id="chapter-2")
- Add a sticky or fixed "↑" back-to-top button using Alpine.js

DESIGN:
- Clean, ebook-like layout. Max-width 720px centered. Generous padding.
- Chapter headings: text-3xl font-bold with left border accent (border-l-4 border-indigo-500)
- Body text: text-gray-700 leading-relaxed text-base
- Callout boxes: bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded-r-lg
- Tip boxes: bg-amber-50 border border-amber-200 p-4 rounded-xl with "💡 Pro Tip" header
- Step lists: Numbered with bg-indigo-500 text-white w-8 h-8 rounded-full step indicators
- Page breaks: Use border-t border-gray-200 my-12 between chapters
- Print-friendly: Avoid dark backgrounds so it prints cleanly

CONTENT RULES:
- Use the transcript content VERBATIM where possible, then enhance with connecting text.
- Every piece of advice, tip, and step must come from the creator's actual video content.
- Write in the creator's voice and tone.
- Each chapter should have 400-800 words of REAL content.
- Include specific, actionable information — not filler.`,

    mini_course: `You are a Digital Product Writer creating a REAL, MULTI-LESSON online course.

OUTPUT RULES:
- Output ONLY raw HTML. No markdown fences. Start with <!DOCTYPE html>.
- Include Tailwind CSS CDN, Inter font, and Alpine.js CDN.

THIS IS THE ACTUAL COURSE — NOT A LANDING PAGE. No hero sections, no CTAs, no pricing.

STRUCTURE:
1. COURSE HEADER — Course title, subtitle, module count, creator name
2. MODULE NAVIGATION — Sidebar or top nav (Alpine.js tabs/accordion) showing all modules:
   - Use Alpine.js x-data to track activeModule
   - Each module title clickable to expand/show that module's content
   - Show progress ("Module 1 of 5")
3. MODULE CONTENT — Each module wrapped in <section id="module-N"> with:
   - Module number badge + title (h2)
   - Module overview (1 paragraph)
   - LESSONS — Each lesson has:
     - Lesson title (h3)
     - Lesson text (2-4 paragraphs drawn from transcripts)
     - Key Takeaways in highlighted box
     - 🎯 Action Item (1-2 specific steps)
4. MODULE NAVIGATION — At the bottom of each module:
   - "← Previous Module" and "Next Module →" buttons
   - These navigate between sections using Alpine.js

NAVIGATION:
- Use Alpine.js x-data="{ activeModule: 1 }" pattern for module switching
- Only show the active module's content (x-show="activeModule === N")
- Module tabs/nav always visible so user can jump between modules
- Previous/Next buttons at the bottom of each module section

DESIGN:
- Dark sidebar or top tab bar for module navigation
- Active module indicator with accent color
- Module cards: bg-white rounded-2xl shadow-sm p-8
- Lesson headers: text-xl font-semibold with colored left border
- Takeaway boxes: bg-green-50 border border-green-200 p-4 rounded-xl
- Action items: bg-blue-50 border-l-4 border-blue-400 p-4
- Step chips: inline-flex h-6 w-6 rounded-full bg-indigo-500 text-white text-xs

CONTENT RULES:
- Draw all teaching content from the creator's transcripts
- Mix verbatim quotes with AI-generated connecting explanations
- Each lesson should have 300-600 words of real teaching content
- Include specific steps, not generic advice`,

    challenge_7day: `You are a Digital Product Writer creating a REAL 7-DAY CHALLENGE program.

OUTPUT RULES:
- Output ONLY raw HTML. No markdown fences. Start with <!DOCTYPE html>.
- Include Tailwind CSS CDN, Inter font, and Alpine.js CDN.

THIS IS THE ACTUAL CHALLENGE — NOT A LANDING PAGE. No hero sections, no CTAs, no pricing.

STRUCTURE:
1. CHALLENGE HEADER — Title, "7-Day Challenge by [Creator]", challenge goal
2. DAY NAVIGATOR — A horizontal day selector bar (Alpine.js tabs):
   - Use Alpine.js x-data="{ activeDay: 1 }" pattern
   - 7 clickable day badges/tabs showing Day 1-7
   - Active day highlighted with accent color
   - Each day's content shown/hidden via x-show
3. OVERVIEW — What participants will achieve, how it works (always visible)
4. DAY SECTIONS — Each day wrapped in <section id="day-N" x-show="activeDay === N"> with:
   - Day number + title (e.g., "Day 1: Foundation")
   - Daily objective (1 sentence)
   - TODAY'S LESSON (2-3 paragraphs of teaching content from transcripts)
   - TODAY'S TASKS (3-5 specific action items with descriptions)
   - Expected duration per task
   - 📝 Daily Reflection prompt (1-2 questions to journal/think about)
   - ✅ Daily Checklist (Alpine.js powered checkboxes)
   - "← Previous Day" and "Next Day →" navigation buttons
5. COMPLETION — Congratulations + next steps (shown when activeDay === 8 or always at bottom)

NAVIGATION:
- Day tabs always visible at top for jumping between days
- Previous/Next buttons at bottom of each day section
- Progress dots: filled for completed days (Alpine.js state)

DESIGN:
- Day cards: Each day is a distinct section with consistent layout
- Day badges: w-14 h-14 rounded-2xl bg-gradient-flex items-center justify-center text-2xl font-bold text-white
- Task items: flex gap-3 with numbered circles and descriptions
- Reflection boxes: bg-purple-50 border border-purple-200 p-5 rounded-xl
- Checklist: Alpine.js powered checkboxes that toggle
- Progress: Visual day tracker at the top (7 dots, filled for completed)

CONTENT RULES:
- Tasks must be SPECIFIC and ACTIONABLE (from the creator's actual advice)
- Each day's lesson draws from the creator's transcript content
- Reflections should be thought-provoking and related to the day's topic
- Tasks should build progressively across the 7 days`,

    checklist_toolkit: `You are a Digital Product Writer creating a REAL, INTERACTIVE CHECKLIST TOOLKIT.

OUTPUT RULES:
- Output ONLY raw HTML. No markdown fences. Start with <!DOCTYPE html>.
- Include Tailwind CSS CDN, Inter font, and Alpine.js CDN.

THIS IS THE ACTUAL TOOLKIT — NOT A LANDING PAGE. No hero sections, no CTAs, no pricing.

STRUCTURE:
1. TOOLKIT HEADER — Title, description, total items count
2. CATEGORY NAVIGATION — A sticky sidebar or top bar (Alpine.js):
   - List all categories with item counts
   - Clickable links that scroll to each category (anchor links)
   - Show overall progress ("X of Y complete")
3. CATEGORIES — Each wrapped in <section id="category-N"> with:
   - Category title + description
   - Items count ("8 items")
   - CHECKLIST ITEMS — Each has:
     - Interactive checkbox (Alpine.js)
     - Item label (the action)
     - Description/explanation (why this matters, from transcripts)
     - Optional: "Required" vs "Optional" badge
     - Optional: Tip or note from creator
4. PROGRESS SUMMARY — Shows X of Y complete (Alpine.js powered)

NAVIGATION:
- Sticky category nav that highlights the current section on scroll
- Each category header is an anchor target
- "Back to Categories" link within each section
- Overall progress bar at the top

DESIGN:
- Clean, Notion-like aesthetic
- Categories: border rounded-2xl p-6 mb-6
- Category headers: text-xl font-bold flex justify-between items-center
- Checklist items: p-4 border-b hover:bg-gray-50 transition flex items-start gap-3
- Checkboxes: w-5 h-5 rounded border-2 cursor-pointer (Alpine.js toggles)
- Checked items: line-through text-gray-400 transition
- Required badge: text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full
- Progress bar: h-2 bg-gray-200 rounded-full with colored fill

INTERACTIVE ELEMENTS:
- Use Alpine.js x-data for checkbox state tracking
- Progress counter updates automatically as items are checked
- Category collapse/expand with Alpine.js

CONTENT RULES:
- Every checklist item must come from the creator's actual content/advice
- Descriptions explain WHY each item matters (from transcripts)
- Group logically by category/theme
- Mark truly essential items as "Required"`,
};

// Tailwind config snippet for all product types
const TAILWIND_CONFIG = `<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    }
  }
}
</script>`;

interface TranscriptSelectionRow {
    video_id: string;
    title: string | null;
    description: string | null;
    transcript_text: string | null;
    views: number | null;
    likes: number | null;
}

interface ClipCardRow {
    video_id: string;
    card_json: Record<string, unknown> | null;
}

interface VideoMetadataRow {
    id: string;
    title: string | null;
    description: string | null;
    views: number | null;
    likes: number | null;
}

interface TranscriptChunkRow {
    video_id: string;
    chunk_text: string;
    chunk_index: number;
}

interface TopicClusterRow {
    label: string | null;
    video_count: number | null;
    confidence_score: number | null;
    total_views: number | null;
    video_ids: string[] | null;
}

interface TopicSuggestionRow {
    topic: string;
    videoCount: number;
}

const TOPIC_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'build', 'create', 'course',
    'content', 'day', 'for', 'from', 'get', 'guide', 'has', 'have', 'how', 'in', 'into', 'is',
    'it', 'its', 'lesson', 'make', 'mini', 'my', 'now', 'of', 'on', 'or', 'our', 'pdf', 'real',
    'that', 'the', 'their', 'them', 'they', 'this', 'to', 'toolkit', 'video', 'videos', 'what',
    'with', 'your',
]);

const TOPIC_GENERIC_SINGLE_WORDS = new Set([
    'content', 'course', 'create', 'guide', 'lesson', 'make', 'official', 'real', 'time', 'video',
]);

const TOPIC_GENERIC_LABELS = new Set([
    'general',
    'general content',
    'misc',
    'miscellaneous',
]);

function normalizeWhitespace(value: string | null | undefined, maxLen = 160): string | null {
    if (!value) return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLen);
}

function pickVideoTitle(
    index: number,
    transcript: TranscriptSelectionRow | undefined,
    videoMeta: VideoMetadataRow | undefined
): string {
    const candidate = normalizeWhitespace(transcript?.title, 160)
        || normalizeWhitespace(videoMeta?.title, 160)
        || normalizeWhitespace(transcript?.description, 160)
        || normalizeWhitespace(videoMeta?.description, 160);

    if (!candidate) return `Video ${index + 1}`;
    if (/^(untitled|null|n\/a)$/i.test(candidate)) return `Video ${index + 1}`;
    return candidate;
}

function tokenizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function titleCaseTopic(topic: string): string {
    return topic
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function buildCreatorNoiseTokens(creator: { handle?: string | null; display_name?: string | null }): Set<string> {
    const source = `${creator.handle || ''} ${creator.display_name || ''}`
        .toLowerCase()
        .replace(/[#@]/g, ' ');

    const tokens = source
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    const output = new Set<string>(tokens);

    const compactHandle = (creator.handle || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    if (compactHandle.length >= 4) output.add(compactHandle);

    // Common creator handle suffixes tend to be metadata, not topic signals.
    const suffixes = ['official', 'real', 'tv', 'channel'];
    for (const suffix of suffixes) {
        if (compactHandle.endsWith(suffix)) {
            const stripped = compactHandle.slice(0, compactHandle.length - suffix.length);
            if (stripped.length >= 4) output.add(stripped);
        }
    }

    const displayTokens = (creator.display_name || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
    if (displayTokens.length >= 2) {
        output.add(displayTokens.join(''));
        for (let i = 0; i < displayTokens.length - 1; i++) {
            const pair = `${displayTokens[i]}${displayTokens[i + 1]}`;
            if (pair.length >= 4) output.add(pair);
        }
    }

    return output;
}

function normalizeTopicPhrase(input: string, creatorNoise: Set<string>): string | null {
    const tokens = input
        .toLowerCase()
        .replace(/[#@]/g, ' ')
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) =>
            token.length >= 3
            && !/^\d+$/.test(token)
            && !TOPIC_STOPWORDS.has(token)
            && !creatorNoise.has(token)
        );

    if (tokens.length === 0) return null;
    if (tokens.length === 1 && TOPIC_GENERIC_SINGLE_WORDS.has(tokens[0])) return null;

    return tokens.slice(0, 5).join(' ');
}

function deriveTopicPhrasesFromText(text: string, creatorNoise: Set<string>): string[] {
    const tokens = text
        .toLowerCase()
        .replace(/[#@]/g, ' ')
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
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

function buildTopicSuggestions(input: {
    searchResults: Array<{ videoId: string; title: string | null; clipCard: Record<string, unknown> | null; score: number }>;
    clusterRows: TopicClusterRow[];
    creator: { handle?: string | null; display_name?: string | null };
}): TopicSuggestionRow[] {
    const creatorNoise = buildCreatorNoiseTokens(input.creator);
    const searchVideoIds = new Set(input.searchResults.map((result) => result.videoId));
    const topicMap = new Map<string, { score: number; videoIds: Set<string>; inferredCoverage: number }>();

    const pushTopic = (topic: string | null, videoId: string | null, weight: number, inferredCoverage = 0) => {
        if (!topic) return;
        if (TOPIC_GENERIC_LABELS.has(topic)) return;
        const existing = topicMap.get(topic) || { score: 0, videoIds: new Set<string>(), inferredCoverage: 0 };
        existing.score += weight;
        if (videoId) existing.videoIds.add(videoId);
        existing.inferredCoverage = Math.max(existing.inferredCoverage, inferredCoverage);
        topicMap.set(topic, existing);
    };

    for (const cluster of input.clusterRows) {
        const normalized = normalizeTopicPhrase(cluster.label || '', creatorNoise);
        if (!normalized || TOPIC_GENERIC_LABELS.has(normalized)) continue;
        const confidence = Math.max(0, Number(cluster.confidence_score || 0));
        const videoCount = Math.max(0, Number(cluster.video_count || 0));
        const relatedVideoIds = Array.isArray(cluster.video_ids)
            ? cluster.video_ids.filter((videoId) => searchVideoIds.has(videoId))
            : [];
        const coverage = relatedVideoIds.length;
        if (coverage === 0) continue;
        const clusterWeight = 1.4 + confidence + Math.min(videoCount, 8) * 0.12;
        pushTopic(normalized, null, clusterWeight, coverage);
    }

    for (const result of input.searchResults) {
        const card = (result.clipCard || {}) as Record<string, unknown>;
        const tags = Array.isArray(card.topicTags) ? card.topicTags : [];
        for (const tag of tags) {
            const normalized = normalizeTopicPhrase(String(tag || ''), creatorNoise);
            if (!normalized) continue;
            const weight = normalized.split(' ').length >= 2 ? 1.2 : 0.45;
            pushTopic(normalized, result.videoId, weight);
        }

        const phraseSource = [
            result.title || '',
            typeof card.bestHook === 'string' ? card.bestHook : '',
            typeof card.outcome === 'string' ? card.outcome : '',
            typeof card.whoItsFor === 'string' ? card.whoItsFor : '',
        ].join(' ');

        const phrases = deriveTopicPhrasesFromText(phraseSource, creatorNoise);
        for (const phrase of phrases) {
            const lengthBoost = phrase.split(' ').length >= 2 ? 0.35 : 0;
            pushTopic(phrase, result.videoId, 0.7 + lengthBoost);
        }
    }

    const ranked = Array.from(topicMap.entries())
        .map(([topic, data]) => ({
            topic,
            score: data.score + Math.max(data.videoIds.size, data.inferredCoverage) * 1.8,
            videoCount: Math.max(data.videoIds.size, data.inferredCoverage),
        }))
        .filter((entry) => entry.videoCount > 0 && !TOPIC_GENERIC_LABELS.has(entry.topic))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.videoCount !== a.videoCount) return b.videoCount - a.videoCount;
            return b.topic.split(' ').length - a.topic.split(' ').length;
        });

    const dedupedMultiWordStrong: TopicSuggestionRow[] = [];
    const dedupedMultiWordWeak: TopicSuggestionRow[] = [];
    const dedupedSingleWordStrong: TopicSuggestionRow[] = [];
    const dedupedSingleWordWeak: TopicSuggestionRow[] = [];
    const seen = new Set<string>();
    for (const entry of ranked) {
        if (seen.has(entry.topic)) continue;
        seen.add(entry.topic);
        const row = {
            topic: titleCaseTopic(entry.topic),
            videoCount: entry.videoCount,
        };
        const isStrong = entry.videoCount >= 2;
        if (entry.topic.includes(' ')) {
            if (isStrong) dedupedMultiWordStrong.push(row);
            else dedupedMultiWordWeak.push(row);
        } else if (isStrong) {
            dedupedSingleWordStrong.push(row);
        } else {
            dedupedSingleWordWeak.push(row);
        }
    }

    const deduped: TopicSuggestionRow[] = [];
    for (const row of dedupedMultiWordStrong) {
        deduped.push(row);
        if (deduped.length >= 6) break;
    }
    if (deduped.length < 6) {
        for (const row of dedupedMultiWordWeak) {
            deduped.push(row);
            if (deduped.length >= 6) break;
        }
    }
    if (deduped.length < 6) {
        for (const row of dedupedSingleWordStrong) {
            deduped.push(row);
            if (deduped.length >= 6) break;
        }
    }
    if (deduped.length < 6) {
        for (const row of dedupedSingleWordWeak) {
            deduped.push(row);
            if (deduped.length >= 6) break;
        }
    }

    return deduped;
}

function scoreTextMatch(text: string, tokens: string[]): number {
    if (!text || tokens.length === 0) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const token of tokens) {
        if (lower.includes(token)) score += 1;
    }
    return score;
}

function buildTranscriptContext(
    transcript: string | null | undefined,
    chunks: TranscriptChunkRow[],
    queryTokens: string[],
    maxChars = 5000
): string {
    const transcriptText = (transcript || '').trim();
    if (!transcriptText && chunks.length === 0) return '';

    if (chunks.length === 0) {
        return transcriptText.slice(0, maxChars);
    }

    const rankedChunks = chunks
        .map((chunk) => ({
            text: chunk.chunk_text,
            score: scoreTextMatch(chunk.chunk_text, queryTokens),
            idx: chunk.chunk_index,
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.idx - b.idx;
        })
        .slice(0, 6)
        .sort((a, b) => a.idx - b.idx);

    const chunkJoined = rankedChunks.map((chunk) => chunk.text).join('\n');
    const candidate = chunkJoined.length >= 250 ? chunkJoined : transcriptText;
    return candidate.slice(0, maxChars);
}

function countHtmlWords(html: string): number {
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return 0;
    return text.split(' ').filter(Boolean).length;
}

function minimumWordTarget(productType: ProductType): number {
    switch (productType) {
        case 'pdf_guide':
            return 1400;
        case 'mini_course':
            return 1200;
        case 'challenge_7day':
            return 1000;
        case 'checklist_toolkit':
            return 900;
        default:
            return 1000;
    }
}

function containsPlaceholderCopy(html: string): boolean {
    const lower = html.toLowerCase();
    return (
        lower.includes('lorem ipsum')
        || lower.includes('coming soon')
        || lower.includes('placeholder')
        || lower.includes('[insert')
    );
}

function needsContentStrengthening(html: string, productType: ProductType): boolean {
    if (!html.toLowerCase().includes('<!doctype html>')) return true;
    if (containsPlaceholderCopy(html)) return true;
    return countHtmlWords(html) < minimumWordTarget(productType);
}

function extractAnthropicText(response: Anthropic.Messages.Message): string {
    return response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
}

async function strengthenHtmlDraft(input: {
    anthropic: Anthropic;
    systemPrompt: string;
    productType: ProductType;
    draftHtml: string;
    topicQuery: string;
    voiceContext: string;
    contentContext: string;
}): Promise<string> {
    const response = await input.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: input.systemPrompt,
        messages: [{
            role: 'user',
            content: `The draft ${input.productType} below is too shallow for a paid product.
Expand it with substantial, specific teaching content grounded in the provided transcript context.
Keep the existing structure and design style, but deepen lessons/chapters/actions.
Output ONLY full HTML.

TOPIC:
${input.topicQuery}

VOICE PROFILE:
${input.voiceContext || '(none)'}

TRANSCRIPT CONTEXT:
${input.contentContext}

CURRENT DRAFT HTML:
${input.draftHtml}`,
        }],
    });

    return extractAnthropicText(response);
}

async function loadCreatorCatalogHtml(
    db: ReturnType<typeof getServiceDb>,
    creatorId: string,
    excludeProductId: string
): Promise<string[]> {
    try {
        const { data: products, error: productsError } = await db
            .from('products')
            .select('active_version_id')
            .eq('creator_id', creatorId)
            .neq('id', excludeProductId)
            .not('active_version_id', 'is', null)
            .limit(40);

        if (productsError || !products || products.length === 0) {
            return [];
        }

        const versionIds = products
            .map((row) => row.active_version_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .slice(0, 40);

        if (versionIds.length === 0) return [];

        const { data: versions, error: versionsError } = await db
            .from('product_versions')
            .select('generated_html')
            .in('id', versionIds)
            .limit(40);

        if (versionsError || !versions) {
            return [];
        }

        return versions
            .map((row) => row.generated_html)
            .filter((html): html is string => typeof html === 'string' && html.trim().length > 0);
    } catch (error) {
        log.warn('Failed to load creator catalog HTML for distinctiveness gate', {
            error: error instanceof Error ? error.message : 'Unknown error',
            creatorId,
        });
        return [];
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    let body: { creatorId: string; message: string; productType?: ProductType; confirmedTopic?: string };
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    const { creatorId, message } = body;
    if (!creatorId || !message) {
        return new Response(JSON.stringify({ error: 'creatorId and message required' }), { status: 400 });
    }

    // Enforce creator ownership using the authenticated user context.
    const { data: ownedCreator, error: ownershipError } = await supabase
        .from('creators')
        .select('id')
        .eq('id', creatorId)
        .eq('profile_id', user.id)
        .maybeSingle();

    if (ownershipError) {
        return new Response(JSON.stringify({ error: ownershipError.message }), { status: 500 });
    }

    if (!ownedCreator) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const db = getServiceDb();

    // Verify creator
    const { data: creator } = await db
        .from('creators')
        .select('id, handle, display_name, bio, brand_tokens, voice_profile')
        .eq('id', ownedCreator.id)
        .single();

    if (!creator) {
        return new Response(JSON.stringify({ error: 'Creator not found' }), { status: 404 });
    }

    // Detect product type
    const promptLower = message.toLowerCase();
    let productType: ProductType = body.productType || 'pdf_guide';
    if (!body.productType) {
        if (promptLower.includes('course') || promptLower.includes('lesson')) productType = 'mini_course';
        else if (promptLower.includes('challenge') || promptLower.includes('7-day') || promptLower.includes('7 day')) productType = 'challenge_7day';
        else if (promptLower.includes('checklist') || promptLower.includes('toolkit')) productType = 'checklist_toolkit';
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            try {
                // ── Phase 1: Topic Discovery ──
                send({ type: 'status', message: '🔍 Analyzing your content library...', phase: 'analyzing' });

                // Check if prompt is specific or vague
                const isVague = /^(create|make|build)\s+(a|an|my)?\s*(pdf|guide|course|mini|challenge|checklist|toolkit)/i.test(message)
                    && message.split(' ').length < 10;

                // Run hybrid search to discover what content exists
                const searchResults = await hybridSearch(db, creator.id, message, { limit: 100 });

                if (searchResults.length === 0) {
                    send({
                        type: 'error',
                        message: '📭 No content found. Please import your TikTok videos first so the AI can build products from your real content.',
                    });
                    controller.close();
                    return;
                }

                // If prompt is vague, suggest topics
                if (isVague && !body.confirmedTopic) {
                    const { data: clusterRows } = await db
                        .from('content_clusters')
                        .select('label, video_count, confidence_score, total_views, video_ids')
                        .eq('creator_id', creator.id)
                        .order('total_views', { ascending: false })
                        .limit(8);

                    const topTopics = buildTopicSuggestions({
                        searchResults,
                        clusterRows: (clusterRows || []) as TopicClusterRow[],
                        creator: {
                            handle: creator.handle,
                            display_name: creator.display_name,
                        },
                    });

                    if (topTopics.length > 0) {
                        send({
                            type: 'topic_suggestions',
                            message: `I found ${searchResults.length} videos in your library. What topic should this ${productType === 'pdf_guide' ? 'guide' : productType === 'mini_course' ? 'course' : productType === 'challenge_7day' ? 'challenge' : 'toolkit'} focus on?`,
                            topics: topTopics,
                            productType,
                        });
                        controller.close();
                        return;
                    }
                }

                // Use confirmed topic or the original message as the search query
                const topicQuery = body.confirmedTopic || message;

                // ── Phase 2: Retrieve + Rerank ──
                send({ type: 'status', message: '🎯 Finding your best content on this topic...', phase: 'retrieving' });

                // Re-search with specific topic if confirmed
                const topicResults = body.confirmedTopic
                    ? await hybridSearch(db, creator.id, topicQuery, { limit: 100 })
                    : searchResults;

                send({ type: 'status', message: `📊 Found ${topicResults.length} related videos. Selecting the best ones...`, phase: 'reranking' });

                const reranked = await rerankCandidates(
                    topicResults.map((r) => ({
                        videoId: r.videoId,
                        title: r.title,
                        clipCard: r.clipCard,
                    })),
                    topicQuery,
                    productType,
                );

                const selectedVideoIds = reranked.selectedVideos.map((v) => v.videoId);

                if (selectedVideoIds.length === 0) {
                    send({
                        type: 'error',
                        message: '📭 Not enough relevant content found for this topic. Try a different topic or import more videos.',
                    });
                    controller.close();
                    return;
                }

                send({
                    type: 'status',
                    message: `✅ Selected ${selectedVideoIds.length} videos. Extracting content...`,
                    phase: 'extracting',
                });

                const queryTokens = tokenizeQuery(topicQuery);

                const [
                    { data: transcripts },
                    { data: clipCards },
                    { data: videosMeta },
                    { data: transcriptChunks },
                ] = await Promise.all([
                    db
                        .from('video_transcripts')
                        .select('video_id, title, description, transcript_text, views, likes')
                        .in('video_id', selectedVideoIds),
                    db
                        .from('clip_cards')
                        .select('video_id, card_json')
                        .in('video_id', selectedVideoIds),
                    db
                        .from('videos')
                        .select('id, title, description, views, likes')
                        .in('id', selectedVideoIds),
                    db
                        .from('transcript_chunks')
                        .select('video_id, chunk_text, chunk_index')
                        .in('video_id', selectedVideoIds),
                ]);

                const transcriptMap = new Map(
                    ((transcripts || []) as TranscriptSelectionRow[]).map((row) => [row.video_id, row])
                );
                const videoMap = new Map(
                    ((videosMeta || []) as VideoMetadataRow[]).map((row) => [row.id, row])
                );
                const clipCardMap = new Map(
                    ((clipCards || []) as ClipCardRow[]).map((row) => [row.video_id, row.card_json])
                );
                const chunksByVideo = new Map<string, TranscriptChunkRow[]>();
                for (const chunk of (transcriptChunks || []) as TranscriptChunkRow[]) {
                    const existing = chunksByVideo.get(chunk.video_id) || [];
                    existing.push(chunk);
                    chunksByVideo.set(chunk.video_id, existing);
                }

                const selectedContexts = selectedVideoIds
                    .map((videoId, idx) => {
                        const transcript = transcriptMap.get(videoId);
                        const videoMeta = videoMap.get(videoId);
                        const card = (clipCardMap.get(videoId) || null) as Record<string, unknown> | null;
                        const title = pickVideoTitle(idx, transcript, videoMeta);
                        const views = transcript?.views || videoMeta?.views || 0;
                        const topicTags = Array.isArray(card?.topicTags)
                            ? (card?.topicTags as string[]).slice(0, 8)
                            : (Array.isArray(card?.tags) ? (card?.tags as string[]).slice(0, 8) : []);
                        const keySteps = Array.isArray(card?.keySteps)
                            ? (card?.keySteps as string[]).slice(0, 8)
                            : (Array.isArray(card?.keyBullets) ? (card?.keyBullets as string[]).slice(0, 8) : []);
                        const transcriptContext = buildTranscriptContext(
                            transcript?.transcript_text,
                            chunksByVideo.get(videoId) || [],
                            queryTokens,
                            6000
                        );

                        if (!transcriptContext) return null;

                        return {
                            videoId,
                            title,
                            views,
                            topicTags,
                            keySteps,
                            transcriptContext,
                        };
                    })
                    .filter((row): row is {
                        videoId: string;
                        title: string;
                        views: number;
                        topicTags: string[];
                        keySteps: string[];
                        transcriptContext: string;
                    } => Boolean(row));

                if (selectedContexts.length === 0) {
                    send({
                        type: 'error',
                        message: '📭 We found videos but could not retrieve enough transcript content. Please retry import to refresh transcripts.',
                    });
                    controller.close();
                    return;
                }

                const sourceEvidenceWordCount = selectedContexts.reduce((sum, row) => {
                    const words = row.transcriptContext.split(/\s+/).filter(Boolean).length;
                    return sum + words;
                }, 0);
                const groundedVideoIds = selectedContexts.map((row) => row.videoId);

                const contentContext = selectedContexts.map((row, i) => `--- VIDEO ${i + 1} [ID: ${row.videoId}] ---
TITLE: "${row.title}" (${row.views} views)
${row.topicTags.length > 0 ? `KEY TOPICS: ${row.topicTags.join(', ')}` : 'KEY TOPICS: N/A'}
${row.keySteps.length > 0 ? `KEY STEPS: ${JSON.stringify(row.keySteps)}` : 'KEY STEPS: []'}
TRANSCRIPT EVIDENCE:
${row.transcriptContext}
---`).join('\n\n');

                send({
                    type: 'source_videos',
                    videos: selectedContexts.map((row) => ({
                        title: row.title,
                        views: row.views || 0,
                    })),
                });

                // ── Phase 3: Planning ──
                send({ type: 'status', message: '📝 Planning your product structure...', phase: 'planning' });

                // Generate a smart title
                const titlePrompt = body.confirmedTopic || message;
                const cleanTitle = titlePrompt
                    .replace(/^(create|make|build|generate)\s+(a|an|my|me)?\s*/i, '')
                    .replace(/\s*(from|using|with)\s+my\s+(top\s+)?(videos?|content|tiktoks?).*/i, '')
                    .trim();
                const productTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

                const slug = productTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
                    + '-' + Date.now().toString(36);

                // ── Phase 4: Create product + Stream HTML ──
                send({ type: 'status', message: '🏗️ Building your product live...', phase: 'building' });

                // Create product in DB first
                const { data: product, error: productError } = await db
                    .from('products')
                    .insert({
                        creator_id: creator.id,
                        slug,
                        type: productType,
                        title: productTitle,
                        description: `Created from: "${message}"`,
                        status: 'draft',
                        access_type: 'paid',
                        price_cents: 999,
                        currency: 'usd',
                    })
                    .select('id')
                    .single();

                if (productError || !product) {
                    send({ type: 'error', message: `Failed to create product: ${productError?.message || 'Unknown'}` });
                    controller.close();
                    return;
                }

                const catalogHtml = await loadCreatorCatalogHtml(db, creator.id, product.id);

                send({
                    type: 'status',
                    message: '🧬 Applying creator DNA and evergreen design canon...',
                    phase: 'planning',
                });

                const voiceProfile = creator.voice_profile as Record<string, unknown> | null;
                const brandTokens = creator.brand_tokens as Record<string, unknown> | null;
                const creatorDna = buildCreatorDNA({
                    handle: creator.handle,
                    displayName: creator.display_name,
                    bio: creator.bio,
                    voiceProfile,
                    brandTokens,
                });
                const creatorDnaContext = buildCreatorDNAContext(creatorDna);

                const designCanon = getEvergreenDesignCanon();
                const creativeDirection = chooseCreativeDirection({
                    productType,
                    creatorId: creator.id,
                    topicQuery,
                    creatorMood: creatorDna.visual.mood,
                    priorProductCount: catalogHtml.length,
                });
                const designCanonContext = buildDesignCanonContext(designCanon, creativeDirection);
                const voiceContext = creatorDnaContext;

                const systemPrompt = PRODUCT_SYSTEM_PROMPTS[productType] || PRODUCT_SYSTEM_PROMPTS.pdf_guide;

                const userContent = `Create the ACTUAL digital product content.

PRODUCT TYPE: ${productType}
PRODUCT TITLE: ${productTitle}
CREATOR: ${creator.display_name} (@${creator.handle})
USER REQUEST: ${message}
TOPIC FOCUS: ${topicQuery}
DESIGN CANON VERSION: ${designCanon.version}
CREATIVE DIRECTION: ${creativeDirection.name} (${creativeDirection.id})

${creatorDnaContext}

${designCanonContext}

VIDEOS USED (${selectedContexts.length} videos with transcript evidence):
${contentContext}

IMPORTANT:
- This is an evergreen premium product. Do not chase short-term trends or date-specific aesthetics.
- This is the REAL product that buyers receive. Fill it with REAL, SUBSTANTIVE content from the transcripts above.
- Mix the creator's own words and advice (from transcripts) with smooth connecting text.
- Every chapter/lesson/day/category must contain real, actionable content — not placeholder text.
- Add source attribution comments in HTML for major sections (example: <!-- sources: video-id-1,video-id-2 -->).
- Write in the creator's voice and style exactly as described in the CREATOR DNA PROFILE.
- Apply creator visual tokens and the selected creative direction. Avoid generic template patterns.
- The product should be worth paying for — thorough, specific, and valuable.
- Include the Tailwind config script right after the Tailwind CDN:
${TAILWIND_CONFIG}

Generate the complete HTML document now.`;

                // Stream HTML from Claude
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
                let fullHtml = '';

                try {
                    const aiStream = anthropic.messages.stream({
                        model: 'claude-sonnet-4-6',
                        max_tokens: 16384,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: userContent }],
                    });

                    let chunkCount = 0;

                    for await (const event of aiStream) {
                        if (event.type === 'content_block_delta' && 'delta' in event && event.delta.type === 'text_delta') {
                            fullHtml += event.delta.text;
                            chunkCount++;

                            if (chunkCount % 3 === 0) {
                                send({ type: 'html_chunk', html: fullHtml });
                            }
                        }
                    }

                    // Send final chunk
                    send({ type: 'html_chunk', html: fullHtml });
                } catch (claudeErr) {
                    log.error('Claude streaming failed, trying Kimi', {
                        error: claudeErr instanceof Error ? claudeErr.message : 'Unknown',
                    });

                    send({ type: 'status', message: '🔄 Switching to backup AI...', phase: 'fallback' });

                    const OpenAI = (await import('openai')).default;
                    const kimi = new OpenAI({
                        apiKey: process.env.KIMI_API_KEY || '',
                        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
                    });

                    const result = await kimi.chat.completions.create({
                        model: 'kimi-k2.5',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userContent },
                        ],
                        temperature: 0.7,
                        max_tokens: 16000,
                    });

                    fullHtml = result.choices[0]?.message?.content ?? '';
                    send({ type: 'html_chunk', html: fullHtml });
                }

                if (needsContentStrengthening(fullHtml, productType) && process.env.ANTHROPIC_API_KEY) {
                    send({
                        type: 'status',
                        message: '🧠 Strengthening depth and source grounding...',
                        phase: 'building',
                    });
                    try {
                        const strengthened = await strengthenHtmlDraft({
                            anthropic,
                            systemPrompt,
                            productType,
                            draftHtml: fullHtml,
                            topicQuery,
                            voiceContext,
                            contentContext,
                        });
                        if (strengthened.trim()) {
                            fullHtml = strengthened;
                            send({ type: 'html_chunk', html: fullHtml });
                        }
                    } catch (strengthenError) {
                        log.warn('HTML strengthening pass failed', {
                            error: strengthenError instanceof Error ? strengthenError.message : 'Unknown strengthen error',
                        });
                    }
                }

                fullHtml = postProcessHTML(fullHtml);

                let qualityEvaluation = evaluateProductQuality({
                    html: fullHtml,
                    productType,
                    sourceVideoIds: groundedVideoIds,
                    catalogHtml,
                    brandTokens,
                    creatorHandle: creator.handle,
                    qualityWeights: designCanon.qualityWeights,
                });
                let criticIterations = 0;
                let criticModels: string[] = [];

                if (!qualityEvaluation.overallPassed) {
                    send({
                        type: 'status',
                        message: '🧪 Running evergreen quality critic and revision loop...',
                        phase: 'building',
                    });

                    try {
                        const criticResult = await runEvergreenCriticLoop({
                            html: fullHtml,
                            productType,
                            sourceVideoIds: groundedVideoIds,
                            catalogHtml,
                            brandTokens,
                            creatorHandle: creator.handle,
                            creatorDisplayName: creator.display_name || creator.handle,
                            topicQuery,
                            originalRequest: message,
                            creatorDnaContext,
                            designCanonContext,
                            directionId: creativeDirection.id,
                            contentContext,
                            maxIterations: 2,
                            qualityWeights: designCanon.qualityWeights,
                        });

                        fullHtml = criticResult.html;
                        qualityEvaluation = criticResult.evaluation;
                        criticIterations = criticResult.iterationsRun;
                        criticModels = criticResult.modelTrail;
                        send({ type: 'html_chunk', html: fullHtml });
                    } catch (criticError) {
                        log.warn('Evergreen critic loop failed; keeping best available HTML', {
                            error: criticError instanceof Error ? criticError.message : 'Unknown critic error',
                            productId: product.id,
                        });
                    }
                }

                send({
                    type: 'status',
                    message: `✅ Quality score ${qualityEvaluation.overallScore}/100 (${qualityEvaluation.overallPassed ? 'pass' : 'partial pass'})`,
                    phase: 'building',
                });
                send({ type: 'html_complete', html: fullHtml });

                // Save version
                send({ type: 'status', message: '💾 Saving your product...', phase: 'saving' });

                const gateScores = Object.fromEntries(
                    Object.entries(qualityEvaluation.gates).map(([key, gate]) => [
                        key,
                        {
                            score: gate.score,
                            threshold: gate.threshold,
                            passed: gate.passed,
                            notes: gate.notes,
                        },
                    ])
                );

                const { data: version } = await db
                    .from('product_versions')
                    .insert({
                        product_id: product.id,
                        version_number: 1,
                        build_packet: {
                            userPrompt: message,
                            productType,
                            title: productTitle,
                            creatorHandle: creator.handle,
                            videosUsed: groundedVideoIds.length,
                            rerankerConfidence: reranked.confidence,
                            coverageGaps: reranked.coverageGaps,
                            sourceEvidenceWordCount,
                            generatedWordCount: countHtmlWords(fullHtml),
                            designCanonVersion: designCanon.version,
                            creativeDirectionId: creativeDirection.id,
                            creativeDirectionName: creativeDirection.name,
                            qualityOverallScore: qualityEvaluation.overallScore,
                            qualityOverallPassed: qualityEvaluation.overallPassed,
                            qualityFailingGates: qualityEvaluation.failingGates,
                            qualityGateScores: gateScores,
                            maxCatalogSimilarity: qualityEvaluation.maxCatalogSimilarity,
                            catalogCompared: catalogHtml.length,
                            criticIterations,
                            criticModels,
                        },
                        dsl_json: {},
                        generated_html: fullHtml,
                        source_video_ids: groundedVideoIds,
                    })
                    .select('id')
                    .single();

                if (version) {
                    await db
                        .from('products')
                        .update({ active_version_id: version.id })
                        .eq('id', product.id);
                }

                send({
                    type: 'complete',
                    productId: product.id,
                    versionId: version?.id,
                    title: productTitle,
                    productType,
                    videosUsed: groundedVideoIds.length,
                    qualityScore: qualityEvaluation.overallScore,
                });

                log.info('Product built via streaming', {
                    productId: product.id,
                    title: productTitle,
                    htmlLength: fullHtml.length,
                    videosUsed: groundedVideoIds.length,
                    confidence: reranked.confidence,
                    qualityScore: qualityEvaluation.overallScore,
                    qualityPassed: qualityEvaluation.overallPassed,
                    criticIterations,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                log.error('Build stream error', { error: msg });
                send({ type: 'error', message: msg });
            }

            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
