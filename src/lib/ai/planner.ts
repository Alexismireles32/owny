// src/lib/ai/planner.ts
// PRD §5.5 — Build Packet generation via Kimi K2.5

import type { BuildPacket, ProductType, BrandTokens, SourceVideo } from '@/types/build-packet';
import { z } from 'zod';
import { requestKimiStructuredObject } from '@/lib/ai/kimi-structured';

interface PlannerInput {
    productType: ProductType;
    userPrompt: string;
    audience?: string;
    tone?: string;
    mood?: string;
    voiceProfile?: Record<string, unknown> | null;
    creator: {
        handle: string;
        displayName: string;
        brandTokens: BrandTokens;
    };
    selectedVideos: {
        videoId: string;
        title: string | null;
        clipCard: Record<string, unknown> | null;
        transcriptSnippet?: string | null;
        reason: string;
    }[];
}

const ProductTypeSchema = z.enum(['pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit']);

const BuildPacketSchema = z.object({
    productType: ProductTypeSchema,
    creator: z.object({
        handle: z.string().min(1),
        displayName: z.string().optional(),
        brandTokens: z.record(z.string(), z.unknown()).optional(),
        tone: z.string().optional(),
    }).passthrough(),
    userPrompt: z.string().min(1),
    sources: z.array(
        z.object({
            videoId: z.string().min(1),
            title: z.string().nullable().optional(),
            keyBullets: z.array(z.string()).optional(),
            tags: z.array(z.string()).optional(),
        }).passthrough(),
    ).min(1),
    salesPage: z.object({
        headline: z.string().min(1),
        subhead: z.string().optional(),
        benefits: z.array(z.string()).optional(),
        testimonials: z.array(z.unknown()).optional(),
        faq: z.array(z.unknown()).optional(),
        ctaText: z.string().optional(),
        priceText: z.string().optional(),
        suggestedPriceCents: z.number().int().optional(),
    }).passthrough(),
    content: z.object({
        type: ProductTypeSchema,
    }).passthrough(),
    designIntent: z.object({}).passthrough(),
    compliance: z.object({}).passthrough().optional(),
}).passthrough();

const PLANNER_SYSTEM_PROMPT = `You are a Digital Product Strategist for social media creators. Given a product request,
selected source videos, and brand DNA, produce a complete Build Packet.

RULES:
1. All content must be based ONLY on the provided clip cards, transcripts, and source materials. Do not invent claims.
2. Write in the creator's voice — match their vocabulary, speaking style, tone, and catchphrases EXACTLY. The reader should feel like the creator wrote every word. If a voice profile is provided, study it carefully.
3. Generate a compelling offer: headline, subhead, 5 benefit bullets, 3 FAQ items, CTA text.
4. Structure content appropriately for the product type:
   - pdf_guide: chapters with sections, each containing actual written content (paragraphs, lists, actionable steps) derived from the creator's transcript insights. Each chapter should be 300-600 words.
   - mini_course: modules with lessons, each containing actual teaching content, exercises, and action items from the creator's knowledge.
   - challenge_7day: 7 days with daily objectives, tasks, reflection prompts, and tips — all from the creator's real advice.
   - checklist_toolkit: categories with actionable checklist items, explanations, and pro tips drawn from the creator's experience.
5. Include compliance disclaimers relevant to the content niche.
6. Suggest a price point based on content depth and niche standards.
7. Every content section must include sourceVideoIds for attribution.
8. Content must be SUBSTANTIAL — not placeholder summaries. Write the actual product content that a buyer would receive.

OUTPUT: Valid JSON conforming to the BuildPacket schema. No markdown fences.
The JSON must have these top-level keys:
- productType (string)
- creator (object with handle, displayName, brandTokens, tone)
- userPrompt (string)
- sources (array of { videoId, title, keyBullets, tags })
- salesPage (object with headline, subhead, benefits, testimonials, faq, ctaText, priceText, suggestedPriceCents)
- content (object — type-specific: pdf_guide has chapters, mini_course has modules, challenge_7day has days, checklist_toolkit has categories)
- designIntent (object with mood, layoutDensity, imageStyle)
- compliance (object with disclaimers, flaggedClaims)`;

/**
 * Generate a Build Packet from creator request + selected videos.
 */
export async function generateBuildPacket(input: PlannerInput): Promise<BuildPacket> {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const sourceLimit = attempt === 1 ? input.selectedVideos.length : Math.min(input.selectedVideos.length, 40);
        const sourcesContext = input.selectedVideos.slice(0, sourceLimit).map((v) => ({
            videoId: v.videoId,
            title: v.title,
            reason: v.reason,
            clipCard: v.clipCard,
            transcriptSnippet: v.transcriptSnippet || null,
        }));

        const userMessage = `Product Type: ${input.productType}
Creator Request: "${input.userPrompt}"
${input.audience ? `Target Audience: ${input.audience}` : ''}
${input.tone ? `Desired Tone: ${input.tone}` : ''}
${input.mood ? `Design Mood: ${input.mood}` : ''}

Creator Brand DNA:
- Handle: @${input.creator.handle}
- Display Name: ${input.creator.displayName}
- Primary Color: ${input.creator.brandTokens.primaryColor}
- Font: ${input.creator.brandTokens.fontFamily}
- Brand Mood: ${input.creator.brandTokens.mood}
${input.voiceProfile ? `
Creator Voice Profile (CRITICAL — match this voice exactly):
${JSON.stringify(input.voiceProfile, null, 1)}` : ''}

Selected Source Videos (${sourcesContext.length}):
${JSON.stringify(sourcesContext, null, 1)}

        Generate a complete Build Packet JSON for this product. The content sections must contain REAL, SUBSTANTIAL written content — not summaries or placeholders. Write as if you ARE this creator.`;

        try {
            const parsed = await requestKimiStructuredObject({
                systemPrompt: PLANNER_SYSTEM_PROMPT,
                userPrompt: userMessage,
                schema: BuildPacketSchema,
                maxTokens: 12000,
            });

            const packet = parsed as unknown as BuildPacket;
            validateBuildPacket(packet);
            return packet;
        } catch (error) {
            if (attempt === 2) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Build Packet generation failed after retry: ${message}`);
            }
        }
    }

    throw new Error('Build Packet generation failed: unreachable retry state');
}

/**
 * Validate Build Packet structure against the TypeScript schema.
 * Throws if invalid.
 */
function validateBuildPacket(packet: BuildPacket): void {
    const errors: string[] = [];

    if (!packet.productType) errors.push('Missing productType');
    if (!packet.creator?.handle) errors.push('Missing creator.handle');
    if (!packet.userPrompt) errors.push('Missing userPrompt');
    if (!packet.sources || !Array.isArray(packet.sources)) errors.push('Missing/invalid sources');
    if (!packet.salesPage?.headline) errors.push('Missing salesPage.headline');
    if (!packet.content) errors.push('Missing content');
    if (!packet.designIntent) errors.push('Missing designIntent');

    if (packet.content) {
        const contentType = packet.content.type;
        if (contentType !== packet.productType) {
            errors.push(`Content type "${contentType}" doesn't match productType "${packet.productType}"`);
        }

        switch (contentType) {
            case 'pdf_guide':
                if (!('chapters' in packet.content) || !Array.isArray(packet.content.chapters)) {
                    errors.push('pdf_guide content missing chapters array');
                }
                break;
            case 'mini_course':
                if (!('modules' in packet.content) || !Array.isArray(packet.content.modules)) {
                    errors.push('mini_course content missing modules array');
                }
                break;
            case 'challenge_7day':
                if (!('days' in packet.content) || !Array.isArray(packet.content.days)) {
                    errors.push('challenge_7day content missing days array');
                }
                break;
            case 'checklist_toolkit':
                if (!('categories' in packet.content) || !Array.isArray(packet.content.categories)) {
                    errors.push('checklist_toolkit content missing categories array');
                }
                break;
        }
    }

    if (packet.sources) {
        for (const src of packet.sources as SourceVideo[]) {
            if (!src.videoId) errors.push('Source missing videoId');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Build Packet validation failed:\n${errors.join('\n')}`);
    }
}
