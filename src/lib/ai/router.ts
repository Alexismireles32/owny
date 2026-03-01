// src/lib/ai/router.ts
// PRD §4.2-4.5 + Kimi Research v2 §2,3,4,6,7 — Full Kimi agent with tools + formulas + streaming

import OpenAI from 'openai';
import type { BuildPacket } from '@/types/build-packet';
import type { ProductDSL, DSLBlock, DSLPage } from '@/types/product-dsl';
import {
    DEFAULT_KIMI_MODEL,
    type MoonshotChatCompletionRequest,
} from '@/lib/ai/kimi';
import { postProcessHTML } from '@/lib/ai/post-process-html';
import { log } from '@/lib/logger';
import { hybridSearch } from '@/lib/indexing/search';
import { createAdminClient } from '@/lib/supabase/server';
import { FormulaClient, loadFormulas, createFormulaExecutors, OWNY_FORMULA_URIS } from '@/lib/ai/formula';

// ────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────

export interface ProductContext {
    productType: string;
    themeTokens: ProductDSL['themeTokens'];
    pageType: DSLPage['type'];
    surroundingBlocks: DSLBlock[];
}

export interface AIModelAdapter {
    generateDSL(buildPacket: BuildPacket, creatorId?: string): Promise<ProductDSL>;
    improveBlock(block: DSLBlock, instruction: string, context: ProductContext): Promise<DSLBlock>;
}

// ────────────────────────────────────────
// System prompts
// Per Kimi Research v2 §3: NO tool orchestration in system prompt.
// ────────────────────────────────────────

const KIMI_SYSTEM_PROMPT = `# Role
You are a Digital Product Builder for Owny.store. You create structured product layouts from pre-planned content packages.

# Goal
Convert a Build Packet JSON into a valid Product DSL JSON that renders as a professional digital product.

# Constraints
- Output ONLY valid JSON. No markdown fences, no commentary, no explanation.
- Every block needs a unique id (format: "blk_" + 8 random alphanumeric characters).
- Use ONLY these block types: Hero, TextSection, Bullets, Steps, Checklist, Image, Testimonial, FAQ, CTA, Pricing, Divider, ModuleHeader, LessonContent, DayHeader, DownloadButton
- Use the provided themeTokens for all styling decisions.
- Use provided salesCopy and content VERBATIM — never rewrite, invent, or add content.
- Create visual variety by varying block variants across the page.

# Output Structure
Sales pages follow: Hero → Problem → Solution → Benefits → Social Proof → FAQ → CTA
Courses: Module headers → Lesson content with clear progression
Challenges: Day headers → Daily tasks, objectives, reflection prompts
Checklists: Grouped sections with actionable items

# Edge Cases
- If the Build Packet has fewer than 3 source videos, create a shorter product (5-8 blocks).
- If no FAQ items are provided, omit the FAQ block entirely.
- If no testimonials are provided, omit the Testimonial block.
- If suggestedPriceCents is 0, this is a free lead magnet — adjust CTA text accordingly.

# Example
Input: Build Packet for a pdf_guide with 2 source videos about morning routines.

Output:
{
  "product": { "title": "The Morning Protocol", "type": "pdf_guide", "version": 1 },
  "themeTokens": {
    "primaryColor": "#4F46E5", "secondaryColor": "#818CF8", "backgroundColor": "#FAFAFA",
    "textColor": "#1E1E2E", "fontFamily": "inter", "borderRadius": "md",
    "spacing": "normal", "shadow": "sm", "mood": "clean"
  },
  "pages": [{
    "id": "page_sales", "type": "sales", "title": "Sales Page", "accessRule": "public",
    "blocks": [
      { "id": "blk_a1b2c3d4", "type": "Hero", "variant": "centered", "props": { "headline": "The Morning Protocol", "subhead": "Science-backed steps for your best mornings" } },
      { "id": "blk_e5f6g7h8", "type": "Bullets", "variant": "checkmark", "props": { "heading": "What You'll Get", "items": ["Step-by-step morning routine", "Supplement stack guide", "Journal prompts"] } },
      { "id": "blk_i9j0k1l2", "type": "CTA", "variant": "simple", "props": { "headline": "Start Your Mornings Right", "buttonText": "Get the Protocol", "priceText": "$19" } }
    ]
  }]
}

# Output
A single JSON object conforming to the ProductDSL schema. Nothing else.

# Visual Mood Guidelines
When the Build Packet specifies a tone/mood, follow these styling rules:
- **clean**: Generous whitespace, subtle shadows, rounded corners (borderRadius: "md"), muted backgrounds, professional and minimal.
- **fresh**: Light mint/teal/green accents, airy layouts, borderRadius "lg", soft shadows, organic feel.
- **bold**: High contrast colors, thick borders, large typography, dramatic shadows (shadow: "lg"), strong CTAs.
- **premium**: Dark/deep backgrounds, gold or purple accents, subtle gradients, glass-morphism effects, elegant typography.
- **energetic**: Bright gradients, rounded-full elements, playful spacing, warm colors (orange/yellow/pink), dynamic feel.

# Block Reference (all valid types and variants)
- Hero: centered | split | editorial | card → props: headline, subhead, ctaText?, ctaUrl?, backgroundImage?
- TextSection: standard | highlight | quote | callout → props: heading?, body
- Bullets: simple | icon | numbered | checkmark → props: heading?, items[]
- Steps: vertical | horizontal | numbered-card → props: heading?, steps[{title, description}]
- Checklist: simple | grouped | progress → props: heading?, items[{id, label, description?, isRequired}]
- Image: full-width | contained | rounded | card → props: src, alt, caption?
- Testimonial: simple | card | featured → props: quotes[{text, author, avatar?}]
- FAQ: accordion | list | card → props: heading?, items[{question, answer}]
- CTA: simple | hero | banner | sticky → props: headline, subtext?, buttonText, buttonUrl?, priceText?
- Pricing: simple | card | comparison → props: headline?, price, period?, features[], buttonText
- Divider: line | space | dots → props: (none)
- ModuleHeader: standard | numbered | icon → props: moduleNumber, title, description, lessonCount
- LessonContent: standard | steps | mixed → props: title, body, steps?[], checklist?[]
- DayHeader: standard | bold | minimal → props: dayNumber, title, objective
- DownloadButton: primary | secondary | outline → props: label, fileKey`;

const IMPROVE_SYSTEM_PROMPT = `You are a Product DSL Block Editor. You receive a single DSL block and an improvement instruction.
Output ONLY the improved block as valid JSON. No commentary, no markdown.
Keep the same block type and id. You may change variant, props, and styleOverrides.
ALLOWED BLOCK TYPES: Hero, TextSection, Bullets, Steps, Checklist, Image, Testimonial, FAQ, CTA, Pricing, Divider, ModuleHeader, LessonContent, DayHeader, DownloadButton`;

// Mood-to-styling prompt injection (Magic Patterns-inspired preset system)
const MOOD_STYLE_HINTS: Record<string, string> = {
    clean: 'Use a light, minimal palette. primaryColor should be indigo/blue. backgroundColor "#FAFAFA". borderRadius "md". shadow "sm". Calm, professional feel.',
    fresh: 'Use mint/teal/green tones. primaryColor emerald-ish. backgroundColor light green-tinted. borderRadius "lg". shadow "sm". Organic, airy feel.',
    bold: 'Use high-contrast colors. primaryColor deep red or orange. backgroundColor white. borderRadius "sm". shadow "lg". Strong, impactful feel.',
    premium: 'Use dark backgrounds with gold/purple accents. primaryColor purple or gold. backgroundColor dark "#0F0F1A". textColor light "#E5E5F0". borderRadius "md". shadow "lg". Elegant, luxurious feel.',
    energetic: 'Use warm, bright colors. primaryColor orange or coral. secondaryColor yellow. backgroundColor warm-tinted "#FFFBEB". borderRadius "full". shadow "none". Playful, dynamic feel.',
};

// ────────────────────────────────────────
// Tool definitions (Research v2 §7 — all 3 MVP tools)
// ────────────────────────────────────────

const VALIDATE_DSL_TOOL: OpenAI.Chat.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'validate_product_dsl',
        description: 'Validate a Product DSL JSON against the Owny schema. Returns { valid: boolean, errors: string[] }. Use this to verify your output is correct before finalizing.',
        parameters: {
            type: 'object',
            required: ['dsl_json'],
            properties: {
                dsl_json: {
                    type: 'string',
                    description: 'The complete Product DSL JSON as a string',
                },
            },
        },
    },
};

const GET_CLIP_CARDS_TOOL: OpenAI.Chat.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'get_clip_cards',
        description: "Search the creator's video library for clip cards matching a topic. Returns relevant content snippets with titles, key points, tags, and viewer engagement stats. Use this when you need to find specific content from the creator's videos to include in the product.",
        parameters: {
            type: 'object',
            required: ['creator_id', 'topic'],
            properties: {
                creator_id: {
                    type: 'string',
                    description: 'The creator UUID',
                },
                topic: {
                    type: 'string',
                    description: 'Topic to search for in the video library',
                },
                max_results: {
                    type: 'integer',
                    description: 'Maximum number of results to return (default: 20)',
                },
            },
        },
    },
};

const GET_CREATOR_BRAND_TOOL: OpenAI.Chat.ChatCompletionTool = {
    type: 'function',
    function: {
        name: 'get_creator_brand',
        description: "Fetch the creator's full brand DNA including display name, bio, handle, avatar, tone, and brand color tokens. Use this to ensure the product's theme, voice, and style match the creator's identity.",
        parameters: {
            type: 'object',
            required: ['creator_id'],
            properties: {
                creator_id: {
                    type: 'string',
                    description: 'The creator UUID',
                },
            },
        },
    },
};

// ────────────────────────────────────────
// Tool executors (Research v2 §7 — registry pattern)
// ────────────────────────────────────────

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

function buildToolExecutors(creatorId?: string): Record<string, ToolExecutor> {
    return {
        validate_product_dsl: async (args) => {
            const dslJson = args.dsl_json as string;
            return executeValidateDSL(dslJson);
        },

        get_clip_cards: async (args) => {
            const cid = (args.creator_id as string) || creatorId;
            const topic = args.topic as string;
            const maxResults = (args.max_results as number) || 20;

            if (!cid) {
                return { error: 'creator_id is required' };
            }

            try {
                const supabase = createAdminClient();
                const results = await hybridSearch(supabase, cid, topic, { limit: maxResults });

                // Fetch transcript snippets for the matched videos
                const videoIds = results.map((r) => r.videoId);
                const { data: transcripts } = videoIds.length > 0
                    ? await supabase
                        .from('video_transcripts')
                        .select('video_id, transcript_text')
                        .in('video_id', videoIds)
                    : { data: [] };
                const transcriptMap = new Map(
                    (transcripts || []).map((t) => [t.video_id, t.transcript_text])
                );

                // Research v2 §16: Include essential fields + transcript snippets for voice
                return {
                    count: results.length,
                    clips: results.map((r) => {
                        const card = r.clipCard as Record<string, unknown> | undefined;
                        return {
                            videoId: r.videoId,
                            title: r.title,
                            keyPoints: Array.isArray(card?.keySteps) ? (card.keySteps as string[]).slice(0, 5) : [],
                            tags: Array.isArray(card?.tags) ? (card.tags as string[]).slice(0, 3) : [],
                            transcriptSnippet: (transcriptMap.get(r.videoId) || '').slice(0, 800),
                            relevanceScore: r.score,
                        };
                    }),
                };
            } catch (err) {
                return { error: `Search failed: ${err instanceof Error ? err.message : 'Unknown'}` };
            }
        },

        get_creator_brand: async (args) => {
            const cid = (args.creator_id as string) || creatorId;

            if (!cid) {
                return { error: 'creator_id is required' };
            }

            try {
                const supabase = createAdminClient();
                const { data: creator, error } = await supabase
                    .from('creators')
                    .select('handle, display_name, bio, avatar_url, brand_tokens, voice_profile')
                    .eq('id', cid)
                    .single();

                if (error || !creator) {
                    return { error: `Creator not found: ${cid}` };
                }

                return {
                    handle: creator.handle,
                    displayName: creator.display_name,
                    bio: creator.bio,
                    avatarUrl: creator.avatar_url,
                    brandTokens: creator.brand_tokens,
                    voiceProfile: creator.voice_profile,
                };
            } catch (err) {
                return { error: `Brand lookup failed: ${err instanceof Error ? err.message : 'Unknown'}` };
            }
        },
    };
}

function executeValidateDSL(dslJson: string): { valid: boolean; errors: string[] } {
    try {
        const dsl = JSON.parse(dslJson) as ProductDSL;
        const errors = collectValidationErrors(dsl);
        return { valid: errors.length === 0, errors };
    } catch (err) {
        return { valid: false, errors: [`JSON parse error: ${err instanceof Error ? err.message : 'Unknown'}`] };
    }
}

// ────────────────────────────────────────
// Agent loop (Research v2 §2 — official pattern)
// ────────────────────────────────────────

interface AgentConfig {
    model: string;
    systemPrompt: string;
    tools: OpenAI.Chat.ChatCompletionTool[];
    toolExecutors: Record<string, ToolExecutor>;
    maxIterations: number;
    temperature: number;
    maxTokens: number;
}

async function runAgentLoop(
    client: OpenAI,
    userContent: string,
    config: AgentConfig
): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userContent },
    ];

    // Research v2 §16: Track tool calls to detect repeating loops
    const seenCalls = new Set<string>();

    for (let i = 0; i < config.maxIterations; i++) {
        const response = await client.chat.completions.create(
            {
                model: config.model,
                messages,
                tools: config.tools.length > 0 ? config.tools : undefined,
                tool_choice: config.tools.length > 0 ? 'auto' : undefined,
                parallel_tool_calls: true, // Research v2 §13
                thinking: { type: 'disabled' },
                temperature: config.temperature,
                top_p: 0.95,
                max_tokens: config.maxTokens,
            } as MoonshotChatCompletionRequest
        );

        const choice = response.choices[0];

        if (choice.finish_reason === 'stop') {
            return choice.message.content ?? '';
        }

        if (choice.finish_reason === 'tool_calls') {
            // CRITICAL: Append the assistant message AS-IS (with tool_calls)
            messages.push(choice.message);

            // Execute ALL tool calls before continuing
            for (const toolCall of choice.message.tool_calls ?? []) {
                const tc = toolCall as unknown as {
                    id: string;
                    type: string;
                    function: { name: string; arguments: string };
                };
                const funcName = tc.function.name;
                const funcArgs = JSON.parse(tc.function.arguments);

                // Research v2 §16: Detect repeating tool calls with same args
                const callKey = `${funcName}:${tc.function.arguments}`;
                if (seenCalls.has(callKey)) {
                    log.info('Duplicate tool call detected, forcing stop', {
                        tool: funcName,
                        iteration: i,
                    });
                    messages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: JSON.stringify({
                            error: 'Duplicate call detected. Use the data you already have and provide your final answer.',
                        }),
                    });
                    continue;
                }
                seenCalls.add(callKey);

                // Research v2 §7: Dynamic dispatch from toolExecutors registry
                const executor = config.toolExecutors[funcName];
                const result = executor
                    ? await executor(funcArgs)
                    : { error: `Unknown tool: ${funcName}` };

                log.info('Tool call executed', {
                    tool: funcName,
                    iteration: i,
                    hasError: typeof result === 'object' && result !== null && 'error' in result,
                });

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result),
                });
            }
            continue;
        }

        if (choice.finish_reason === 'length') {
            throw new Error('Response truncated — increase max_tokens');
        }

        return choice.message.content ?? '';
    }

    throw new Error(`Agent exceeded ${config.maxIterations} iterations`);
}

// ────────────────────────────────────────
// Streaming agent loop (Research v2 §6)
// Yields progress events so the frontend can show real-time tool activity.
// ────────────────────────────────────────

export interface AgentProgressEvent {
    type: 'tool_start' | 'tool_result' | 'content_delta' | 'complete' | 'error';
    tool?: string;
    message?: string;
    content?: string;
    iteration?: number;
}

async function* runAgentLoopStreaming(
    client: OpenAI,
    userContent: string,
    config: AgentConfig
): AsyncGenerator<AgentProgressEvent> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userContent },
    ];

    for (let i = 0; i < config.maxIterations; i++) {
        const response = await client.chat.completions.create(
            {
                model: config.model,
                messages,
                tools: config.tools.length > 0 ? config.tools : undefined,
                tool_choice: config.tools.length > 0 ? 'auto' : undefined,
                parallel_tool_calls: true, // Research v2 §13
                thinking: { type: 'disabled' },
                temperature: config.temperature,
                top_p: 0.95,
                max_tokens: config.maxTokens,
            } as MoonshotChatCompletionRequest
        );

        const choice = response.choices[0];

        if (choice.finish_reason === 'stop') {
            yield { type: 'complete', content: choice.message.content ?? '' };
            return;
        }

        if (choice.finish_reason === 'tool_calls') {
            messages.push(choice.message);

            // §6: content during tool_calls is Kimi explaining what it's doing
            if (choice.message.content) {
                yield {
                    type: 'content_delta',
                    message: choice.message.content,
                    iteration: i,
                };
            }

            for (const toolCall of choice.message.tool_calls ?? []) {
                const tc = toolCall as unknown as {
                    id: string;
                    type: string;
                    function: { name: string; arguments: string };
                };
                const funcName = tc.function.name;
                const funcArgs = JSON.parse(tc.function.arguments);

                yield { type: 'tool_start', tool: funcName, iteration: i };

                const executor = config.toolExecutors[funcName];
                const result = executor
                    ? await executor(funcArgs)
                    : { error: `Unknown tool: ${funcName}` };

                const hasError = typeof result === 'object' && result !== null && 'error' in result;

                yield {
                    type: 'tool_result',
                    tool: funcName,
                    message: hasError ? String((result as { error: string }).error) : 'Success',
                    iteration: i,
                };

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result),
                });
            }
            continue;
        }

        if (choice.finish_reason === 'length') {
            yield { type: 'error', message: 'Response truncated — increase max_tokens' };
            return;
        }

        yield { type: 'complete', content: choice.message.content ?? '' };
        return;
    }

    yield { type: 'error', message: `Agent exceeded ${config.maxIterations} iterations` };
}

// ────────────────────────────────────────
// Formula tools loader (gated by env var)
// ────────────────────────────────────────

let formulaToolsCache: {
    tools: OpenAI.Chat.ChatCompletionTool[];
    executors: Record<string, ToolExecutor>;
} | null = null;

async function getFormulaTools(): Promise<{
    tools: OpenAI.Chat.ChatCompletionTool[];
    executors: Record<string, ToolExecutor>;
}> {
    // Only load if KIMI_ENABLE_FORMULAS is set
    if (process.env.KIMI_ENABLE_FORMULAS !== 'true') {
        return { tools: [], executors: {} };
    }

    // Cache formula tools (they don't change during runtime)
    if (formulaToolsCache) return formulaToolsCache;

    try {
        const client = new FormulaClient();
        const { allTools, toolToUri } = await loadFormulas(client, OWNY_FORMULA_URIS);
        const executors = createFormulaExecutors(client, toolToUri);

        formulaToolsCache = { tools: allTools, executors };
        return formulaToolsCache;
    } catch (err) {
        log.error('Formula loading failed, continuing without formulas', {
            error: err instanceof Error ? err.message : 'Unknown',
        });
        return { tools: [], executors: {} };
    }
}

// ────────────────────────────────────────
// KimiBuilder — Primary builder with full agent toolset
// ────────────────────────────────────────

export class KimiBuilder implements AIModelAdapter {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.KIMI_API_KEY || '',
            baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
        });
    }

    private async buildAgentConfig(creatorId?: string): Promise<AgentConfig> {
        const customTools = [VALIDATE_DSL_TOOL, GET_CLIP_CARDS_TOOL, GET_CREATOR_BRAND_TOOL];
        const customExecutors = buildToolExecutors(creatorId);

        // Load Formula tools if enabled
        const { tools: formulaTools, executors: formulaExecutors } = await getFormulaTools();

        return {
            model: DEFAULT_KIMI_MODEL,
            systemPrompt: KIMI_SYSTEM_PROMPT,
            tools: [...customTools, ...formulaTools],
            toolExecutors: { ...customExecutors, ...formulaExecutors },
            maxIterations: 5,
            temperature: 0.6,
            maxTokens: 16384,
        };
    }

    private buildUserContent(buildPacket: BuildPacket, creatorId?: string): string {
        const moodHint = MOOD_STYLE_HINTS[(buildPacket as unknown as Record<string, unknown>).tone as string] || '';
        const moodSection = moodHint
            ? `\n\nStyling Direction: ${moodHint}`
            : '';
        return `Convert this Build Packet into a Product DSL JSON:\n\n${JSON.stringify(buildPacket)}${creatorId ? `\n\ncreator_id: ${creatorId}` : ''}${moodSection}`;
    }

    async generateDSL(buildPacket: BuildPacket, creatorId?: string): Promise<ProductDSL> {
        const config = await this.buildAgentConfig(creatorId);
        const userContent = this.buildUserContent(buildPacket, creatorId);

        const result = await runAgentLoop(this.client, userContent, config);
        return parseDSLResponse(result);
    }

    async *generateDSLStreaming(
        buildPacket: BuildPacket,
        creatorId?: string
    ): AsyncGenerator<AgentProgressEvent> {
        const config = await this.buildAgentConfig(creatorId);
        const userContent = this.buildUserContent(buildPacket, creatorId);

        yield* runAgentLoopStreaming(this.client, userContent, config);
    }

    async improveBlock(
        block: DSLBlock,
        instruction: string,
        context: ProductContext
    ): Promise<DSLBlock> {
        const response = await this.client.chat.completions.create(
            {
                model: DEFAULT_KIMI_MODEL,
                messages: [
                    { role: 'system', content: IMPROVE_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: `Block to improve:\n${JSON.stringify(block)}\n\nInstruction: ${instruction}\n\nContext: product type = ${context.productType}, page type = ${context.pageType}`,
                    },
                ],
                thinking: { type: 'disabled' },
                temperature: 0.6,
                top_p: 0.95,
                max_tokens: 4096,
            } as MoonshotChatCompletionRequest
        );

        const text = response.choices[0]?.message?.content || '';
        const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr) as DSLBlock;
    }
}

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────

function parseDSLResponse(text: string): ProductDSL {
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const dsl = JSON.parse(jsonStr) as ProductDSL;
    const errors = collectValidationErrors(dsl);
    if (errors.length > 0) {
        throw new Error(`Product DSL validation failed:\n${errors.join('\n')}`);
    }
    return dsl;
}

function collectValidationErrors(dsl: ProductDSL): string[] {
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

    return errors;
}

export { collectValidationErrors as validateProductDSL_errors };

export function validateProductDSL(dsl: ProductDSL): void {
    const errors = collectValidationErrors(dsl);
    if (errors.length > 0) {
        throw new Error(`Product DSL validation failed:\n${errors.join('\n')}`);
    }
}

// ────────────────────────────────────────
// Post-processing pipeline (deterministic fixes for AI hallucinations)
// Inspired by Magic Patterns' AST validation approach
// ────────────────────────────────────────

const VALID_BLOCK_TYPES = new Set([
    'Hero', 'TextSection', 'Bullets', 'Steps', 'Checklist', 'Image',
    'Testimonial', 'FAQ', 'CTA', 'Pricing', 'Divider', 'ModuleHeader',
    'LessonContent', 'DayHeader', 'DownloadButton',
]);

const VALID_VARIANTS: Record<string, Set<string>> = {
    Hero: new Set(['centered', 'split', 'editorial', 'card']),
    TextSection: new Set(['standard', 'highlight', 'quote', 'callout']),
    Bullets: new Set(['simple', 'icon', 'numbered', 'checkmark']),
    Steps: new Set(['vertical', 'horizontal', 'numbered-card']),
    Checklist: new Set(['simple', 'grouped', 'progress']),
    Image: new Set(['full-width', 'contained', 'rounded', 'card']),
    Testimonial: new Set(['simple', 'card', 'featured']),
    FAQ: new Set(['accordion', 'list', 'card']),
    CTA: new Set(['simple', 'hero', 'banner', 'sticky']),
    Pricing: new Set(['simple', 'card', 'comparison']),
    Divider: new Set(['line', 'space', 'dots']),
    ModuleHeader: new Set(['standard', 'numbered', 'icon']),
    LessonContent: new Set(['standard', 'steps', 'mixed']),
    DayHeader: new Set(['standard', 'bold', 'minimal']),
    DownloadButton: new Set(['primary', 'secondary', 'outline']),
};

const DEFAULT_THEME: ProductDSL['themeTokens'] = {
    primaryColor: '#4F46E5',
    secondaryColor: '#818CF8',
    backgroundColor: '#FAFAFA',
    textColor: '#1E1E2E',
    fontFamily: 'inter',
    borderRadius: 'md',
    spacing: 'normal',
    shadow: 'sm',
    mood: 'clean',
};

function generateBlockId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'blk_';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

export function postProcessDSL(raw: ProductDSL): ProductDSL {
    const dsl = JSON.parse(JSON.stringify(raw)) as ProductDSL; // deep clone
    let fixCount = 0;

    // 1. Ensure product metadata
    if (!dsl.product) {
        dsl.product = { title: 'Untitled Product', type: 'pdf_guide', version: 1 };
        fixCount++;
    }
    if (!dsl.product.title) { dsl.product.title = 'Untitled Product'; fixCount++; }
    if (!dsl.product.version) { dsl.product.version = 1; fixCount++; }

    // 2. Ensure themeTokens (merge with defaults)
    dsl.themeTokens = { ...DEFAULT_THEME, ...dsl.themeTokens };
    if (!dsl.themeTokens.primaryColor?.startsWith('#')) {
        dsl.themeTokens.primaryColor = DEFAULT_THEME.primaryColor;
        fixCount++;
    }
    if (!dsl.themeTokens.secondaryColor?.startsWith('#')) {
        dsl.themeTokens.secondaryColor = DEFAULT_THEME.secondaryColor;
        fixCount++;
    }

    // 3. Ensure pages array
    if (!dsl.pages || !Array.isArray(dsl.pages) || dsl.pages.length === 0) {
        dsl.pages = [{
            id: 'page_sales',
            type: 'sales',
            title: 'Sales Page',
            accessRule: 'public',
            blocks: [],
        }];
        fixCount++;
    }

    // 4. Fix each page
    const usedIds = new Set<string>();
    for (const page of dsl.pages) {
        // Ensure page has id
        if (!page.id) {
            page.id = `page_${Math.random().toString(36).slice(2, 8)}`;
            fixCount++;
        }
        if (!page.type) { page.type = 'sales'; fixCount++; }
        if (!page.title) { page.title = 'Untitled Page'; fixCount++; }
        if (!page.accessRule) { page.accessRule = 'public'; fixCount++; }
        if (!page.blocks || !Array.isArray(page.blocks)) {
            page.blocks = [];
            fixCount++;
        }

        // 5. Fix each block
        page.blocks = page.blocks.filter(block => {
            // Strip invalid block types (hallucinations)
            if (!block.type || !VALID_BLOCK_TYPES.has(block.type)) {
                log.info('Post-process: stripped invalid block type', { type: block.type });
                fixCount++;
                return false;
            }
            return true;
        });

        for (const block of page.blocks) {
            // Fix duplicate or missing IDs
            if (!block.id || usedIds.has(block.id) || !block.id.startsWith('blk_')) {
                block.id = generateBlockId();
                fixCount++;
            }
            usedIds.add(block.id);

            // Fix hallucinated variants (default to first valid variant)
            const validVariants = VALID_VARIANTS[block.type];
            if (validVariants && !validVariants.has(block.variant)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (block as any).variant = Array.from(validVariants)[0];
                fixCount++;
            }

            // Ensure props object exists
            if (!block.props || typeof block.props !== 'object') {
                (block as DSLBlock & { props: Record<string, unknown> }).props = {};
                fixCount++;
            }

            // Fix required props per block type
            const p = block.props as Record<string, unknown>;
            switch (block.type) {
                case 'Hero':
                    if (!p.headline) { p.headline = 'Untitled'; fixCount++; }
                    if (!p.subhead) { p.subhead = ''; fixCount++; }
                    break;
                case 'TextSection':
                    if (!p.body) { p.body = ''; fixCount++; }
                    break;
                case 'Bullets':
                    if (!Array.isArray(p.items)) { p.items = []; fixCount++; }
                    break;
                case 'Steps':
                    if (!Array.isArray(p.steps)) { p.steps = []; fixCount++; }
                    break;
                case 'Checklist':
                    if (!Array.isArray(p.items)) { p.items = []; fixCount++; }
                    break;
                case 'Testimonial':
                    if (!Array.isArray(p.quotes)) { p.quotes = []; fixCount++; }
                    break;
                case 'FAQ':
                    if (!Array.isArray(p.items)) { p.items = []; fixCount++; }
                    break;
                case 'CTA':
                    if (!p.headline) { p.headline = 'Get Started'; fixCount++; }
                    if (!p.buttonText) { p.buttonText = 'Buy Now'; fixCount++; }
                    break;
                case 'Pricing':
                    if (!p.price) { p.price = 'Free'; fixCount++; }
                    if (!p.buttonText) { p.buttonText = 'Get Access'; fixCount++; }
                    if (!Array.isArray(p.features)) { p.features = []; fixCount++; }
                    break;
                case 'Image':
                    if (!p.src) { p.src = ''; fixCount++; }
                    if (!p.alt) { p.alt = ''; fixCount++; }
                    break;
                case 'ModuleHeader':
                    if (!p.title) { p.title = 'Module'; fixCount++; }
                    if (typeof p.moduleNumber !== 'number') { p.moduleNumber = 1; fixCount++; }
                    if (!p.description) { p.description = ''; fixCount++; }
                    if (typeof p.lessonCount !== 'number') { p.lessonCount = 0; fixCount++; }
                    break;
                case 'LessonContent':
                    if (!p.title) { p.title = 'Lesson'; fixCount++; }
                    if (!p.body) { p.body = ''; fixCount++; }
                    break;
                case 'DayHeader':
                    if (typeof p.dayNumber !== 'number') { p.dayNumber = 1; fixCount++; }
                    if (!p.title) { p.title = 'Day'; fixCount++; }
                    if (!p.objective) { p.objective = ''; fixCount++; }
                    break;
                case 'DownloadButton':
                    if (!p.label) { p.label = 'Download'; fixCount++; }
                    if (!p.fileKey) { p.fileKey = ''; fixCount++; }
                    break;
            }
        }
    }

    if (fixCount > 0) {
        log.info('Post-processed DSL', { fixCount, blocks: dsl.pages.reduce((n, p) => n + p.blocks.length, 0) });
    }

    return dsl;
}

// ────────────────────────────────────────
// generateDSLWithRetry — Kimi (agent loop) with retry
// ────────────────────────────────────────

export async function generateDSLWithRetry(
    buildPacket: BuildPacket,
    creatorId?: string
): Promise<{ dsl: ProductDSL; model: string }> {
    const kimi = new KimiBuilder();

    try {
        const rawDsl = await kimi.generateDSL(buildPacket, creatorId);
        const dsl = postProcessDSL(rawDsl);
        log.info('DSL generated', { model: DEFAULT_KIMI_MODEL, pages: dsl.pages?.length });
        return { dsl, model: DEFAULT_KIMI_MODEL };
    } catch (err1) {
        log.error('Kimi attempt 1 failed', { error: err1 instanceof Error ? err1.message : 'Unknown' });

        // Attempt 2: Kimi retry
        try {
            const rawDsl = await kimi.generateDSL(buildPacket, creatorId);
            const dsl = postProcessDSL(rawDsl);
            log.info('DSL generated on retry', { model: `${DEFAULT_KIMI_MODEL}-retry`, pages: dsl.pages?.length });
            return { dsl, model: `${DEFAULT_KIMI_MODEL}-retry` };
        } catch (err2) {
            throw new Error(
                `Kimi DSL generation failed after retry. Last error: ${err2 instanceof Error ? err2.message : 'Unknown'}`
            );
        }
    }
}

export function getBuilder(): AIModelAdapter {
    return new KimiBuilder();
}

// ────────────────────────────────────────
// HTML Code Generation Pipeline (Magic Patterns-inspired)
// AI generates complete HTML+Tailwind pages instead of JSON DSL
// ────────────────────────────────────────

const HTML_SYSTEM_PROMPT = `You are a world-class UI designer and frontend developer. You create stunning, production-ready HTML pages with Tailwind CSS.

# OUTPUT RULES
- Output ONLY the raw HTML content. No markdown fences, no commentary, no explanation.
- Start with <!DOCTYPE html> and include a complete HTML document.
- Include Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Include Inter font from Google Fonts.
- Include Alpine.js for interactive elements: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
- Include a <meta name="viewport" content="width=device-width, initial-scale=1"> tag.
- NEVER include any other <script> tags or inline JavaScript (except Alpine.js directives).

# DESIGN PRINCIPLES
- Make the design STUNNING. Users should be wowed at first glance.
- Use modern, premium aesthetics: smooth gradients, glass-morphism, subtle shadows, micro-animations.
- Use generous whitespace and clear visual hierarchy.
- Every button should have hover effects (hover:shadow-lg, hover:scale-[1.02], transition-all).
- Use consistent spacing (py-16 to py-24 for sections, px-6 for content).
- Cards: rounded-2xl, shadow-sm hover:shadow-lg transition-shadow, border border-white/10.
- Buttons: rounded-xl, px-8 py-4, font-semibold, transition-all duration-200.
- Typography: Use text-4xl to text-6xl for hero headlines, text-lg for body text.
- Apply smooth scroll behavior on the html element.

# TAILWIND COMPONENT PATTERNS (use these exact patterns)
- Hero sections: "bg-gradient-to-br from-[primary] to-[secondary] text-white py-24 px-6"
- Section containers: "max-w-4xl mx-auto px-6 py-16"
- Feature cards: "bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow border"
- Testimonial cards: "bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 border-l-4 border-[primary]"
- CTA sections: "bg-gradient-to-r from-[primary] to-[secondary] rounded-3xl p-12 text-center text-white"
- FAQ accordions: Use Alpine.js x-data, x-show, @click for toggle behavior.
- Step numbers: "w-12 h-12 rounded-full bg-[primary] text-white flex items-center justify-center font-bold"
- Badges: "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[primary]/10 text-[primary]"
- Dividers: "border-t border-gray-100 my-12"

# INTERACTIVE ELEMENTS (Alpine.js)
For FAQ accordions use this pattern:
<div x-data="{ open: false }">
  <button @click="open = !open" class="w-full text-left flex justify-between items-center py-4">
    <span class="font-semibold">Question here</span>
    <span x-text="open ? '−' : '+'" class="text-xl"></span>
  </button>
  <div x-show="open" x-transition class="pb-4 text-gray-600">Answer here</div>
</div>

# CONTENT RULES
- Use the product title, description, and content VERBATIM from the build packet.
- Never invent content that isn't in the build packet.
- Include proper semantic HTML (h1, h2, h3, p, ul, etc.).
- Only one h1 per page.

# PAGE STRUCTURE (for sales pages)
1. Hero: Gradient background, large headline, subheadline, CTA button
2. Social proof / credentials bar (if testimonials available)
3. "What you'll learn" or "What's included" section with feature cards or checklist
4. Content preview / module overview
5. Testimonials section (if available)
6. FAQ section with Alpine.js accordions (if available)
7. Final CTA: Gradient card with price, button, guarantee text
8. Footer: Simple, minimal, brand-colored

# TAILWIND CUSTOM CONFIG
Include this in a <script> tag right after the Tailwind CDN:
<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    }
  }
}
</script>`;

const HTML_IMPROVE_PROMPT = `You are a UI editor. You receive an HTML page and an improvement instruction.
Output ONLY the complete improved HTML page. No commentary, no markdown fences.
Keep the same overall structure. Make precise, targeted changes based on the instruction.
Maintain all Tailwind classes, Alpine.js behavior, and CDN script tags.`;

// Mood-specific HTML styling rules
const HTML_MOOD_HINTS: Record<string, string> = {
    clean: 'Use indigo/blue (#4F46E5) as primary color. White backgrounds. Subtle shadows. Rounded-lg corners. Professional, SaaS-like aesthetic. bg-gradient-to-br from-indigo-600 to-indigo-800 for hero.',
    fresh: 'Use emerald/teal (#059669) as primary color. Light green-tinted backgrounds (bg-emerald-50). Rounded-2xl corners. Organic, airy feel. bg-gradient-to-br from-emerald-500 to-teal-600 for hero.',
    bold: 'Use red/orange (#DC2626) as primary color. High contrast. Large typography. border-2 borders. Strong shadows. bg-gradient-to-br from-red-600 to-orange-500 for hero.',
    premium: 'Use purple/gold (#7C3AED) as primary. Dark backgrounds (bg-gray-950, bg-slate-900). Gold accents (#F59E0B). Glassmorphism (bg-white/5 backdrop-blur-xl). bg-gradient-to-br from-purple-900 to-slate-900 for hero. Use text-white and text-gray-300.',
    energetic: 'Use coral/orange (#F97316) as primary. Warm backgrounds (bg-amber-50). Rounded-full elements. Playful spacing. bg-gradient-to-br from-orange-500 to-pink-500 for hero.',
    professional: 'Use slate/blue (#3B82F6) as primary. Clean white backgrounds. Moderate shadows. Professional typography. bg-gradient-to-br from-blue-600 to-blue-800 for hero.',
};

function buildHTMLUserContent(buildPacket: BuildPacket, creatorId?: string): string {
    const mood = (buildPacket as unknown as Record<string, unknown>).tone as string || 'professional';
    const moodHint = HTML_MOOD_HINTS[mood] || HTML_MOOD_HINTS.professional;

    return `Create a beautiful, production-ready HTML+Tailwind product page.

STYLING DIRECTION: ${moodHint}

PRODUCT INFO:
${JSON.stringify(buildPacket, null, 2)}

${creatorId ? `creator_id: ${creatorId}` : ''}

Generate the complete HTML document now.`;
}

// ────────────────────────────────────────
// generateProductWithRetry — Returns both HTML + DSL
// Kimi-only HTML generation
// ────────────────────────────────────────

export async function generateProductWithRetry(
    buildPacket: BuildPacket,
    creatorId?: string
): Promise<{ html: string; dsl: ProductDSL; model: string }> {
    const userContent = buildHTMLUserContent(buildPacket, creatorId);

    let html: string;
    let model: string;

    try {
        const kimi = new OpenAI({
            apiKey: process.env.KIMI_API_KEY || '',
            baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
        });
        const result = await kimi.chat.completions.create(
            {
                model: DEFAULT_KIMI_MODEL,
                messages: [
                    { role: 'system', content: HTML_SYSTEM_PROMPT },
                    { role: 'user', content: userContent },
                ],
                thinking: { type: 'disabled' },
                temperature: 0.6,
                max_tokens: 16000,
            } as MoonshotChatCompletionRequest
        );

        html = result.choices[0]?.message?.content ?? '';
        model = `${DEFAULT_KIMI_MODEL}-html`;
        log.info('HTML generated', { model, length: html.length });
    } catch (err) {
        throw new Error(`Kimi HTML generation failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    // Post-process HTML
    html = postProcessHTML(html);

    // Also generate a minimal DSL for backward compatibility / metadata
    const minimalDsl: ProductDSL = {
        product: {
            title: (buildPacket as unknown as Record<string, unknown>).title as string || 'Untitled',
            type: buildPacket.productType,
            version: 1,
        },
        themeTokens: {
            primaryColor: '#4F46E5',
            secondaryColor: '#818CF8',
            backgroundColor: '#FAFAFA',
            textColor: '#1E1E2E',
            fontFamily: 'inter',
            borderRadius: 'md',
            spacing: 'normal',
            shadow: 'sm',
            mood: (buildPacket as unknown as Record<string, unknown>).tone as string || 'professional',
        },
        pages: [{
            id: 'page_sales',
            type: 'sales',
            title: 'Sales Page',
            accessRule: 'public',
            blocks: [],
        }],
    };

    return { html, dsl: minimalDsl, model };
}

// ────────────────────────────────────────
// improveProductHTML — Send current HTML + instruction for targeted edit
// ────────────────────────────────────────

export async function improveProductHTML(
    currentHtml: string,
    instruction: string
): Promise<{ html: string; model: string }> {
    const kimi = new OpenAI({
        apiKey: process.env.KIMI_API_KEY || '',
        baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
    });
    const result = await kimi.chat.completions.create(
        {
            model: DEFAULT_KIMI_MODEL,
            messages: [
                { role: 'system', content: HTML_IMPROVE_PROMPT },
                {
                    role: 'user',
                    content: `Here is the current HTML page:\n\n${currentHtml}\n\nIMPROVEMENT INSTRUCTION: ${instruction}\n\nOutput the complete improved HTML document.`,
                },
            ],
            thinking: { type: 'disabled' },
            temperature: 0.6,
            max_tokens: 16000,
        } as MoonshotChatCompletionRequest
    );

    const html = postProcessHTML(result.choices[0]?.message?.content ?? '');
    return { html, model: `${DEFAULT_KIMI_MODEL}-improve` };
}
