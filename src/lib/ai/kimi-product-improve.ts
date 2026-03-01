import { z } from 'zod';
import type { ProductType } from '@/types/build-packet';
import type { CreatorDNA } from '@/lib/ai/creator-dna';
import { requestKimiStructuredObject, requestKimiTextCompletion } from '@/lib/ai/kimi-structured';
import { postProcessHTML } from '@/lib/ai/router';

interface SectionSlice {
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
}

const ImprovePlanSchema = z.object({
    scope: z.enum(['single', 'multi', 'global']).default('global'),
    targetSectionIds: z.array(z.string()).default([]),
    shellChange: z.boolean().default(false),
    strategy: z.string().default(''),
});

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

function extractSections(html: string): SectionSlice[] {
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

Mark shellChange true only if the instruction clearly asks for overall layout, hero, navigation, framing, or page-wide style changes.`,
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
}): Promise<string> {
    const creatorTone = input.creatorDna?.voice.tone || 'clear and practical';
    const creatorVocabulary = input.creatorDna?.voice.vocabulary || 'specific and grounded';
    const creatorMood = input.creatorDna?.visual.mood || 'clean';

    return requestKimiTextCompletion({
        systemPrompt: `You are the Owny Kimi Section Refiner.
Improve one section of an existing digital product.

Rules:
- Output ONLY the full updated block for this section.
- Preserve the exact section id.
- Preserve or include the source comment in this format: <!-- sources: video-id-1,video-id-2 -->
- Do not change unrelated sections.
- Keep the result premium, grounded, and creator-specific.
- No markdown fences, no full document.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
CREATOR TONE: ${creatorTone}
CREATOR VOCABULARY: ${creatorVocabulary}
CREATOR MOOD: ${creatorMood}
STRATEGY: ${input.strategy || 'Apply the instruction surgically while keeping the section premium and grounded.'}

INSTRUCTION:
${input.instruction}

SECTION DIRECTORY:
${input.allSections.map((section) => `- ${section.id}: ${section.title}`).join('\n')}

CURRENT SECTION HTML:
${input.section.rawHtml}

Return the updated section block now.`,
        maxTokens: 2200,
        thinking: 'disabled',
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
}): Promise<string> {
    return requestKimiTextCompletion({
        systemPrompt: `You are the Owny Kimi Page Shell Refiner.
Improve only the page-level framing around section placeholders.

Rules:
- The placeholders <!-- OWNY_SECTION:... --> are immutable. Keep them exactly unchanged.
- Do not invent, remove, or rewrite product sections.
- Output the full HTML document.
- Apply only page-level improvements such as hero, framing, navigation, layout rhythm, and atmosphere.
- No markdown fences.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
CREATOR MOOD: ${input.creatorDna?.visual.mood || 'clean'}
INSTRUCTION: ${input.instruction}

SECTIONS:
${input.sections.map((section) => `- ${section.id}: ${section.title}`).join('\n')}

CURRENT DOCUMENT WITH PLACEHOLDERS:
${input.shellHtml}

Return the improved HTML now with all placeholders preserved exactly.`,
        maxTokens: 6000,
        thinking: 'disabled',
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
- Preserve Tailwind and Alpine compatibility.
- No markdown fences.`,
        userPrompt: `PRODUCT TYPE: ${input.productType}
CREATOR: ${input.creatorDisplayName} (@${input.creatorHandle})
PRODUCT TITLE: ${inferProductTitle(input.currentHtml)}

INSTRUCTION:
${input.instruction}

CURRENT HTML:
${input.currentHtml}`,
        maxTokens: 12000,
        thinking: 'disabled',
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

    const plan = await withTiming(timings, 'plan', buildImprovePlan({
        instruction: input.instruction,
        productType: input.productType,
        sections,
    }));

    const availableIds = new Set(sections.map((section) => section.id));
    const targetSectionIds = plan.scope === 'global'
        ? sections.map((section) => section.id)
        : plan.targetSectionIds.filter((id) => availableIds.has(id));
    const touchedSectionIds = targetSectionIds.length > 0 ? targetSectionIds : sections.map((section) => section.id);
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
            });

            return [section.id, improved] as const;
        }))
    );

    const improvedSectionMap = new Map<string, string>(improvedSectionEntries);
    let html = replaceSections(input.currentHtml, improvedSectionMap, sections);

    if (plan.shellChange) {
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
                })
            );
            html = restoreSectionPlaceholders(improvedShell, improvedSectionMap);
        } catch {
            timings.shell = timings.shell || 0;
        }
    }

    timings.total = Date.now() - totalStart;

    return {
        html: postProcessHTML(html),
        htmlBuildMode: 'kimi-improve-sectioned',
        touchedSectionIds,
        stageTimingsMs: timings,
    };
}
