import { z } from 'zod';
import type { ProductType } from '@/types/build-packet';
import type { CreatorDNA } from '@/lib/ai/creator-dna';
import { requestKimiStructuredObject, requestKimiTextCompletion } from '@/lib/ai/kimi-structured';
import { postProcessHTML } from '@/lib/ai/post-process-html';
import { ensureChecklistDocumentInteractivity } from '@/lib/ai/checklist-interactivity';

export interface SectionSlice {
    id: string;
    title: string;
    rawHtml: string;
    sourceVideoIds: string[];
}

interface ImprovePlan {
    scope: 'single' | 'multi' | 'global';
    targetSectionIds: string[];
    shellChange: boolean;
    strategy: string;
}

export interface KimiSectionedImproveResult {
    html: string;
    htmlBuildMode: 'kimi-improve-sectioned' | 'kimi-improve-monolith';
    touchedSectionIds: string[];
    stageTimingsMs: Record<string, number>;
}

export interface KimiSectionedImproveInput {
    currentHtml: string;
    instruction: string;
    productType: ProductType;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna?: CreatorDNA | null;
    designCanonContext?: string | null;
    globalEvidenceContext?: string | null;
    sourceEvidenceByVideoId?: Record<string, string> | null;
}

const ImprovePlanSchema = z.object({
    scope: z.enum(['single', 'multi', 'global']).default('global'),
    targetSectionIds: z.array(z.string()).default([]),
    shellChange: z.boolean().default(false),
    strategy: z.string().default(''),
});

const SHELL_CHANGE_PATTERNS = [
    /\bmain page\b/i,
    /\binitial page\b/i,
    /\bfirst page\b/i,
    /\bopening page\b/i,
    /\bhero\b/i,
    /\bheader\b/i,
    /\bcover\b/i,
    /\babove the fold\b/i,
    /\blayout\b/i,
    /\bredesign\b/i,
    /\bpage-wide\b/i,
    /\boverall\b/i,
    /\bvisual\b/i,
    /\bstyle\b/i,
    /\btheme\b/i,
    /\bbackground\b/i,
    /\bnavigation\b/i,
    /\bframing\b/i,
];

const CONTENT_CHANGE_PATTERNS = [
    /\bcopy\b/i,
    /\bcontent\b/i,
    /\btext\b/i,
    /\bwording\b/i,
    /\bsection\b/i,
    /\bchapter\b/i,
    /\bmodule\b/i,
    /\bday\b/i,
    /\bcategory\b/i,
    /\bchecklist item\b/i,
    /\bparagraph\b/i,
];

const OPENING_TARGET_PATTERNS = [
    /\bopening\b/i,
    /\bintro\b/i,
    /\bintroduction\b/i,
    /\bfirst section\b/i,
    /\bfirst module\b/i,
    /\bstart\b/i,
    /\bbeginning\b/i,
    /\bhero\b/i,
    /\bcover\b/i,
];

const CLOSING_TARGET_PATTERNS = [
    /\bfinal\b/i,
    /\bclosing\b/i,
    /\bending\b/i,
    /\boutro\b/i,
    /\bconclusion\b/i,
    /\blast section\b/i,
    /\blast module\b/i,
    /\bcall to action\b/i,
    /\bcta\b/i,
    /\bnext step\b/i,
];

const GLOBAL_SCOPE_PATTERNS = [
    /\bwhole\b/i,
    /\bentire\b/i,
    /\bevery section\b/i,
    /\ball sections\b/i,
    /\bthroughout\b/i,
    /\bacross the (?:whole )?(?:product|page|document)\b/i,
    /\bglobal\b/i,
    /\bpage-wide\b/i,
];

function inferProductTitle(html: string): string {
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    if (title) return title.replace(/\s+\|.+$/, '').trim();
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return h1 || 'Digital Product';
}

function withTiming<T>(timings: Record<string, number>, key: string, work: Promise<T>): Promise<T> {
    const start = Date.now();
    return work.finally(() => {
        timings[key] = Date.now() - start;
    });
}

function parseSourceIds(rawHtml: string): string[] {
    const comment = rawHtml.match(/<!--\s*sources:\s*([\s\S]*?)-->/i)?.[1] || '';
    return comment
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function extractSourceComment(rawHtml: string): string | null {
    return rawHtml.match(/<!--\s*sources:\s*[\s\S]*?-->/i)?.[0]?.trim() || null;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractSections(html: string): SectionSlice[] {
    const matches = html.matchAll(/((?:<!--\s*sources:\s*[\s\S]*?-->\s*)?<section\b[\s\S]*?<\/section>)/gi);
    const sections: SectionSlice[] = [];

    for (const match of matches) {
        const rawHtml = match[1];
        if (!rawHtml) continue;
        const id = rawHtml.match(/<section[^>]*\bid=["']([^"']+)["']/i)?.[1]?.trim();
        if (!id) continue;
        const title = rawHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]
            ?.replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || id;
        sections.push({
            id,
            title,
            rawHtml,
            sourceVideoIds: parseSourceIds(rawHtml),
        });
    }

    return sections;
}

export function coerceImprovedSectionHtml(input: {
    candidateHtml: string;
    originalSection: SectionSlice;
}): string {
    const cleaned = input.candidateHtml
        .trim()
        .replace(/^```html\s*/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();
    const matches = Array.from(
        cleaned.matchAll(/((?:<!--\s*sources:\s*[\s\S]*?-->\s*)?<section\b[\s\S]*?<\/section>)/gi)
    );
    let selected = matches.find((match) => {
        const block = match[1];
        const id = block.match(/<section[^>]*\bid=["']([^"']+)["']/i)?.[1]?.trim();
        return id === input.originalSection.id;
    })?.[1] || matches[0]?.[1];

    if (!selected) {
        return input.originalSection.rawHtml;
    }

    const expectedSectionPattern = new RegExp(
        `<section[^>]*\\bid=["']${escapeRegExp(input.originalSection.id)}["']`,
        'i'
    );
    if (!expectedSectionPattern.test(selected)) {
        if (/<section[^>]*\bid=["'][^"']+["']/i.test(selected)) {
            selected = selected.replace(
                /(<section[^>]*\bid=["'])([^"']+)(["'])/i,
                `$1${input.originalSection.id}$3`
            );
        } else {
            selected = selected.replace(
                /<section\b/i,
                `<section id="${input.originalSection.id}"`
            );
        }
    }

    const originalSourceComment = extractSourceComment(input.originalSection.rawHtml);
    if (originalSourceComment && !/<!--\s*sources:\s*[\s\S]*?-->/i.test(selected)) {
        selected = `${originalSourceComment}\n${selected.trim()}`;
    }

    return selected.trim();
}

function normalizeReference(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferShellChange(instruction: string): boolean {
    return SHELL_CHANGE_PATTERNS.some((pattern) => pattern.test(instruction));
}

function inferContentChange(instruction: string): boolean {
    return CONTENT_CHANGE_PATTERNS.some((pattern) => pattern.test(instruction));
}

function inferHintedSectionIds(input: {
    instruction: string;
    sections: SectionSlice[];
}): string[] {
    const normalizedInstruction = normalizeReference(input.instruction);
    const hinted = new Set<string>();

    const addSectionsMatchingPattern = (pattern: RegExp, fallbackIndex: number) => {
        const matches = input.sections.filter((section) => pattern.test(`${section.id} ${section.title}`));
        if (matches.length > 0) {
            for (const section of matches) hinted.add(section.id);
            return;
        }

        const fallback = input.sections[fallbackIndex];
        if (fallback) hinted.add(fallback.id);
    };

    if (OPENING_TARGET_PATTERNS.some((pattern) => pattern.test(input.instruction))) {
        addSectionsMatchingPattern(/\b(intro|introduction|opening|hero|cover|start)\b/i, 0);
    }

    if (CLOSING_TARGET_PATTERNS.some((pattern) => pattern.test(input.instruction))) {
        addSectionsMatchingPattern(/\b(final|closing|conclusion|outro|cta|call to action|next step)\b/i, input.sections.length - 1);
    }

    for (const section of input.sections) {
        const normalizedId = normalizeReference(section.id);
        const normalizedTitle = normalizeReference(section.title);
        if (normalizedId && normalizedInstruction.includes(normalizedId)) {
            hinted.add(section.id);
        }
        if (normalizedTitle.length >= 5 && normalizedInstruction.includes(normalizedTitle)) {
            hinted.add(section.id);
        }

        const ordinalMatch = (section.id.match(/(?:section|module|chapter|day|category)-(\d+)/i)
            || section.title.match(/\b(?:section|module|chapter|day|category)\s+(\d+)\b/i));
        if (ordinalMatch?.[1]) {
            const number = ordinalMatch[1];
            for (const label of ['section', 'module', 'chapter', 'day', 'category']) {
                if (normalizedInstruction.includes(`${label} ${number}`)) {
                    hinted.add(section.id);
                    break;
                }
            }
        }
    }

    return Array.from(hinted);
}

function isExplicitlyGlobalInstruction(instruction: string): boolean {
    return GLOBAL_SCOPE_PATTERNS.some((pattern) => pattern.test(instruction));
}

export function buildHeuristicImprovePlan(input: {
    instruction: string;
    sections: SectionSlice[];
}): ImprovePlan | null {
    const shellChange = inferShellChange(input.instruction);
    const contentChange = inferContentChange(input.instruction);
    const explicitGlobal = isExplicitlyGlobalInstruction(input.instruction);
    const hintedSectionIds = inferHintedSectionIds({
        instruction: input.instruction,
        sections: input.sections,
    });

    if (explicitGlobal) {
        return {
            scope: 'global',
            targetSectionIds: [],
            shellChange,
            strategy: shellChange
                ? 'Apply the requested page-wide change consistently across the full product.'
                : 'Refine the full product consistently without changing the core offer.',
        };
    }

    if (shellChange && !contentChange) {
        return {
            scope: 'single',
            targetSectionIds: [],
            shellChange: true,
            strategy: 'Update the page shell and framing only. Leave section content unchanged.',
        };
    }

    if (hintedSectionIds.length > 0) {
        return {
            scope: hintedSectionIds.length === 1 ? 'single' : 'multi',
            targetSectionIds: hintedSectionIds,
            shellChange,
            strategy: shellChange
                ? 'Apply the requested refinement to the referenced sections and adjust page framing only if needed.'
                : 'Refine only the referenced sections and preserve the rest of the product.',
        };
    }

    return null;
}

function estimateCompletionMaxTokens(input: {
    text: string;
    floor: number;
    ceiling: number;
    buffer: number;
    instruction: string;
}): number {
    const expansionRequested = /\b(add|expand|deeper|detail|details|longer|more examples|more depth|rewrite)\b/i
        .test(input.instruction);
    const baseEstimate = Math.ceil(input.text.length / 4) + input.buffer + (expansionRequested ? 220 : 0);
    return Math.max(input.floor, Math.min(input.ceiling, baseEstimate));
}

export function resolveImproveTargeting(input: {
    instruction: string;
    sections: SectionSlice[];
    plan: ImprovePlan;
}): {
    shellChange: boolean;
    shellOnly: boolean;
    targetSectionIds: string[];
    touchedSectionIds: string[];
} {
    const heuristicShellChange = inferShellChange(input.instruction);
    const heuristicContentChange = inferContentChange(input.instruction);
    const shellChange = input.plan.shellChange || heuristicShellChange;
    const shellOnly = shellChange && !heuristicContentChange && input.plan.targetSectionIds.length === 0;

    if (shellOnly) {
        return {
            shellChange,
            shellOnly,
            targetSectionIds: [],
            touchedSectionIds: [],
        };
    }

    const availableIds = new Set(input.sections.map((section) => section.id));
    const modelTargets = input.plan.targetSectionIds.filter((id) => availableIds.has(id));
    const hintedTargets = inferHintedSectionIds({
        instruction: input.instruction,
        sections: input.sections,
    }).filter((id) => availableIds.has(id));

    let targetSectionIds: string[] = [];
    if (modelTargets.length > 0) {
        targetSectionIds = modelTargets;
    } else if (
        hintedTargets.length > 0
        && (input.plan.scope !== 'global' || !isExplicitlyGlobalInstruction(input.instruction))
    ) {
        targetSectionIds = hintedTargets;
    } else if (input.plan.scope === 'global') {
        targetSectionIds = input.sections.map((section) => section.id);
    }

    const touchedSectionIds = targetSectionIds.length > 0
        ? targetSectionIds
        : input.sections.map((section) => section.id);

    return {
        shellChange,
        shellOnly,
        targetSectionIds,
        touchedSectionIds,
    };
}

function buildScopedEvidenceContext(input: {
    sourceVideoIds: string[];
    sourceEvidenceByVideoId?: Record<string, string> | null;
    fallbackContext?: string | null;
    maxItems?: number;
}): string {
    const map = input.sourceEvidenceByVideoId || {};
    const rows = input.sourceVideoIds
        .map((videoId) => map[videoId])
        .filter((value): value is string => Boolean(value))
        .slice(0, input.maxItems ?? 2);

    if (rows.length > 0) {
        return rows.join('\n\n---\n\n').slice(0, 3600);
    }

    return (input.fallbackContext
        || 'No extra creator evidence was loaded. Preserve grounded claims from the existing HTML instead of inventing new lessons.')
        .slice(0, 3600);
}

async function buildImprovePlan(input: {
    instruction: string;
    productType: ProductType;
    sections: SectionSlice[];
}): Promise<ImprovePlan> {
    return requestKimiStructuredObject({
        systemPrompt: `You are the Owny Kimi Improve Planner.
Return only a JSON object.

Choose whether the request should:
- touch one section
- touch multiple sections
- touch the whole product

Mark shellChange true if the instruction asks for any overall layout, hero, cover, initial page, header, navigation, framing, background, or page-wide style changes.
If the user says "main page", "initial page", "first page", "cover", "hero", or asks for the page to feel very different visually, shellChange should be true.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
INSTRUCTION: ${input.instruction}

AVAILABLE SECTIONS:
${input.sections.map((section) => `- ${section.id}: ${section.title}`).join('\n')}

Return:
- scope: single | multi | global
- targetSectionIds: string[]
- shellChange: boolean
- strategy: short string`,
        schema: ImprovePlanSchema,
        maxTokens: 900,
        thinking: 'disabled',
        preset: 'analysis_json',
        operation: 'improve.plan',
    });
}

async function improveSection(input: {
    instruction: string;
    productType: ProductType;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna?: CreatorDNA | null;
    section: SectionSlice;
    allSections: SectionSlice[];
    strategy: string;
    designCanonContext?: string | null;
    sectionEvidenceContext: string;
}): Promise<string> {
    const creatorTone = input.creatorDna?.voice.tone || 'clear and practical';
    const creatorVocabulary = input.creatorDna?.voice.vocabulary || 'specific and grounded';
    const creatorMood = input.creatorDna?.visual.mood || 'clean';
    const maxTokens = estimateCompletionMaxTokens({
        text: input.section.rawHtml,
        floor: 700,
        ceiling: 1600,
        buffer: 180,
        instruction: input.instruction,
    });

    const candidateHtml = await requestKimiTextCompletion({
        systemPrompt: `You are the Owny Kimi Section Refiner.
Improve one section of an existing digital product.

Rules:
- Output ONLY the full updated block for this section.
- Preserve the exact section id.
- Preserve or include the source comment in this format: <!-- sources: video-id-1,video-id-2 -->
- Do not change unrelated sections.
- Keep the result premium, grounded, and creator-specific.
- Do not introduce new lessons, examples, or claims unless they are supported by the provided creator evidence or already present in the current section.
- If the product type is checklist_toolkit, keep the checklist genuinely interactive when clicked. Use real checkbox inputs or an equivalent accessible toggle pattern with visible checked states.
- No markdown fences, no full document.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
CREATOR TONE: ${creatorTone}
CREATOR VOCABULARY: ${creatorVocabulary}
CREATOR MOOD: ${creatorMood}
STRATEGY: ${input.strategy || 'Apply the instruction surgically while keeping the section premium and grounded.'}
${input.designCanonContext ? `\nDESIGN CANON:\n${input.designCanonContext}\n` : ''}

INSTRUCTION:
${input.instruction}

SECTION DIRECTORY:
${input.allSections.map((section) => `- ${section.id}: ${section.title}`).join('\n')}

CURRENT SECTION HTML:
${input.section.rawHtml}

SECTION SOURCE EVIDENCE:
${input.sectionEvidenceContext}

Return the updated section block now.`,
        maxTokens,
        thinking: 'disabled',
        preset: 'surgical_edit',
        operation: `improve.section.${input.section.id}`,
    });

    return coerceImprovedSectionHtml({
        candidateHtml,
        originalSection: input.section,
    });
}

function replaceSections(html: string, improvedSections: Map<string, string>, sections: SectionSlice[]): string {
    let nextHtml = html;
    for (const section of sections) {
        const replacement = improvedSections.get(section.id);
        if (!replacement) continue;
        nextHtml = nextHtml.replace(section.rawHtml, replacement.trim());
    }
    return nextHtml;
}

function withSectionPlaceholders(html: string, sections: SectionSlice[]): string {
    let shellHtml = html;
    for (const section of sections) {
        shellHtml = shellHtml.replace(section.rawHtml, `<!-- OWNY_SECTION:${section.id} -->`);
    }
    return shellHtml;
}

function restoreSectionPlaceholders(html: string, sectionsById: Map<string, string>): string {
    return html.replace(/<!--\s*OWNY_SECTION:([^ ]+)\s*-->/g, (_match, sectionId: string) => (
        sectionsById.get(sectionId.trim()) || `<!-- OWNY_SECTION:${sectionId} -->`
    ));
}

async function improveShell(input: {
    instruction: string;
    productType: ProductType;
    creatorDisplayName: string;
    creatorHandle: string;
    creatorDna?: CreatorDNA | null;
    shellHtml: string;
    sections: SectionSlice[];
    designCanonContext?: string | null;
    globalEvidenceContext?: string | null;
}): Promise<string> {
    const maxTokens = estimateCompletionMaxTokens({
        text: input.shellHtml,
        floor: 1800,
        ceiling: 4800,
        buffer: 420,
        instruction: input.instruction,
    });
    return requestKimiTextCompletion({
        systemPrompt: `You are the Owny Kimi Page Shell Refiner.
Improve only the page-level framing around section placeholders.

Rules:
- The placeholders <!-- OWNY_SECTION:... --> are immutable. Keep them exactly unchanged.
- Do not invent, remove, or rewrite product sections.
- Output the full HTML document.
- Apply only page-level improvements such as hero, framing, navigation, layout rhythm, and atmosphere.
- Do not invent new product lessons or claims; use the evidence only to keep framing aligned with the creator's real material.
- If the user asks for a bigger visual change, make a visibly different hero, header framing, navigation treatment, background atmosphere, and section staging. Do not just swap one sentence.
- No markdown fences.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
CREATOR MOOD: ${input.creatorDna?.visual.mood || 'clean'}
${input.designCanonContext ? `\nDESIGN CANON:\n${input.designCanonContext}\n` : ''}
INSTRUCTION: ${input.instruction}

GLOBAL CREATOR EVIDENCE:
${(input.globalEvidenceContext || 'Preserve the existing grounded claims in the HTML.').slice(0, 2400)}

SECTIONS:
${input.sections.map((section) => `- ${section.id}: ${section.title}`).join('\n')}

CURRENT DOCUMENT WITH PLACEHOLDERS:
${input.shellHtml}

Return the improved HTML now with all placeholders preserved exactly.`,
        maxTokens,
        thinking: 'disabled',
        preset: 'surgical_edit',
        operation: 'improve.shell',
    });
}

async function monolithImprove(input: KimiSectionedImproveInput): Promise<string> {
    return requestKimiTextCompletion({
        systemPrompt: `You are the Owny Kimi HTML Editor.
Improve an existing digital product HTML document.

Rules:
- Output ONLY the full improved HTML document.
- Keep this as a real digital product, not a landing page.
- Apply the instruction precisely while preserving unrelated content.
- Do not add new lessons or claims unless they are supported by the provided creator evidence or already present in the HTML.
- Preserve Tailwind and Alpine compatibility.
- No markdown fences.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
PRODUCT TITLE: ${inferProductTitle(input.currentHtml)}
${input.designCanonContext ? `\nDESIGN CANON:\n${input.designCanonContext}\n` : ''}

INSTRUCTION:
${input.instruction}

GLOBAL CREATOR EVIDENCE:
${(input.globalEvidenceContext || 'Preserve grounded claims from the current HTML.').slice(0, 3200)}

CURRENT HTML:
${input.currentHtml}`,
        maxTokens: 12000,
        thinking: 'disabled',
        preset: 'surgical_edit',
        operation: 'improve.monolith',
    });
}

export async function improveProductWithKimiStages(input: KimiSectionedImproveInput): Promise<KimiSectionedImproveResult> {
    const timings: Record<string, number> = {};
    const totalStart = Date.now();
    const sections = extractSections(input.currentHtml);

    if (sections.length === 0) {
        const html = postProcessHTML(await withTiming(timings, 'monolith', monolithImprove(input)));
        timings.total = Date.now() - totalStart;
        return {
            html,
            htmlBuildMode: 'kimi-improve-monolith',
            touchedSectionIds: [],
            stageTimingsMs: timings,
        };
    }

    const heuristicPlan = buildHeuristicImprovePlan({
        instruction: input.instruction,
        sections,
    });
    const plan = heuristicPlan
        || await withTiming(timings, 'plan', buildImprovePlan({
            instruction: input.instruction,
            productType: input.productType,
            sections,
        }));
    if (heuristicPlan) {
        timings.plan = 0;
    }
    const {
        shellChange,
        touchedSectionIds,
    } = resolveImproveTargeting({
        instruction: input.instruction,
        sections,
        plan,
    });
    const touchedSet = new Set(touchedSectionIds);

    const improvedSectionEntries = await withTiming(
        timings,
        'sections',
        Promise.all(sections.map(async (section) => {
            if (!touchedSet.has(section.id)) {
                return [section.id, section.rawHtml] as const;
            }

            const improved = await improveSection({
                instruction: input.instruction,
                productType: input.productType,
                creatorDisplayName: input.creatorDisplayName,
                creatorHandle: input.creatorHandle,
                creatorDna: input.creatorDna,
                section,
                allSections: sections,
                strategy: plan.strategy,
                designCanonContext: input.designCanonContext,
                sectionEvidenceContext: buildScopedEvidenceContext({
                    sourceVideoIds: section.sourceVideoIds,
                    sourceEvidenceByVideoId: input.sourceEvidenceByVideoId,
                    fallbackContext: input.globalEvidenceContext,
                }),
            });

            return [section.id, improved] as const;
        }))
    );

    const improvedSectionMap = new Map<string, string>(improvedSectionEntries);
    let html = replaceSections(input.currentHtml, improvedSectionMap, sections);

    if (shellChange) {
        const shellHtml = withSectionPlaceholders(html, sections);
        try {
            const improvedShell = await withTiming(
                timings,
                'shell',
                improveShell({
                    instruction: input.instruction,
                    productType: input.productType,
                    creatorDisplayName: input.creatorDisplayName,
                    creatorHandle: input.creatorHandle,
                    creatorDna: input.creatorDna,
                    shellHtml,
                    sections,
                    designCanonContext: input.designCanonContext,
                    globalEvidenceContext: input.globalEvidenceContext,
                })
            );
            html = restoreSectionPlaceholders(improvedShell, improvedSectionMap);
        } catch {
            timings.shell = timings.shell || 0;
        }
    }

    timings.total = Date.now() - totalStart;

    return {
        html: input.productType === 'checklist_toolkit'
            ? ensureChecklistDocumentInteractivity(postProcessHTML(html))
            : postProcessHTML(html),
        htmlBuildMode: 'kimi-improve-sectioned',
        touchedSectionIds,
        stageTimingsMs: timings,
    };
}
