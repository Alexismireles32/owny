// POST /api/products/build — SSE streaming endpoint for live product generation
// Phase 1: Topic discovery (if vague) → Phase 2: Retrieve+Rerank → Phase 3: Plan → Phase 4: Stream HTML

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { hybridSearch } from '@/lib/indexing/search';
import { rerankCandidates } from '@/lib/ai/reranker';
import { postProcessHTML } from '@/lib/ai/router';
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
                    // Extract topic clusters from clip cards
                    const topicCounts = new Map<string, number>();
                    for (const result of searchResults) {
                        const card = result.clipCard as Record<string, unknown> | null;
                        if (card?.topicTags && Array.isArray(card.topicTags)) {
                            for (const tag of card.topicTags as string[]) {
                                topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
                            }
                        }
                    }

                    // Sort by frequency, take top 6
                    const topTopics = Array.from(topicCounts.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([topic, count]) => ({ topic, videoCount: count }));

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

                // Fetch FULL transcripts for selected videos
                const { data: transcripts } = await db
                    .from('video_transcripts')
                    .select('id, title, description, transcript_text, views, likes')
                    .in('id', selectedVideoIds);

                // Fetch clip cards for structured data
                const { data: clipCards } = await db
                    .from('clip_cards')
                    .select('video_id, card_json')
                    .in('video_id', selectedVideoIds);

                const clipCardMap = new Map(
                    (clipCards || []).map((c) => [c.video_id, c.card_json])
                );

                // Build rich content context from transcripts + clip cards
                const contentContext = (transcripts || []).map((t, i) => {
                    const card = clipCardMap.get(t.id) as Record<string, unknown> | null;
                    return `--- VIDEO ${i + 1}: "${t.title || 'Untitled'}" (${t.views || 0} views) ---
${card ? `Key Topics: ${(card.topicTags as string[])?.join(', ') || 'N/A'}` : ''}
${card ? `Key Steps: ${JSON.stringify((card as Record<string, unknown>).keySteps || [])}` : ''}
TRANSCRIPT:
${(t.transcript_text || t.description || '').slice(0, 2000)}
---`;
                }).join('\n\n');

                // Send source video info to UI for transparency
                send({
                    type: 'source_videos',
                    videos: (transcripts || []).map((t) => ({
                        title: t.title || 'Untitled',
                        views: t.views || 0,
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

                // Build voice and brand context
                const voiceProfile = creator.voice_profile as Record<string, unknown> | null;
                const brandTokens = creator.brand_tokens as Record<string, unknown> | null;

                let voiceContext = '';
                if (voiceProfile) {
                    voiceContext = `\nCREATOR VOICE PROFILE:\n`;
                    if (voiceProfile.tone) voiceContext += `- Tone: ${voiceProfile.tone}\n`;
                    if (voiceProfile.vocabulary) voiceContext += `- Vocabulary style: ${voiceProfile.vocabulary}\n`;
                    if (voiceProfile.catchphrases && Array.isArray(voiceProfile.catchphrases)) {
                        voiceContext += `- Catchphrases they use: ${(voiceProfile.catchphrases as string[]).join(', ')}\n`;
                    }
                    if (voiceProfile.personality) voiceContext += `- Personality: ${voiceProfile.personality}\n`;
                    voiceContext += `IMPORTANT: Write the product in this exact voice and tone. Use their catchphrases naturally.\n`;
                }

                let brandContext = '';
                if (brandTokens) {
                    brandContext = `\nCREATOR BRAND STYLING (use these instead of default colors):\n`;
                    if (brandTokens.primaryColor) brandContext += `- Primary color: ${brandTokens.primaryColor} (use for headings, accents, buttons)\n`;
                    if (brandTokens.secondaryColor) brandContext += `- Secondary color: ${brandTokens.secondaryColor} (use for hover states, gradients)\n`;
                    if (brandTokens.backgroundColor) brandContext += `- Background: ${brandTokens.backgroundColor}\n`;
                    if (brandTokens.textColor) brandContext += `- Text color: ${brandTokens.textColor}\n`;
                    if (brandTokens.fontFamily) brandContext += `- Font: ${brandTokens.fontFamily} (add Google Fonts link if needed)\n`;
                    if (brandTokens.mood) brandContext += `- Mood: ${brandTokens.mood} (match the energy of the design)\n`;
                    brandContext += `IMPORTANT: Apply these brand colors throughout the product instead of default indigo/purple.\n`;
                }

                const systemPrompt = PRODUCT_SYSTEM_PROMPTS[productType] || PRODUCT_SYSTEM_PROMPTS.pdf_guide;

                const userContent = `Create the ACTUAL digital product content.

PRODUCT TYPE: ${productType}
PRODUCT TITLE: ${productTitle}
CREATOR: ${creator.display_name} (@${creator.handle})
${creator.bio ? `CREATOR BIO: ${creator.bio}` : ''}
${voiceContext}
${brandContext}
USER REQUEST: ${message}

VIDEOS USED (${transcripts?.length || 0} videos with full transcripts):
${contentContext}

IMPORTANT:
- This is the REAL product that buyers receive. Fill it with REAL, SUBSTANTIVE content from the transcripts above.
- Mix the creator's own words and advice (from transcripts) with smooth connecting text.
- Every chapter/lesson/day/category must contain real, actionable content — not placeholder text.
- Write in the creator's voice and style${voiceProfile ? ' as described in the VOICE PROFILE above' : ''}.
- ${brandTokens ? 'Use the BRAND STYLING colors described above instead of generic colors.' : ''}
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

                // Post-process
                fullHtml = postProcessHTML(fullHtml);
                send({ type: 'html_complete', html: fullHtml });

                // Save version
                send({ type: 'status', message: '💾 Saving your product...', phase: 'saving' });

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
                            videosUsed: selectedVideoIds.length,
                            rerankerConfidence: reranked.confidence,
                            coverageGaps: reranked.coverageGaps,
                        },
                        dsl_json: {},
                        generated_html: fullHtml,
                        source_video_ids: selectedVideoIds,
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
                    videosUsed: selectedVideoIds.length,
                });

                log.info('Product built via streaming', {
                    productId: product.id,
                    title: productTitle,
                    htmlLength: fullHtml.length,
                    videosUsed: selectedVideoIds.length,
                    confidence: reranked.confidence,
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
