// src/lib/ai/router.ts
// PRD §4.2-4.5 — AI Model adapter pattern with Kimi K2.5 + Claude fallback

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { BuildPacket } from '@/types/build-packet';
import type { ProductDSL, DSLBlock, DSLPage } from '@/types/product-dsl';

/**
 * Context passed to block improvement calls.
 */
export interface ProductContext {
    productType: string;
    themeTokens: ProductDSL['themeTokens'];
    pageType: DSLPage['type'];
    surroundingBlocks: DSLBlock[];
}

/**
 * AIModelAdapter — interface for Product DSL builder models.
 */
export interface AIModelAdapter {
    generateDSL(buildPacket: BuildPacket): Promise<ProductDSL>;
    improveBlock(block: DSLBlock, instruction: string, context: ProductContext): Promise<DSLBlock>;
}

// --- Kimi system prompt from PRD §4.3 ---
const KIMI_SYSTEM_PROMPT = `You are a Product DSL Builder. Your ONLY job is to convert a Build Packet JSON
into a Product DSL JSON that conforms exactly to the provided schema.

RULES:
1. Output ONLY valid JSON. No commentary, no markdown, no explanation.
2. Every block must have a valid \`type\` from the allowed set.
3. Every block must have a unique \`id\` (format: "blk_" + 8 random alphanumeric chars).
4. Use the provided \`themeTokens\` for all styling decisions.
5. Use the provided \`salesCopy\` and \`content\` verbatim — do not rewrite or invent content.
6. Choose appropriate block \`variant\` values to create visual variety.
7. Structure the sales page for maximum conversion: Hero → Problem → Solution → Benefits → Social Proof → FAQ → CTA.
8. For courses/challenges, create clear module/day structure with progress-trackable sections.
9. If the Build Packet specifies a \`mood\`, select variants that match (e.g., "premium" = more whitespace, larger type; "bold" = high contrast, dense).

ALLOWED BLOCK TYPES: Hero, TextSection, Bullets, Steps, Checklist, Image, Testimonial, FAQ, CTA, Pricing, Divider, ModuleHeader, LessonContent, DayHeader, DownloadButton

OUTPUT: A single JSON object conforming to ProductDSL schema. Nothing else.`;

const IMPROVE_SYSTEM_PROMPT = `You are a Product DSL Block Editor. You receive a single DSL block and an improvement instruction.
Output ONLY the improved block as valid JSON. No commentary, no markdown.
Keep the same block type and id. You may change variant, props, and styleOverrides.
ALLOWED BLOCK TYPES: Hero, TextSection, Bullets, Steps, Checklist, Image, Testimonial, FAQ, CTA, Pricing, Divider, ModuleHeader, LessonContent, DayHeader, DownloadButton`;

/**
 * KimiBuilder — Primary builder using Kimi K2.5 via Moonshot API (OpenAI-compatible).
 */
export class KimiBuilder implements AIModelAdapter {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY || '',
            baseURL: 'https://api.moonshot.cn/v1',
        });
    }

    async generateDSL(buildPacket: BuildPacket): Promise<ProductDSL> {
        const response = await this.client.chat.completions.create({
            model: 'kimi-k2-0711',
            messages: [
                { role: 'system', content: KIMI_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Convert this Build Packet into a Product DSL JSON:\n\n${JSON.stringify(buildPacket)}`,
                },
            ],
            temperature: 0.3,
            max_tokens: 16384,
        });

        const text = response.choices[0]?.message?.content || '';
        return parseDSLResponse(text);
    }

    async improveBlock(
        block: DSLBlock,
        instruction: string,
        context: ProductContext
    ): Promise<DSLBlock> {
        const response = await this.client.chat.completions.create({
            model: 'kimi-k2-0711',
            messages: [
                { role: 'system', content: IMPROVE_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Block to improve:\n${JSON.stringify(block)}\n\nInstruction: ${instruction}\n\nContext: product type = ${context.productType}, page type = ${context.pageType}`,
                },
            ],
            temperature: 0.4,
            max_tokens: 4096,
        });

        const text = response.choices[0]?.message?.content || '';
        const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr) as DSLBlock;
    }
}

/**
 * ClaudeBuilder — Fallback builder using Claude Sonnet 4.5.
 */
export class ClaudeBuilder implements AIModelAdapter {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
    }

    async generateDSL(buildPacket: BuildPacket): Promise<ProductDSL> {
        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-5-20250514',
            max_tokens: 16384,
            system: KIMI_SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: `Convert this Build Packet into a Product DSL JSON:\n\n${JSON.stringify(buildPacket)}`,
                },
            ],
        });

        const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('');

        return parseDSLResponse(text);
    }

    async improveBlock(
        block: DSLBlock,
        instruction: string,
        context: ProductContext
    ): Promise<DSLBlock> {
        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-5-20250514',
            max_tokens: 4096,
            system: IMPROVE_SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: `Block to improve:\n${JSON.stringify(block)}\n\nInstruction: ${instruction}\n\nContext: product type = ${context.productType}, page type = ${context.pageType}`,
                },
            ],
        });

        const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('');

        const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr) as DSLBlock;
    }
}

/**
 * Parse DSL response text, stripping markdown fences if present.
 */
function parseDSLResponse(text: string): ProductDSL {
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const dsl = JSON.parse(jsonStr) as ProductDSL;
    validateProductDSL(dsl);
    return dsl;
}

/**
 * Validate Product DSL structure.
 */
function validateProductDSL(dsl: ProductDSL): void {
    const errors: string[] = [];

    if (!dsl.product?.title) errors.push('Missing product.title');
    if (!dsl.product?.type) errors.push('Missing product.type');
    if (!dsl.themeTokens) errors.push('Missing themeTokens');
    if (!dsl.pages || !Array.isArray(dsl.pages) || dsl.pages.length === 0) {
        errors.push('Missing or empty pages array');
    }

    const allowedBlockTypes = [
        'Hero', 'TextSection', 'Bullets', 'Steps', 'Checklist', 'Image',
        'Testimonial', 'FAQ', 'CTA', 'Pricing', 'Divider', 'ModuleHeader',
        'LessonContent', 'DayHeader', 'DownloadButton',
    ];

    const blockIds = new Set<string>();
    for (const page of (dsl.pages || [])) {
        if (!page.id) errors.push('Page missing id');
        if (!page.blocks || !Array.isArray(page.blocks)) {
            errors.push(`Page "${page.id}" missing blocks array`);
            continue;
        }
        for (const block of page.blocks) {
            if (!block.id) errors.push('Block missing id');
            if (blockIds.has(block.id)) errors.push(`Duplicate block id: ${block.id}`);
            blockIds.add(block.id);
            if (!allowedBlockTypes.includes(block.type)) {
                errors.push(`Invalid block type: ${block.type}`);
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(`Product DSL validation failed:\n${errors.join('\n')}`);
    }
}

/**
 * Generate DSL with retry logic.
 * Try primary builder (Kimi), retry once on validation failure,
 * fall back to Claude if both Kimi attempts fail.
 */
export async function generateDSLWithRetry(
    buildPacket: BuildPacket
): Promise<{ dsl: ProductDSL; model: string }> {
    const kimi = new KimiBuilder();
    const claude = new ClaudeBuilder();

    // Attempt 1: Kimi
    try {
        const dsl = await kimi.generateDSL(buildPacket);
        return { dsl, model: 'kimi-k2.5' };
    } catch (err1) {
        console.warn('Kimi attempt 1 failed:', err1 instanceof Error ? err1.message : err1);

        // Attempt 2: Kimi retry
        try {
            const dsl = await kimi.generateDSL(buildPacket);
            return { dsl, model: 'kimi-k2.5-retry' };
        } catch (err2) {
            console.warn('Kimi attempt 2 failed:', err2 instanceof Error ? err2.message : err2);

            // Attempt 3: Claude fallback
            try {
                const dsl = await claude.generateDSL(buildPacket);
                return { dsl, model: 'claude-sonnet-4.5-fallback' };
            } catch (err3) {
                throw new Error(
                    `All builders failed. Last error: ${err3 instanceof Error ? err3.message : 'Unknown'}`
                );
            }
        }
    }
}

/**
 * Factory function — returns the primary builder.
 */
export function getBuilder(): AIModelAdapter {
    return new KimiBuilder();
}
