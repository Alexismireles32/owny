import { z } from 'zod';
import type { ProductType } from '@/types/build-packet';
import type { CreatorDNA } from '@/lib/ai/creator-dna';
import type { CreativeDirection } from '@/lib/ai/design-canon';
import { requestKimiStructuredObject, requestKimiTextCompletion } from '@/lib/ai/kimi-structured';
import { ensureChecklistDocumentInteractivity } from '@/lib/ai/checklist-interactivity';

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
            return 'The finished product should read like a premium guide with a table of contents, chapter rhythm, and calm editorial pacing.';
        case 'mini_course':
            return 'The finished product should feel like a premium mini-course with module navigation, lesson pacing, and clear action steps.';
        case 'challenge_7day':
            return 'The finished product should feel like a 7-day guided challenge with day navigation, progressive tasks, and momentum.';
        case 'checklist_toolkit':
            return 'The finished product should feel like a premium checklist toolkit with categories, scannable execution steps, and progress logic.';
        default:
            return 'The finished product should feel like a premium creator product.';
    }
}

function sectionFormatGuidance(productType: ProductType): string {
    switch (productType) {
        case 'checklist_toolkit':
            return 'Build the section with a short grounding paragraph, a checklist of 4-6 concrete items with one-sentence explanations, and a closing takeaway. Each item must be rendered as a clickable checklist row using real checkbox controls or an equivalent accessible toggle pattern.';
        case 'mini_course':
            return 'Build the section with a concise lesson intro, 2-3 teaching blocks, and a practical action step.';
        case 'challenge_7day':
            return 'Build the section with a day intention, 2-4 concrete steps, and a short completion reflection.';
        case 'pdf_guide':
        default:
            return 'Build the section with a thoughtful intro, a few concrete teaching blocks, and a clear takeaway.';
    }
}

function compactContext(contexts: KimiPipelineContext[], limit = 8, maxChars = 1200): string {
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
        wordTarget: 180,
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
            wordTarget: productType === 'checklist_toolkit' ? 170 : 190,
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
                wordTarget: Math.max(140, Math.min(500, section.wordTarget || (productType === 'checklist_toolkit' ? 170 : 180))),
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
    const matches = contexts.filter((row) => section.sourceVideoIds.includes(row.videoId)).slice(0, 2);
    return compactContext(matches.length > 0 ? matches : contexts.slice(0, 2), 2, 600);
}

async function buildKimiLibrarianPack(input: {
    productType: ProductType;
    productTitle: string;
    topicQuery: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDnaContext: string;
    selectedContexts: KimiPipelineContext[];
}): Promise<LibrarianPack> {
    const librarianContexts = input.selectedContexts.slice(0, 6);
    const parsed = await requestKimiStructuredObject({
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
        thinking: 'disabled',
    });

    const availableIds = new Set(librarianContexts.map((row) => row.videoId));
    const selectedVideoIds = parsed.selectedVideoIds.filter((id) => availableIds.has(id));

    return {
        productAngle: parsed.productAngle.trim(),
        audiencePromise: parsed.audiencePromise.trim(),
        selectedVideoIds: selectedVideoIds.length > 0 ? selectedVideoIds : librarianContexts.slice(0, 5).map((row) => row.videoId),
        evidenceRows: parsed.evidenceRows
            .filter((row) => availableIds.has(row.videoId))
            .slice(0, 8),
    };
}

function buildArchitectPlanFromLibrarian(input: {
    productType: ProductType;
    productTitle: string;
    creatorDisplayName: string;
    creatorHandle: string;
    creativeDirection: CreativeDirection;
    librarianPack: LibrarianPack;
    selectedContexts: KimiPipelineContext[];
}): ArchitectPlan {
    const prefix = sectionPrefix(input.productType);
    return normalizeArchitectPlan(
        {
            title: input.productTitle,
            subtitle: input.librarianPack.audiencePromise || input.creativeDirection.narrativeAngle,
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
                wordTarget: input.productType === 'checklist_toolkit' ? 140 : 180,
            })),
            keyTakeaways: input.librarianPack.evidenceRows
                .slice(0, 5)
                .map((row) => row.sectionTitle || row.whyItMatters)
                .filter(Boolean),
            faq: [],
        },
        input.selectedContexts,
        input.productType,
        input.productTitle,
        input.librarianPack.audiencePromise || input.creativeDirection.narrativeAngle
    );
}

async function buildSectionBlock(input: {
    productType: ProductType;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna: CreatorDNA;
    architectPlan: ArchitectPlan;
    section: ArchitectSection;
    selectedContexts: KimiPipelineContext[];
}): Promise<KimiSectionBlock> {
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

${productScaffoldGuidance(input.productType)}
${sectionFormatGuidance(input.productType)}

CREATOR VOICE:
- Tone: ${input.creatorDna.voice.tone}
- Vocabulary: ${input.creatorDna.voice.vocabulary}
- Speaking style: ${input.creatorDna.voice.speakingStyle}
- Content focus: ${input.creatorDna.voice.contentFocus}
- Catchphrases: ${input.creatorDna.voice.catchphrases.join(', ') || 'none'}

Return the section HTML now.`,
        maxTokens: 1800,
        thinking: 'disabled',
    });

    return {
        id: input.section.id,
        title: input.section.title,
        sourceVideoIds: input.section.sourceVideoIds,
        html,
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
            selectedContexts: input.selectedContexts,
        }),
        45_000,
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
        selectedContexts: workingContexts,
    });

    const sectionsStart = Date.now();
    const sectionBlocks = await Promise.all(
        architectPlan.sections.map((section) =>
            withTimeout(
                buildSectionBlock({
                    productType: input.productType,
                    creatorDisplayName: input.creatorDisplayName,
                    creatorHandle: input.creatorHandle,
                    creatorDna: input.creatorDna,
                    architectPlan,
                    section,
                    selectedContexts: workingContexts,
                }),
                70_000,
                `Kimi section ${section.id}`
            )
        )
    );
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
