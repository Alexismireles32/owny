// src/lib/ai/planner.ts
// PRD §5.5 — Build Packet generation via Claude Sonnet 4.5

import Anthropic from '@anthropic-ai/sdk';
import type { BuildPacket, ProductType, BrandTokens, SourceVideo } from '@/types/build-packet';

interface PlannerInput {
    productType: ProductType;
    userPrompt: string;
    audience?: string;
    tone?: string;
    mood?: string;
    creator: {
        handle: string;
        displayName: string;
        brandTokens: BrandTokens;
    };
    selectedVideos: {
        videoId: string;
        title: string | null;
        clipCard: Record<string, unknown> | null;
        reason: string;
    }[];
}

const PLANNER_SYSTEM_PROMPT = `You are a Digital Product Strategist for social media creators. Given a product request,
selected source videos, and brand DNA, produce a complete Build Packet.

RULES:
1. All content must be based ONLY on the provided clip cards and transcripts. Do not invent claims.
2. Write in the creator's voice/tone as specified in brand DNA.
3. Generate a compelling offer: headline, subhead, 5 benefit bullets, 3 FAQ items, CTA text.
4. Structure content appropriately for the product type:
   - pdf_guide: chapters with sections
   - mini_course: modules with lessons
   - challenge_7day: 7 days with daily tasks
   - checklist_toolkit: categories with actionable items
5. Include compliance disclaimers relevant to the content niche.
6. Suggest a price point based on content depth and niche standards.
7. Every content section must include sourceVideoIds for attribution.

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
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    // Build source context
    const sourcesContext = input.selectedVideos.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        reason: v.reason,
        clipCard: v.clipCard,
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

Selected Source Videos (${sourcesContext.length}):
${JSON.stringify(sourcesContext, null, 1)}

Generate a complete Build Packet JSON for this product.`;

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 8192,
        system: PLANNER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

    // Parse JSON
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const packet = JSON.parse(jsonStr) as BuildPacket;

    // Validate required fields
    validateBuildPacket(packet);

    return packet;
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

    // Validate content type matches productType
    if (packet.content) {
        const contentType = packet.content.type;
        if (contentType !== packet.productType) {
            errors.push(`Content type "${contentType}" doesn't match productType "${packet.productType}"`);
        }

        // Type-specific validation
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

    // Validate sources have videoIds
    if (packet.sources) {
        for (const src of packet.sources as SourceVideo[]) {
            if (!src.videoId) errors.push('Source missing videoId');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Build Packet validation failed:\n${errors.join('\n')}`);
    }
}
