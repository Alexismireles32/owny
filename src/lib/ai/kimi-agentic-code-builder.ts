import OpenAI from 'openai';
import type { ProductType } from '@/types/build-packet';
import { DEFAULT_KIMI_MODEL, type MoonshotChatCompletionRequest } from '@/lib/ai/kimi';
import { log } from '@/lib/logger';

interface HtmlContractResult {
    valid: boolean;
    score: number;
    issues: string[];
    suggestions: string[];
    metrics: {
        wordCount: number;
        sourceCommentCount: number;
    };
}

interface FinalHtmlValidationContext {
    html: string;
    productType: ProductType;
    minimumWordCount: number;
    sourceVideoIds: string[];
}

interface KimiAgenticBuilderInput {
    systemPrompt: string;
    userPrompt: string;
    productType: ProductType;
    sourceVideoIds: string[];
    minimumWordCount: number;
    maxIterations?: number;
}

export interface KimiAgenticBuilderResult {
    html: string;
    iterations: number;
    modelTrail: string[];
    toolTrail: string[];
}

function extractText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function countWords(html: string): number {
    const text = extractText(html);
    if (!text) return 0;
    return text.split(' ').filter(Boolean).length;
}

function countSourceComments(html: string): number {
    return Array.from(html.matchAll(/<!--\s*sources:\s*([^>]+?)-->/gi)).length;
}

function extractAttributedSourceIds(html: string): string[] {
    return Array.from(html.matchAll(/<!--\s*sources:\s*([^>]+?)-->/gi))
        .flatMap((match) =>
            match[1]
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
        );
}

function checkStructureMarkers(html: string, productType: ProductType): number {
    switch (productType) {
        case 'pdf_guide':
            return (html.match(/id="chapter-\d+"/gi) || []).length;
        case 'mini_course':
            return (html.match(/id="module-\d+"/gi) || []).length;
        case 'challenge_7day':
            return (html.match(/id="day-\d+"/gi) || []).length;
        case 'checklist_toolkit':
            return (html.match(/id="category-\d+"/gi) || []).length;
        default:
            return 0;
    }
}

function evaluateHtmlContract(input: {
    html: string;
    productType: ProductType;
    minimumWordCount: number;
    sourceVideoIds: string[];
}): HtmlContractResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const html = input.html || '';
    const lower = html.toLowerCase();
    const wordCount = countWords(html);
    const sourceCommentCount = countSourceComments(html);
    const attributedSourceIds = extractAttributedSourceIds(html);
    const structureMarkers = checkStructureMarkers(html, input.productType);

    if (!lower.includes('<!doctype html')) {
        score -= 20;
        issues.push('Missing <!DOCTYPE html>.');
    }
    if (!lower.includes('cdn.tailwindcss.com')) {
        score -= 18;
        issues.push('Missing Tailwind CDN script.');
    }
    if (!lower.includes('name="viewport"') && !lower.includes("name='viewport'")) {
        score -= 10;
        issues.push('Missing viewport meta tag.');
    }
    if (!lower.includes('fonts.googleapis.com') && !lower.includes('inter')) {
        score -= 8;
        issues.push('Missing Inter font include.');
    }

    if (wordCount < input.minimumWordCount) {
        score -= 24;
        issues.push(`Content depth is too shallow (${wordCount}/${input.minimumWordCount} words).`);
        suggestions.push('Expand each section with concrete creator-specific lessons and examples.');
    }

    if (structureMarkers < 2) {
        score -= 14;
        issues.push('Product structure markers are missing or sparse for this product type.');
    }

    if (sourceCommentCount < 2) {
        score -= 12;
        issues.push('Not enough source attribution comments found.');
        suggestions.push('Add <!-- sources: video-id-1,video-id-2 --> to each major section.');
    }

    if (input.sourceVideoIds.length > 0) {
        const knownSourceIds = new Set(input.sourceVideoIds);
        const matchedSourceIds = attributedSourceIds.filter((id) => knownSourceIds.has(id));
        if (matchedSourceIds.length === 0) {
            score -= 18;
            issues.push('Source attribution comments do not reference any actual selected source video IDs.');
            suggestions.push('Reference real selected source IDs inside <!-- sources: ... --> comments.');
        }
    }

    if (/lorem ipsum|placeholder|coming soon|\[insert/i.test(html)) {
        score -= 26;
        issues.push('Placeholder copy detected.');
    }

    // Enforce shadcn-like visual language for consistency.
    const shadcnSignals = [
        'rounded-xl',
        'border',
        'shadow-sm',
        'text-muted-foreground',
        'bg-card',
    ];
    const signalHits = shadcnSignals.filter((token) => lower.includes(token)).length;
    if (signalHits < 2) {
        score -= 8;
        issues.push('The page lacks shadcn-style visual primitives and hierarchy.');
        suggestions.push('Use shadcn-style card surfaces, muted typography, and consistent rounded borders.');
    }

    const normalizedScore = Math.max(0, Math.min(100, score));
    return {
        valid: normalizedScore >= 82 && issues.length === 0,
        score: normalizedScore,
        issues,
        suggestions,
        metrics: {
            wordCount,
            sourceCommentCount,
        },
    };
}

function runFinalHtmlValidation(input: FinalHtmlValidationContext): HtmlContractResult {
    return evaluateHtmlContract({
        html: input.html,
        productType: input.productType,
        minimumWordCount: input.minimumWordCount,
        sourceVideoIds: input.sourceVideoIds,
    });
}

function buildRepairPrompt(validation: HtmlContractResult): string {
    return `Revise the full HTML and fix every issue below.

Deterministic validation result:
${JSON.stringify(validation, null, 2)}

Rules:
- Return ONLY the complete HTML document.
- Preserve the creator voice and real-product structure.
- Add real source attribution comments using <!-- sources: video-id-1,video-id-2 -->.
- Expand weak sections instead of adding generic filler.
- Keep the page in a clean shadcn-style visual language.`;
}

export async function buildHtmlWithKimiAgenticCodeBuilder(
    input: KimiAgenticBuilderInput
): Promise<KimiAgenticBuilderResult> {
    const client = new OpenAI({
        apiKey: process.env.KIMI_API_KEY || '',
        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
    });

    const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: input.systemPrompt },
        {
            role: 'user',
            content: `${input.userPrompt}

Return ONLY the complete HTML document.
Before you finalize, self-check that the result:
- starts with <!DOCTYPE html>
- includes Tailwind, Inter, and a viewport meta tag
- contains enough real creator-grounded content
- includes real <!-- sources: ... --> comments on major sections
- uses clean shadcn-style card, border, and typography patterns`,
        },
    ];

    const maxIterations = Math.max(2, Math.min(input.maxIterations ?? 3, 4));
    const modelTrail: string[] = [];
    const toolTrail: string[] = [];
    let bestValidation: HtmlContractResult | null = null;

    let messages = [...baseMessages];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const response = await client.chat.completions.create(
            {
                model: DEFAULT_KIMI_MODEL,
                messages,
                thinking: { type: 'disabled' },
                temperature: 0.6,
                top_p: 0.95,
                max_tokens: 12000,
            } as MoonshotChatCompletionRequest
        );

        const choice = response.choices[0];
        modelTrail.push(DEFAULT_KIMI_MODEL);

        if (choice.finish_reason === 'length') {
            throw new Error('Kimi response truncated (length). Increase max_tokens or reduce context.');
        }

        const html = choice.message.content ?? '';
        if (!html.trim()) {
            throw new Error(`Unexpected empty response from Kimi: ${choice.finish_reason}`);
        }

        const validation = runFinalHtmlValidation({
            html,
            productType: input.productType,
            minimumWordCount: input.minimumWordCount,
            sourceVideoIds: input.sourceVideoIds,
        });
        toolTrail.push(`local_validation:${validation.score}`);

        if (!bestValidation || validation.score > bestValidation.score) {
            bestValidation = validation;
        }

        if (validation.valid) {
            return {
                html,
                iterations: iteration + 1,
                modelTrail,
                toolTrail,
            };
        }

        if (iteration === maxIterations - 1) {
            break;
        }

        messages = [
            ...baseMessages,
            { role: 'assistant', content: html },
            { role: 'user', content: buildRepairPrompt(validation) },
        ];
    }

    if (bestValidation) {
        log.warn('Kimi builder exhausted revision budget without passing validation', {
            score: bestValidation.score,
            issues: bestValidation.issues,
            productType: input.productType,
        });
        throw new Error(
            `Kimi builder failed deterministic validation after ${maxIterations} pass(es). Issues: ${bestValidation.issues.join(' | ') || 'No detailed issues reported.'}`
        );
    }

    throw new Error(`Kimi agentic code builder failed before producing usable HTML.`);
}
