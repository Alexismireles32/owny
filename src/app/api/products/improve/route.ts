// POST /api/products/improve — SSE streaming endpoint for follow-up product edits
// Takes current HTML + instruction, streams the improved version

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { postProcessHTML } from '@/lib/ai/router';
import { log } from '@/lib/logger';

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

const HTML_IMPROVE_PROMPT = `You are a Digital Product Editor. You receive an HTML page containing a real digital product (a guide, course, challenge, or toolkit) and an improvement instruction.

RULES:
- Output ONLY the complete improved HTML page. No commentary, no markdown fences.
- This is an ACTUAL digital product — NOT a landing page. Keep it as product content.
- Make SURGICAL, TARGETED changes based on the instruction.
- DO NOT rewrite or regenerate sections that the instruction doesn't mention.
- Keep all unchanged sections EXACTLY as they are, character for character.
- Maintain all Tailwind classes, Alpine.js behavior, and CDN script tags.
- Preserve the overall product structure (chapters, lessons, days, categories).
- If asked to add content, add REAL, substantive content — not placeholder text.
- If asked to change tone, update the writing style throughout while keeping facts intact.
- If asked to fix a specific section, ONLY edit that section.
- If asked to add a chapter/lesson, insert it in the correct position without disrupting existing content.
- NEVER remove existing content unless explicitly asked to delete something.`;

/** Extract a numbered list of section IDs and headings from HTML for targeted edits */
function extractSectionList(html: string): string {
    const sections: string[] = [];
    // Match section IDs
    const sectionIdRegex = /<section[^>]*id="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = sectionIdRegex.exec(html)) !== null) {
        sections.push(`- Section: #${match[1]}`);
    }
    // Match h2 headings
    const h2Regex = /<h2[^>]*>([^<]{3,80})/gi;
    let h2Match;
    let idx = 1;
    while ((h2Match = h2Regex.exec(html)) !== null) {
        const title = h2Match[1].replace(/&[^;]+;/g, '').trim();
        if (title) {
            sections.push(`- Heading ${idx}: "${title}"`);
            idx++;
        }
    }
    return sections.length > 0 ? sections.join('\n') : '(no named sections found)';
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    let body: { productId: string; instruction: string; currentHtml: string };
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    const { productId, instruction, currentHtml } = body;
    if (!productId || !instruction || !currentHtml) {
        return new Response(JSON.stringify({ error: 'productId, instruction, and currentHtml required' }), { status: 400 });
    }

    const { data: creator, error: creatorError } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

    if (creatorError) {
        return new Response(JSON.stringify({ error: creatorError.message }), { status: 500 });
    }

    if (!creator) {
        return new Response(JSON.stringify({ error: 'Creator profile required' }), { status: 403 });
    }

    const db = getServiceDb();
    const { data: product } = await db
        .from('products')
        .select('id, creator_id, title')
        .eq('id', productId)
        .eq('creator_id', creator.id)
        .single();

    if (!product) {
        return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            try {
                send({ type: 'status', message: '✏️ Improving your product...', phase: 'improving' });

                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
                let fullHtml = '';

                try {
                    const aiStream = anthropic.messages.stream({
                        model: 'claude-sonnet-4-6',
                        max_tokens: 16384,
                        system: HTML_IMPROVE_PROMPT,
                        messages: [{
                            role: 'user',
                            content: `Here is the current digital product HTML:\n\n${currentHtml}\n\nSECTIONS FOUND IN THIS DOCUMENT:\n${extractSectionList(currentHtml)}\n\nIMPROVEMENT INSTRUCTION: ${instruction}\n\nOutput the complete improved HTML document. Remember: this is a REAL product (guide/course/challenge/toolkit), not a landing page. Only modify what the instruction asks for — keep everything else EXACTLY the same.`,
                        }],
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
                } catch (claudeErr) {
                    log.error('Claude improve failed, trying Kimi', {
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
                            { role: 'system', content: HTML_IMPROVE_PROMPT },
                            {
                                role: 'user',
                                content: `Here is the current digital product HTML:\n\n${currentHtml}\n\nIMPROVEMENT INSTRUCTION: ${instruction}\n\nOutput the complete improved HTML document.`,
                            },
                        ],
                        temperature: 0.6,
                        max_tokens: 16000,
                    });

                    fullHtml = result.choices[0]?.message?.content ?? '';
                }

                fullHtml = postProcessHTML(fullHtml);
                send({ type: 'html_complete', html: fullHtml });

                send({ type: 'status', message: '💾 Saving changes...', phase: 'saving' });

                const { data: latestVersion } = await db
                    .from('product_versions')
                    .select('version_number')
                    .eq('product_id', productId)
                    .order('version_number', { ascending: false })
                    .limit(1)
                    .single();

                const nextVersion = (latestVersion?.version_number || 0) + 1;

                const { data: version } = await db
                    .from('product_versions')
                    .insert({
                        product_id: productId,
                        version_number: nextVersion,
                        build_packet: { improvementInstruction: instruction },
                        dsl_json: {},
                        generated_html: fullHtml,
                        source_video_ids: [],
                    })
                    .select('id')
                    .single();

                if (version) {
                    await db
                        .from('products')
                        .update({ active_version_id: version.id })
                        .eq('id', productId);
                }

                send({
                    type: 'complete',
                    productId,
                    versionId: version?.id,
                });

                log.info('Product improved', {
                    productId,
                    instruction: instruction.slice(0, 100),
                    htmlLength: fullHtml.length,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                log.error('Improve stream error', { error: msg });
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
