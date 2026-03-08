import { z } from 'zod';
import type { ProductType } from '@/types/build-packet';
import type { CreatorDNA } from '@/lib/ai/creator-dna';
import type { CreativeDirection } from '@/lib/ai/design-canon';
import type { MarketOfferBrief } from '@/lib/ai/market-offer-intel';
import { requestKimiStructuredObject, requestKimiTextCompletion } from '@/lib/ai/kimi-structured';
import { ensureChecklistDocumentInteractivity } from '@/lib/ai/checklist-interactivity';
import { log } from '@/lib/logger';

export interface KimiPipelineContext {
    videoId: string;
    title: string;
    views: number;
    topicTags: string[];
    keySteps: string[];
    transcriptContext: string;
}

interface LibrarianEvidenceRow {
    videoId: string;
    title: string;
    whyItMatters: string;
    anchorQuote: string;
    extractionFocus: string[];
    sectionTitle: string;
    sectionObjective: string;
}

interface LibrarianPack {
    productAngle: string;
    audiencePromise: string;
    selectedVideoIds: string[];
    evidenceRows: LibrarianEvidenceRow[];
}

interface ArchitectSection {
    id: string;
    title: string;
    objective: string;
    sourceVideoIds: string[];
    layoutHint: string;
    requiredElements: string[];
    wordTarget: number;
}

interface ArchitectPlan {
    title: string;
    subtitle: string;
    shell: {
        eyebrow: string;
        layoutStyle: string;
        navStyle: string;
        visualHierarchy: string;
        interactionModel: string;
        composerNotes: string;
    };
    sections: ArchitectSection[];
    keyTakeaways: string[];
    faq: Array<{ question: string; answer: string }>;
}

export interface KimiSectionBlock {
    id: string;
    title: string;
    sourceVideoIds: string[];
    html: string;
}

export interface KimiSectionedProductPipelineResult {
    html: string;
    librarianPack: LibrarianPack;
    architectPlan: ArchitectPlan;
    sectionBlocks: KimiSectionBlock[];
    stageTimingsMs: Record<string, number>;
}

const KIMI_LIBRARIAN_TIMEOUT_MS = 15_000;
const KIMI_SECTION_TIMEOUT_MS = 90_000;
const KIMI_LIBRARIAN_SOFT_TIMEOUT_MS = 10_000;
const KIMI_SECTION_BATCH_SOFT_TIMEOUT_MS = 25_000;
const KIMI_SECTION_BATCH_ATTEMPT_MAX_SECTIONS = 3;

interface KimiPageShell {
    bodyClasses: string;
    backgroundHtml: string;
    heroHtml: string;
    navHtml: string;
    footerHtml: string;
}

const LibrarianPackSchema = z.object({
    productAngle: z.string().default(''),
    audiencePromise: z.string().default(''),
    selectedVideoIds: z.array(z.string()).default([]),
    evidenceRows: z.array(
        z.object({
            videoId: z.string(),
            title: z.string().default(''),
            whyItMatters: z.string().default(''),
            anchorQuote: z.string().default(''),
            extractionFocus: z.array(z.string()).default([]),
            sectionTitle: z.string().default(''),
            sectionObjective: z.string().default(''),
        })
    ).default([]),
});

const LIBRARIAN_TOPIC_STOPWORDS = new Set([
    'about', 'afternoon', 'build', 'course', 'create', 'creator', 'creators', 'digital', 'focused',
    'guide', 'how', 'into', 'lesson', 'lessons', 'mini', 'module', 'product', 'products', 'teach',
    'teaches', 'that', 'their', 'them', 'this', 'tiktok', 'video', 'videos', 'week', 'with', 'your',
]);

function sectionPrefix(productType: ProductType): string {
    switch (productType) {
        case 'pdf_guide':
            return 'chapter';
        case 'mini_course':
            return 'module';
        case 'challenge_7day':
            return 'day';
        case 'checklist_toolkit':
            return 'category';
        default:
            return 'section';
    }
}

function sectionCountTarget(productType: ProductType): number {
    switch (productType) {
        case 'challenge_7day':
            return 7;
        case 'checklist_toolkit':
            return 6;
        case 'mini_course':
            return 5;
        case 'pdf_guide':
        default:
            return 6;
    }
}

function productScaffoldGuidance(productType: ProductType): string {
    switch (productType) {
        case 'pdf_guide':
            return 'The finished product should read like a premium downloadable guide with a table of contents, chapter rhythm, and calm editorial pacing. Each chapter should contain multiple paragraphs of substantive teaching, concrete examples, and actionable takeaways drawn from the creator\'s real expertise.';
        case 'mini_course':
            return 'The finished product should feel like a premium mini-course with module navigation, lesson pacing, and clear action steps. Each module should include an introduction, 2-3 in-depth teaching blocks with examples, practice exercises, and a summary.';
        case 'challenge_7day':
            return 'The finished product should feel like a 7-day guided challenge with day navigation, progressive difficulty, and momentum. Each day should include context-setting, detailed instructions, creator tips from real experience, and a clear action step with expected outcomes.';
        case 'checklist_toolkit':
            return 'The finished product should feel like a premium checklist toolkit with categories, scannable execution steps, context-rich explanations, and progress logic. Each category should have a grounding paragraph explaining the rationale, followed by checklist items with detailed one-to-two sentence explanations.';
        default:
            return 'The finished product should feel like a premium creator product with substantial, actionable content.';
    }
}

function sectionFormatGuidance(productType: ProductType): string {
    switch (productType) {
        case 'checklist_toolkit':
            return 'Build the section with a grounding paragraph (3-4 sentences explaining WHY this category matters), then a checklist of 5-8 concrete items. Each item must have a one-to-two sentence explanation grounded in real creator insights. End with a closing takeaway paragraph. Each item must be rendered as a clickable checklist row using real checkbox controls or an equivalent accessible toggle pattern. Aim for 350+ words.';
        case 'mini_course':
            return 'Build the section with a lesson introduction (2-3 paragraphs setting context), then 2-3 teaching blocks each with a subheading, 2-3 paragraphs of concrete instruction, a real example or case study from the creator\'s experience, and a practical action step. End with a key takeaway summary. Aim for 400+ words.';
        case 'challenge_7day':
            return 'Build the section with a day intention paragraph (2-3 sentences on what will be accomplished), then 3-5 concrete steps with detailed instructions (each step gets 2-3 sentences of real guidance), a creator tip or insight block, and a completion reflection that ties progress back to the overall challenge goal. Aim for 400+ words.';
        case 'pdf_guide':
        default:
            return 'Build the section with a thoughtful introduction (2-3 paragraphs), 2-4 concrete teaching blocks each containing a subheading and 2-3 paragraphs of substantive instruction with specific examples from the creator\'s content, and a clear actionable takeaway. Include callout boxes or highlighted tips where appropriate. Aim for 450+ words.';
    }
}

function compactContext(contexts: KimiPipelineContext[], limit = 8, maxChars = 1800): string {
    return contexts
        .slice(0, limit)
        .map((row, index) => [
            `VIDEO ${index + 1}`,
            `ID: ${row.videoId}`,
            `TITLE: ${row.title}`,
            `VIEWS: ${row.views}`,
            `TOPICS: ${row.topicTags.join(', ') || 'n/a'}`,
            `KEY STEPS: ${row.keySteps.join(' | ') || 'n/a'}`,
            `TRANSCRIPT: ${row.transcriptContext.slice(0, maxChars)}`,
        ].join('\n'))
        .join('\n\n');
}

function tokenizeLibrarianTopicQuery(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !LIBRARIAN_TOPIC_STOPWORDS.has(token));
}

function titleCaseWords(value: string): string {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeCompactWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function scoreContextForLibrarian(context: KimiPipelineContext, queryTokens: string[]): number {
    const title = context.title.toLowerCase();
    const topicTags = context.topicTags.join(' ').toLowerCase();
    const keySteps = context.keySteps.join(' ').toLowerCase();
    const transcript = context.transcriptContext.slice(0, 1200).toLowerCase();

    let score = Math.log10(Math.max(10, context.views + 10));
    if (context.keySteps.length > 0) score += 0.8;
    if (context.topicTags.length > 0) score += 0.5;

    for (const token of queryTokens) {
        if (title.includes(token)) score += 3.2;
        if (topicTags.includes(token)) score += 2.2;
        if (keySteps.includes(token)) score += 1.8;
        if (transcript.includes(token)) score += 0.6;
    }

    return score;
}

function chooseLibrarianSectionTitle(input: {
    context: KimiPipelineContext;
    productType: ProductType;
    index: number;
}): string {
    const candidate = input.context.keySteps[0]
        || input.context.topicTags[0]
        || input.context.title;
    if (!candidate) return `${sectionPrefix(input.productType)} ${input.index + 1}`;
    return titleCaseWords(normalizeCompactWhitespace(candidate));
}

function chooseLibrarianObjective(input: {
    context: KimiPipelineContext;
    productTitle: string;
}): string {
    const primaryStep = normalizeCompactWhitespace(input.context.keySteps[0] || '');
    if (primaryStep) {
        return `Teach how to ${primaryStep.charAt(0).toLowerCase()}${primaryStep.slice(1)} with creator-specific detail.`;
    }

    const primaryTopic = normalizeCompactWhitespace(input.context.topicTags[0] || '');
    if (primaryTopic) {
        return `Turn ${primaryTopic.toLowerCase()} into a concrete lesson for ${input.productTitle}.`;
    }

    return `Turn ${input.context.title} into a concrete lesson for ${input.productTitle}.`;
}

export function buildDeterministicLibrarianPack(input: {
    productType: ProductType;
    productTitle: string;
    topicQuery: string;
    selectedContexts: KimiPipelineContext[];
}): LibrarianPack {
    const queryTokens = tokenizeLibrarianTopicQuery(input.topicQuery);
    const targetCount = Math.min(
        input.selectedContexts.length,
        Math.max(4, sectionCountTarget(input.productType))
    );
    const rankedContexts = [...input.selectedContexts]
        .sort((a, b) => {
            const scoreDiff = scoreContextForLibrarian(b, queryTokens) - scoreContextForLibrarian(a, queryTokens);
            if (scoreDiff !== 0) return scoreDiff;
            return b.views - a.views;
        })
        .slice(0, targetCount);

    const evidenceRows = rankedContexts.map((context, index) => ({
        videoId: context.videoId,
        title: context.title,
        whyItMatters: context.keySteps[0]
            || context.topicTags[0]
            || `Ground this section in ${context.title}.`,
        anchorQuote: firstTranscriptSentence(context.transcriptContext),
        extractionFocus: (context.keySteps.length > 0 ? context.keySteps : context.topicTags).slice(0, 4),
        sectionTitle: chooseLibrarianSectionTitle({
            context,
            productType: input.productType,
            index,
        }),
        sectionObjective: chooseLibrarianObjective({
            context,
            productTitle: input.productTitle,
        }),
    }));

    const focusTerms = Array.from(new Set(
        rankedContexts.flatMap((context) => [...context.topicTags, ...context.keySteps])
    )).slice(0, 3);

    return {
        productAngle: focusTerms.length > 0
            ? `${input.productTitle} built around ${focusTerms.map((term) => normalizeCompactWhitespace(term).toLowerCase()).join(', ')}.`
            : `${input.productTitle} built from the creator's strongest transcript evidence about ${input.topicQuery}.`,
        audiencePromise: `Give the buyer a creator-tested system they can apply immediately to ${input.topicQuery.toLowerCase()}.`,
        selectedVideoIds: rankedContexts.slice(0, 5).map((row) => row.videoId),
        evidenceRows,
    };
}

function firstTranscriptSentence(value: string): string {
    const sentence = value
        .replace(/\s+/g, ' ')
        .trim()
        .match(/(.{40,220}?[.!?])(\s|$)/)?.[1];
    return (sentence || value.replace(/\s+/g, ' ').trim().slice(0, 220)).trim();
}

function buildFallbackLibrarianPack(input: {
    productType: ProductType;
    productTitle: string;
    topicQuery: string;
    selectedContexts: KimiPipelineContext[];
}): LibrarianPack {
    return buildDeterministicLibrarianPack(input);
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let handle: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            work,
            new Promise<T>((_, reject) => {
                handle = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
            }),
        ]);
    } finally {
        if (handle) clearTimeout(handle);
    }
}

async function withSoftTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T | null> {
    let handle: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            work,
            new Promise<null>((resolve) => {
                handle = setTimeout(() => resolve(null), timeoutMs);
            }),
        ]);
    } finally {
        if (handle) clearTimeout(handle);
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeArchitectPlan(
    plan: ArchitectPlan,
    contexts: KimiPipelineContext[],
    productType: ProductType,
    fallbackTitle: string,
    fallbackSubtitle: string
): ArchitectPlan {
    const allowedVideoIds = new Set(contexts.map((row) => row.videoId));
    const fallbackSourceIds = contexts.slice(0, 2).map((row) => row.videoId);
    const prefix = sectionPrefix(productType);
    const count = sectionCountTarget(productType);
    const baseSections = (plan.sections.length > 0 ? plan.sections : contexts.slice(0, count).map((row, index) => ({
        id: `${prefix}-${index + 1}`,
        title: row.title || `${prefix} ${index + 1}`,
        objective: '',
        sourceVideoIds: [row.videoId],
        layoutHint: '',
        requiredElements: [],
        wordTarget: 450,
    }))).slice(0, count);
    const usedVideoIds = new Set(baseSections.flatMap((section) => section.sourceVideoIds));
    const fallbackSections = contexts
        .filter((row) => !usedVideoIds.has(row.videoId))
        .slice(0, Math.max(0, count - baseSections.length))
        .map((row, index) => ({
            id: `${prefix}-${baseSections.length + index + 1}`,
            title: row.title || `${prefix} ${baseSections.length + index + 1}`,
            objective: `Draw out a grounded teaching from ${row.title || 'this source video'} for ${fallbackTitle}.`,
            sourceVideoIds: [row.videoId],
            layoutHint: '',
            requiredElements: ['grounded teaching', 'concrete takeaway'],
            wordTarget: productType === 'checklist_toolkit' ? 350 : 420,
        }));

    const sections = [...baseSections, ...fallbackSections]
        .slice(0, count)
        .map((section, index) => {
            const validSourceVideoIds = section.sourceVideoIds.filter((id) => allowedVideoIds.has(id));
            return {
                ...section,
                id: section.id?.trim() || `${prefix}-${index + 1}`,
                title: section.title?.trim() || `${prefix} ${index + 1}`,
                objective: section.objective?.trim() || `Deliver a concrete lesson for ${fallbackTitle}.`,
                sourceVideoIds: validSourceVideoIds.length > 0 ? validSourceVideoIds : fallbackSourceIds,
                layoutHint: section.layoutHint?.trim() || 'Use a premium shadcn-style section card.',
                requiredElements: section.requiredElements.length > 0 ? section.requiredElements : ['grounded teaching', 'clear hierarchy'],
                wordTarget: Math.max(300, Math.min(600, section.wordTarget || (productType === 'checklist_toolkit' ? 350 : 450))),
            };
        });

    return {
        title: plan.title?.trim() || fallbackTitle,
        subtitle: plan.subtitle?.trim() || fallbackSubtitle,
        shell: {
            eyebrow: plan.shell?.eyebrow?.trim() || 'Owny Studio',
            layoutStyle: plan.shell?.layoutStyle?.trim() || 'Single-column premium layout',
            navStyle: plan.shell?.navStyle?.trim() || 'Sticky section navigation',
            visualHierarchy: plan.shell?.visualHierarchy?.trim() || 'Editorial contrast with premium cards',
            interactionModel: plan.shell?.interactionModel?.trim() || 'Light Alpine-powered navigation only where needed',
            composerNotes: plan.shell?.composerNotes?.trim() || 'Preserve source comments and creator identity.',
        },
        sections,
        keyTakeaways: plan.keyTakeaways.slice(0, 8),
        faq: plan.faq.slice(0, 5).filter((row) => row.question && row.answer),
    };
}

function evidenceForSection(section: ArchitectSection, contexts: KimiPipelineContext[]): string {
    const matches = contexts.filter((row) => section.sourceVideoIds.includes(row.videoId)).slice(0, 3);
    return compactContext(matches.length > 0 ? matches : contexts.slice(0, 2), 3, 800);
}

function estimateSectionCompletionMaxTokens(input: {
    sections: number;
    totalWordTarget: number;
}): number {
    const baseEstimate = Math.ceil((input.totalWordTarget * 2.2) + (input.sections * 400));
    return Math.max(4000, Math.min(16000, baseEstimate));
}

function estimateSingleSectionMaxTokens(input: {
    productType: ProductType;
    wordTarget: number;
}): number {
    const multiplier = input.productType === 'checklist_toolkit' ? 5.2 : 4.5;
    const baseEstimate = Math.ceil((input.wordTarget * multiplier) + 320);
    const ceiling = input.productType === 'checklist_toolkit' ? 3200 : 3000;
    return Math.max(1600, Math.min(ceiling, baseEstimate));
}

function buildSectionArtDirectionContext(input: {
    architectPlan: ArchitectPlan;
    designCanonContext: string;
}): string {
    return [
        `Layout: ${input.architectPlan.shell.layoutStyle}`,
        `Hierarchy: ${input.architectPlan.shell.visualHierarchy}`,
        `Interaction: ${input.architectPlan.shell.interactionModel}`,
        `Signature: ${input.architectPlan.shell.composerNotes}`,
        `Canon: ${input.designCanonContext.replace(/\s+/g, ' ').trim().slice(0, 360)}`,
    ].join('\n');
}

function ensureSectionMarkup(input: {
    rawHtml: string;
    section: ArchitectSection;
}): string {
    let html = input.rawHtml.trim();
    if (!/<!--\s*sources:\s*[\s\S]*?-->/i.test(html)) {
        html = `<!-- sources: ${input.section.sourceVideoIds.join(',')} -->\n${html}`;
    }

    const expectedIdPattern = new RegExp(
        `<section[^>]*\\bid=["']${input.section.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
        'i'
    );

    if (!expectedIdPattern.test(html)) {
        if (/<section[^>]*\bid=["'][^"']+["']/i.test(html)) {
            html = html.replace(
                /(<section[^>]*\bid=["'])([^"']+)(["'])/i,
                `$1${input.section.id}$3`
            );
        } else {
            html = html.replace(/<section\b/i, `<section id="${input.section.id}"`);
        }
    }

    return html.trim();
}

export function extractGeneratedSectionBlocks(input: {
    rawHtml: string;
    sections: ArchitectSection[];
}): KimiSectionBlock[] {
    const matches = Array.from(
        input.rawHtml.matchAll(/((?:<!--\s*sources:\s*[\s\S]*?-->\s*)?<section\b[\s\S]*?<\/section>)/gi)
    );
    const rawBlocks = matches.map((match) => match[1].trim());
    const usedIndexes = new Set<number>();

    return input.sections.flatMap((section, index) => {
        let matchedIndex = rawBlocks.findIndex((block, blockIndex) => {
            if (usedIndexes.has(blockIndex)) return false;
            const id = block.match(/<section[^>]*\bid=["']([^"']+)["']/i)?.[1]?.trim();
            return id === section.id;
        });

        if (matchedIndex === -1 && rawBlocks[index] && !usedIndexes.has(index)) {
            matchedIndex = index;
        }

        if (matchedIndex === -1) return [];
        usedIndexes.add(matchedIndex);

        return [{
            id: section.id,
            title: section.title,
            sourceVideoIds: section.sourceVideoIds,
            html: ensureSectionMarkup({
                rawHtml: rawBlocks[matchedIndex],
                section,
            }),
        }];
    });
}

async function buildSectionBlocksBatch(input: {
    productType: ProductType;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna: CreatorDNA;
    designCanonContext: string;
    architectPlan: ArchitectPlan;
    marketOfferContext?: string | null;
    selectedContexts: KimiPipelineContext[];
}): Promise<KimiSectionBlock[]> {
    if (input.architectPlan.sections.length > KIMI_SECTION_BATCH_ATTEMPT_MAX_SECTIONS) {
        return [];
    }

    const totalWordTarget = input.architectPlan.sections.reduce((sum, section) => sum + section.wordTarget, 0);
    const batchPrompt = input.architectPlan.sections.map((section, index) => [
        `SECTION ${index + 1}`,
        `ID: ${section.id}`,
        `TITLE: ${section.title}`,
        `OBJECTIVE: ${section.objective}`,
        `LAYOUT HINT: ${section.layoutHint}`,
        `REQUIRED ELEMENTS: ${section.requiredElements.join(', ') || 'grounded teaching, clear hierarchy'}`,
        `WORD TARGET: ${section.wordTarget}`,
        `SOURCE IDS: ${section.sourceVideoIds.join(', ')}`,
        `EVIDENCE:\n${evidenceForSection(section, input.selectedContexts)}`,
    ].join('\n')).join('\n\n');

    const rawHtml = await withSoftTimeout(
        requestKimiTextCompletion({
            systemPrompt: `You are the Owny Kimi Batch Section Builder.
Write every requested section of a premium creator digital product in one response.

Rules:
- Output ONLY concatenated HTML <section> blocks in the exact order requested.
- For every section, start with <!-- sources: ... --> on the line above the section.
- Every section must use the exact id provided.
- No markdown fences. No <html>, <head>, or <body>.
- Use clean shadcn-style Tailwind classes with clear hierarchy.
- If the product type is checklist_toolkit, keep checklist controls genuinely interactive.`,
            userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
CREATOR MOOD: ${input.creatorDna.visual.mood}
PRODUCT SHELL: ${input.architectPlan.shell.layoutStyle}; ${input.architectPlan.shell.visualHierarchy}; ${input.architectPlan.shell.interactionModel}
${input.marketOfferContext ? `\n${input.marketOfferContext}\n` : ''}

DESIGN CANON:
${input.designCanonContext}

${productScaffoldGuidance(input.productType)}
${sectionFormatGuidance(input.productType)}

CREATOR VOICE:
- Tone: ${input.creatorDna.voice.tone}
- Vocabulary: ${input.creatorDna.voice.vocabulary}
- Speaking style: ${input.creatorDna.voice.speakingStyle}
- Content focus: ${input.creatorDna.voice.contentFocus}

SECTION BRIEFS:
${batchPrompt}

Return every section now as concatenated HTML blocks in the same order as the section briefs.`,
            maxTokens: estimateSectionCompletionMaxTokens({
                sections: input.architectPlan.sections.length,
                totalWordTarget,
            }),
            thinking: 'disabled',
            preset: 'creative_html',
            operation: 'builder.sections.batch',
        }),
        KIMI_SECTION_BATCH_SOFT_TIMEOUT_MS
    );

    if (!rawHtml) {
        log.warn('Kimi batched section builder timed out softly; falling back to per-section generation', {
            productType: input.productType,
            timeoutMs: KIMI_SECTION_BATCH_SOFT_TIMEOUT_MS,
            sectionCount: input.architectPlan.sections.length,
        });
        return [];
    }

    return extractGeneratedSectionBlocks({
        rawHtml,
        sections: input.architectPlan.sections,
    });
}

async function buildKimiLibrarianPack(input: {
    productType: ProductType;
    productTitle: string;
    topicQuery: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDnaContext: string;
    designCanonContext: string;
    marketOfferContext?: string | null;
    selectedContexts: KimiPipelineContext[];
}): Promise<LibrarianPack> {
    const librarianContexts = input.selectedContexts.slice(0, 6);
    const seededPack = buildDeterministicLibrarianPack({
        productType: input.productType,
        productTitle: input.productTitle,
        topicQuery: input.topicQuery,
        selectedContexts: librarianContexts,
    });
    try {
        const parsed = await withSoftTimeout(
            requestKimiStructuredObject({
                systemPrompt: `You are the Owny Kimi Librarian.
Your job is to inspect creator transcript evidence and choose the strongest material for a premium digital product.
Return only a JSON object.

Rules:
- Stay grounded in the provided creator evidence.
- Select only source video IDs that truly support the requested product.
- Favor specific, actionable, creator-native material over generic quotes.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
PRODUCT TITLE: ${input.productTitle}
TOPIC: ${input.topicQuery}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})

${input.creatorDnaContext}
${input.designCanonContext}
${input.marketOfferContext ? `\n${input.marketOfferContext}\n` : ''}

SOURCE LIBRARY:
${compactContext(librarianContexts, 6, 750)}

Return a JSON object with:
- productAngle
- audiencePromise
- selectedVideoIds
- evidenceRows [{ videoId, title, whyItMatters, anchorQuote, extractionFocus[], sectionTitle, sectionObjective }]

Aim for at least ${sectionCountTarget(input.productType)} evidenceRows when the source library supports it.`,
                schema: LibrarianPackSchema,
                maxTokens: 1800,
                thinking: 'enabled',
                preset: 'analysis_json',
                operation: 'builder.librarian_pack',
            }),
            KIMI_LIBRARIAN_SOFT_TIMEOUT_MS
        );

        if (!parsed) {
            log.warn('Kimi librarian pack timed out softly; using deterministic pack', {
                topicQuery: input.topicQuery,
                productType: input.productType,
                timeoutMs: KIMI_LIBRARIAN_SOFT_TIMEOUT_MS,
            });
            return seededPack;
        }

        const availableIds = new Set(librarianContexts.map((row) => row.videoId));
        const selectedVideoIds = parsed.selectedVideoIds.filter((id) => availableIds.has(id));
        const targetRowCount = Math.max(4, sectionCountTarget(input.productType));
        const parsedRows = parsed.evidenceRows
            .filter((row) => availableIds.has(row.videoId))
            .slice(0, 8);
        const missingSeedRows = seededPack.evidenceRows
            .filter((row) => !parsedRows.some((parsedRow) => parsedRow.videoId === row.videoId))
            .slice(0, Math.max(0, targetRowCount - parsedRows.length));

        return {
            productAngle: parsed.productAngle.trim() || seededPack.productAngle,
            audiencePromise: parsed.audiencePromise.trim() || seededPack.audiencePromise,
            selectedVideoIds: selectedVideoIds.length > 0 ? selectedVideoIds : seededPack.selectedVideoIds,
            evidenceRows: [...parsedRows, ...missingSeedRows].slice(0, 8),
        };
    } catch (error) {
        log.warn('Kimi librarian pack failed; using deterministic fallback', {
            topicQuery: input.topicQuery,
            productType: input.productType,
            error: error instanceof Error ? error.message : 'Unknown librarian error',
        });
        return buildFallbackLibrarianPack({
            productType: input.productType,
            productTitle: input.productTitle,
            topicQuery: input.topicQuery,
            selectedContexts: librarianContexts,
        });
    }
}

function buildArchitectPlanFromLibrarian(input: {
    productType: ProductType;
    productTitle: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creativeDirection: CreativeDirection;
    librarianPack: LibrarianPack;
    marketOfferBrief?: MarketOfferBrief | null;
    selectedContexts: KimiPipelineContext[];
}): ArchitectPlan {
    const prefix = sectionPrefix(input.productType);
    const offerAngle = input.marketOfferBrief?.offerAngle?.trim();
    const promiseStyle = input.marketOfferBrief?.promiseStyle?.trim();
    const packagingNotes = input.marketOfferBrief?.packagingNotes?.slice(0, 3) || [];
    const differentiationHooks = input.marketOfferBrief?.differentiationHooks?.slice(0, 3) || [];

    return normalizeArchitectPlan(
        {
            title: input.productTitle,
            subtitle: offerAngle
                || promiseStyle
                || input.librarianPack.audiencePromise
                || input.creativeDirection.narrativeAngle,
            shell: {
                eyebrow: 'Owny Studio',
                layoutStyle: input.creativeDirection.layoutDNA,
                navStyle: input.creativeDirection.interactionDNA,
                visualHierarchy: input.creativeDirection.typographyDNA,
                interactionModel: input.creativeDirection.interactionDNA,
                composerNotes: input.creativeDirection.signatureMoves.join('; '),
            },
            sections: input.librarianPack.evidenceRows.slice(0, sectionCountTarget(input.productType)).map((row, index) => ({
                id: `${prefix}-${index + 1}`,
                title: row.sectionTitle?.trim() || row.title || `${prefix} ${index + 1}`,
                objective: row.sectionObjective?.trim() || row.whyItMatters || `Deliver a concrete lesson for ${input.productTitle}.`,
                sourceVideoIds: [row.videoId],
                layoutHint: `Use a premium ${input.productType} section with clear hierarchy and grounded teaching.`,
                requiredElements: row.extractionFocus.length > 0 ? row.extractionFocus.slice(0, 4) : ['real creator evidence', 'actionable takeaway'],
                wordTarget: input.productType === 'checklist_toolkit' ? 350 : 450,
            })),
            keyTakeaways: input.librarianPack.evidenceRows
                .slice(0, 5)
                .map((row) => row.sectionTitle || row.whyItMatters)
                .filter(Boolean)
                .concat(packagingNotes)
                .concat(differentiationHooks)
                .slice(0, 6),
            faq: [],
        },
        input.selectedContexts,
        input.productType,
        input.productTitle,
        offerAngle
            || promiseStyle
            || input.librarianPack.audiencePromise
            || input.creativeDirection.narrativeAngle
    );
}

async function buildSectionBlock(input: {
    productType: ProductType;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna: CreatorDNA;
    designCanonContext: string;
    architectPlan: ArchitectPlan;
    section: ArchitectSection;
    marketOfferContext?: string | null;
    selectedContexts: KimiPipelineContext[];
}): Promise<KimiSectionBlock> {
    const artDirectionContext = buildSectionArtDirectionContext({
        architectPlan: input.architectPlan,
        designCanonContext: input.designCanonContext,
    });
    const html = await requestKimiTextCompletion({
        systemPrompt: `You are the Owny Kimi Section Builder.
Write one premium section of a creator digital product.

Rules:
- Output ONLY a single HTML <section> block.
- Start with <!-- sources: ... --> on the line above the section.
- The section must use the exact id provided.
- Use clean shadcn-style Tailwind classes: rounded-2xl or rounded-[28px], border, bg-white or bg-card, shadow-sm.
- If the product type is checklist_toolkit, the checklist must actually work when clicked. Use real checkbox inputs, labels, and visible checked states.
- No markdown fences. No full document. No <html>, <head>, or <body>.
- Make the section substantial and specific, but avoid fluff.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
CREATOR MOOD: ${input.creatorDna.visual.mood}
SECTION ID: ${input.section.id}
SECTION TITLE: ${input.section.title}
SECTION OBJECTIVE: ${input.section.objective}
LAYOUT HINT: ${input.section.layoutHint}
REQUIRED ELEMENTS: ${input.section.requiredElements.join(', ')}
WORD TARGET: ${input.section.wordTarget}

SECTION EVIDENCE:
${evidenceForSection(input.section, input.selectedContexts)}

OVERALL PRODUCT SHELL:
${JSON.stringify(input.architectPlan.shell, null, 2)}
${input.marketOfferContext ? `\n${input.marketOfferContext}\n` : ''}

ART DIRECTION:
${artDirectionContext}

${productScaffoldGuidance(input.productType)}
${sectionFormatGuidance(input.productType)}

CREATOR VOICE:
- Tone: ${input.creatorDna.voice.tone}
- Vocabulary: ${input.creatorDna.voice.vocabulary}
- Speaking style: ${input.creatorDna.voice.speakingStyle}
- Content focus: ${input.creatorDna.voice.contentFocus}
- Catchphrases: ${input.creatorDna.voice.catchphrases.join(', ') || 'none'}

Return the section HTML now.`,
        maxTokens: estimateSingleSectionMaxTokens({
            productType: input.productType,
            wordTarget: input.section.wordTarget,
        }),
        thinking: 'disabled',
        preset: 'creative_html',
        operation: `builder.section.${input.section.id}`,
    });

    return {
        id: input.section.id,
        title: input.section.title,
        sourceVideoIds: input.section.sourceVideoIds,
        html,
    };
}

function buildFallbackSectionBlock(input: {
    productType: ProductType;
    section: ArchitectSection;
    selectedContexts: KimiPipelineContext[];
}): KimiSectionBlock {
    const matches = input.selectedContexts.filter((row) => input.section.sourceVideoIds.includes(row.videoId)).slice(0, 2);
    const contexts = matches.length > 0 ? matches : input.selectedContexts.slice(0, 2);
    const sourceIds = contexts.map((row) => row.videoId);
    const quote = contexts[0]?.transcriptContext
        ? firstTranscriptSentence(contexts[0].transcriptContext)
        : input.section.objective;
    const bulletItems = Array.from(new Set(
        contexts.flatMap((row) => (row.keySteps.length > 0 ? row.keySteps : row.topicTags))
    )).slice(0, input.productType === 'checklist_toolkit' ? 5 : 4);

    const bodyHtml = input.productType === 'checklist_toolkit'
        ? `
        <div class="mt-5 space-y-3">
          ${bulletItems.map((item, index) => `
            <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <input type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" />
              <span>
                <span class="block text-sm font-semibold text-slate-900">${escapeHtml(item || `Checklist item ${index + 1}`)}</span>
                <span class="mt-1 block text-sm leading-6 text-slate-600">Apply this inside your own workflow before moving to the next step.</span>
              </span>
            </label>
          `).join('\n')}
        </div>`
        : `
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">
          ${bulletItems.map((item) => `
            <li class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">${escapeHtml(item)}</li>
          `).join('\n')}
        </ul>`;

    return {
        id: input.section.id,
        title: input.section.title,
        sourceVideoIds: sourceIds,
        html: `<!-- sources: ${sourceIds.join(',')} -->
<section id="${escapeHtml(input.section.id)}" class="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-6 shadow-sm backdrop-blur sm:px-6">
  <div class="max-w-3xl">
    <div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">${escapeHtml(input.section.id.replace(/-/g, ' '))}</div>
    <h2 class="mt-4 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(input.section.title)}</h2>
    <p class="mt-3 text-base leading-8 text-slate-600">${escapeHtml(input.section.objective)}</p>
    <blockquote class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
      ${escapeHtml(quote)}
    </blockquote>
    ${bodyHtml}
    <p class="mt-5 text-sm leading-7 text-slate-600">Use this section as a concrete checkpoint inside the larger system rather than a generic inspirational note.</p>
  </div>
</section>`,
    };
}

function buildPageShell(input: {
    productType: ProductType;
    productTitle: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna: CreatorDNA;
    creativeDirection: CreativeDirection;
    architectPlan: ArchitectPlan;
}): KimiPageShell {
    const title = escapeHtml(input.architectPlan.title || input.productTitle);
    const subtitle = escapeHtml(input.architectPlan.subtitle || input.creativeDirection.narrativeAngle);
    const eyebrow = escapeHtml(input.architectPlan.shell.eyebrow);
    const signatureMove = escapeHtml(
        input.creativeDirection.signatureMoves[0] || input.architectPlan.shell.composerNotes
    );
    const navLinks = input.architectPlan.sections
        .map((section) => {
            const sectionTitle = escapeHtml(section.title);
            return `<a href="#${section.id}" class="rounded-full border border-slate-200 bg-white/88 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900">${sectionTitle}</a>`;
        })
        .join('\n');
    const takeaways = input.architectPlan.keyTakeaways
        .slice(0, 3)
        .map((item) => `<li class="rounded-2xl border border-white/70 bg-white/72 px-3 py-2 text-sm text-slate-600 shadow-sm backdrop-blur">${escapeHtml(item)}</li>`)
        .join('\n');

    return {
        bodyClasses: 'min-h-screen bg-[var(--creator-surface)] text-[var(--creator-text)] antialiased',
        backgroundHtml: `
    <div class="absolute inset-0 -z-10 overflow-hidden">
      <div class="absolute left-[-8rem] top-[-7rem] h-64 w-64 rounded-full blur-3xl opacity-35" style="background: color-mix(in srgb, var(--creator-primary) 72%, white);"></div>
      <div class="absolute right-[-6rem] top-20 h-72 w-72 rounded-full blur-3xl opacity-25" style="background: color-mix(in srgb, var(--creator-secondary) 68%, white);"></div>
      <div class="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-white/72 via-white/35 to-transparent"></div>
      <div class="absolute inset-0 opacity-[0.16]" style="background-image: radial-gradient(circle at 1px 1px, rgba(15,23,42,0.12) 1px, transparent 0); background-size: 26px 26px;"></div>
    </div>`.trim(),
        heroHtml: `
      <section class="overflow-hidden rounded-[32px] border border-white/80 bg-white/78 px-6 py-7 shadow-soft backdrop-blur sm:px-8 sm:py-9">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm">${eyebrow}</div>
            <h1 class="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">${title}</h1>
            <p class="mt-4 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">${subtitle}</p>
          </div>
          <div class="max-w-sm rounded-[28px] border border-slate-200 bg-white/88 p-5 shadow-sm">
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Creator signal</p>
            <p class="mt-3 text-sm leading-7 text-slate-700">Built from ${escapeHtml(input.creatorDisplayName)}'s real library with a ${escapeHtml(input.creativeDirection.name.toLowerCase())} art direction. ${signatureMove}</p>
          </div>
        </div>
        ${takeaways ? `<ul class="mt-6 grid gap-2 sm:grid-cols-3">${takeaways}</ul>` : ''}
      </section>`.trim(),
        navHtml: `
      <nav class="sticky top-4 z-20 mt-5 overflow-x-auto pb-1">
        <div class="flex min-w-max items-center gap-2 rounded-full border border-white/80 bg-white/72 px-3 py-2 shadow-sm backdrop-blur">
          ${navLinks}
        </div>
      </nav>`.trim(),
        footerHtml: `
      <footer class="mt-8 rounded-[28px] border border-white/80 bg-white/72 px-5 py-5 text-sm text-slate-600 shadow-sm backdrop-blur">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>Crafted from @${escapeHtml(input.creatorHandle)} with Owny Studio.</p>
          <p class="text-slate-500">${escapeHtml(productScaffoldGuidance(input.productType))}</p>
        </div>
      </footer>`.trim(),
    };
}

function assembleProductHtml(input: {
    productTitle: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna: CreatorDNA;
    pageShell: KimiPageShell;
    sectionBlocks: KimiSectionBlock[];
}): string {
    const sectionsHtml = input.sectionBlocks.map((section) => section.html.trim()).join('\n\n');
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        `  <title>${input.productTitle} | ${input.creatorDisplayName}</title>`,
        '  <script src="https://cdn.tailwindcss.com"></script>',
        '  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>',
        '  <link rel="preconnect" href="https://fonts.googleapis.com" />',
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
        '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />',
        '  <script>',
        '    tailwind.config = {',
        '      theme: {',
        '        extend: {',
        "          fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },",
        '          boxShadow: { soft: "0 18px 45px -24px rgba(15, 23, 42, 0.28)" }',
        '        }',
        '      }',
        '    };',
        '  </script>',
        '  <style>',
        '    :root {',
        `      --creator-primary: ${input.creatorDna.visual.primaryColor};`,
        `      --creator-secondary: ${input.creatorDna.visual.secondaryColor};`,
        `      --creator-surface: ${input.creatorDna.visual.backgroundColor};`,
        `      --creator-text: ${input.creatorDna.visual.textColor};`,
        '    }',
        '  </style>',
        '</head>',
        ` <body class="${input.pageShell.bodyClasses || 'min-h-screen bg-slate-50 text-slate-950'}">`,
        '  <div class="relative isolate overflow-hidden">',
        input.pageShell.backgroundHtml,
        '    <div class="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">',
        `      <div class="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">Built with ${input.creatorDisplayName} · @${input.creatorHandle}</div>`,
        input.pageShell.heroHtml,
        input.pageShell.navHtml,
        '      <main class="mt-6 flex flex-col gap-4 sm:gap-5">',
        sectionsHtml,
        '      </main>',
        input.pageShell.footerHtml,
        '    </div>',
        '  </div>',
        '</body>',
        '</html>',
    ].join('\n');
}

export async function runKimiSectionedProductPipeline(input: {
    productType: ProductType;
    productTitle: string;
    topicQuery: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna: CreatorDNA;
    creatorDnaContext: string;
    designCanonContext: string;
    marketOfferContext?: string | null;
    marketOfferBrief?: MarketOfferBrief | null;
    creativeDirection: CreativeDirection;
    selectedContexts: KimiPipelineContext[];
}): Promise<KimiSectionedProductPipelineResult> {
    const stageTimingsMs: Record<string, number> = {};
    const totalStart = Date.now();

    const librarianStart = Date.now();
    const librarianPack = await withTimeout(
        buildKimiLibrarianPack({
            productType: input.productType,
            productTitle: input.productTitle,
            topicQuery: input.topicQuery,
            creatorDisplayName: input.creatorDisplayName,
            creatorHandle: input.creatorHandle,
            creatorDnaContext: input.creatorDnaContext,
            designCanonContext: input.designCanonContext,
            marketOfferContext: input.marketOfferContext,
            selectedContexts: input.selectedContexts,
        }),
        KIMI_LIBRARIAN_TIMEOUT_MS,
        'Kimi librarian'
    );
    stageTimingsMs.librarian = Date.now() - librarianStart;

    const preferredIds = new Set(librarianPack.selectedVideoIds);
    const workingContexts = [
        ...input.selectedContexts.filter((row) => preferredIds.has(row.videoId)),
        ...input.selectedContexts.filter((row) => !preferredIds.has(row.videoId)),
    ].slice(0, Math.max(6, sectionCountTarget(input.productType)));

    const architectPlan = buildArchitectPlanFromLibrarian({
        productType: input.productType,
        productTitle: input.productTitle,
        creatorDisplayName: input.creatorDisplayName,
        creatorHandle: input.creatorHandle,
        creativeDirection: input.creativeDirection,
        librarianPack,
        marketOfferBrief: input.marketOfferBrief,
        selectedContexts: workingContexts,
    });

    const sectionsStart = Date.now();
    const batchStart = Date.now();
    const batchedSectionBlocks = await buildSectionBlocksBatch({
        productType: input.productType,
        creatorDisplayName: input.creatorDisplayName,
        creatorHandle: input.creatorHandle,
        creatorDna: input.creatorDna,
        designCanonContext: input.designCanonContext,
        architectPlan,
        marketOfferContext: input.marketOfferContext,
        selectedContexts: workingContexts,
    });
    stageTimingsMs.sectionsBatch = Date.now() - batchStart;

    const batchedById = new Map(batchedSectionBlocks.map((section) => [section.id, section]));
    const missingSections = architectPlan.sections.filter((section) => !batchedById.has(section.id));
    const fallbackSectionBlocks = await Promise.all(
        missingSections.map(async (section) => {
            try {
                return await withTimeout(
                    buildSectionBlock({
                        productType: input.productType,
                        creatorDisplayName: input.creatorDisplayName,
                        creatorHandle: input.creatorHandle,
                        creatorDna: input.creatorDna,
                        designCanonContext: input.designCanonContext,
                        architectPlan,
                        section,
                        marketOfferContext: input.marketOfferContext,
                        selectedContexts: workingContexts,
                    }),
                    KIMI_SECTION_TIMEOUT_MS,
                    `Kimi section ${section.id}`
                );
            } catch (error) {
                log.warn('Kimi section builder failed; using deterministic fallback', {
                    sectionId: section.id,
                    productType: input.productType,
                    error: error instanceof Error ? error.message : 'Unknown section error',
                });
                return buildFallbackSectionBlock({
                    productType: input.productType,
                    section,
                    selectedContexts: workingContexts,
                });
            }
        })
    );
    const fallbackById = new Map(fallbackSectionBlocks.map((section) => [section.id, section]));
    const sectionBlocks = architectPlan.sections.map((section) => (
        batchedById.get(section.id)
        || fallbackById.get(section.id)
        || buildFallbackSectionBlock({
            productType: input.productType,
            section,
            selectedContexts: workingContexts,
        })
    ));
    stageTimingsMs.sections = Date.now() - sectionsStart;

    const shellStart = Date.now();
    const pageShell = buildPageShell({
        productType: input.productType,
        productTitle: input.productTitle,
        creatorDisplayName: input.creatorDisplayName,
        creatorHandle: input.creatorHandle,
        creatorDna: input.creatorDna,
        creativeDirection: input.creativeDirection,
        architectPlan,
    });
    stageTimingsMs.shell = Date.now() - shellStart;

    const html = assembleProductHtml({
        productTitle: input.productTitle,
        creatorDisplayName: input.creatorDisplayName,
        creatorHandle: input.creatorHandle,
        creatorDna: input.creatorDna,
        pageShell,
        sectionBlocks,
    });
    stageTimingsMs.total = Date.now() - totalStart;

    return {
        html: input.productType === 'checklist_toolkit'
            ? ensureChecklistDocumentInteractivity(html)
            : html,
        librarianPack,
        architectPlan,
        sectionBlocks,
        stageTimingsMs,
    };
}
