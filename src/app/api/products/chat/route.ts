// POST /api/products/chat — Lovable-style product builder chat
// Creates products based on creator's content and user prompts

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { creatorId, message } = await request.json();

    if (!creatorId || !message) {
        return NextResponse.json({ error: 'creatorId and message are required' }, { status: 400 });
    }

    // Verify ownership
    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle, display_name')
        .eq('id', creatorId)
        .eq('profile_id', user.id)
        .single();

    if (!creator) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 403 });
    }

    // Fetch creator's transcripts for context
    const { data: transcripts } = await supabase
        .from('video_transcripts')
        .select('title, description, transcript_text, views, likes')
        .eq('creator_id', creatorId)
        .order('views', { ascending: false })
        .limit(20);

    const contentContext = (transcripts || [])
        .map((t, i) => `[Video ${i + 1}] "${t.title || 'Untitled'}" (${t.views || 0} views)\n${t.transcript_text || t.description || ''}`)
        .join('\n\n');

    // Detect product type from prompt
    const promptLower = message.toLowerCase();
    let productType = 'pdf_guide';
    if (promptLower.includes('course') || promptLower.includes('lesson')) productType = 'mini_course';
    else if (promptLower.includes('challenge') || promptLower.includes('7-day') || promptLower.includes('7 day')) productType = 'challenge_7day';
    else if (promptLower.includes('checklist') || promptLower.includes('toolkit') || promptLower.includes('tool')) productType = 'checklist_toolkit';

    // Generate a title from the prompt
    const titleWords = message.replace(/create|make|build|a|an|the|my|me/gi, '').trim();
    const title = titleWords.charAt(0).toUpperCase() + titleWords.slice(1);
    const cleanTitle = title.length > 5 ? title.slice(0, 80) : `${creator.display_name}'s ${productType === 'pdf_guide' ? 'Guide' : productType === 'mini_course' ? 'Course' : productType === 'challenge_7day' ? 'Challenge' : 'Toolkit'}`;

    // Generate slug
    const slug = cleanTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) + '-' + Date.now().toString(36);

    // Create the product as a draft
    const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
            creator_id: creatorId,
            slug,
            type: productType,
            title: cleanTitle,
            description: `Created from: "${message}"`,
            status: 'draft',
            access_type: 'paid',
            price_cents: 999,
            currency: 'usd',
        })
        .select('id, title, type, status')
        .single();

    if (productError) {
        return NextResponse.json({
            error: `Failed to create product: ${productError.message}`,
        }, { status: 500 });
    }

    // Create initial version with build context
    const buildPacket = {
        userPrompt: message,
        productType,
        title: cleanTitle,
        audience: 'general',
        tone: 'professional',
        creatorHandle: creator.handle,
        creatorName: creator.display_name,
        contentSummary: contentContext.slice(0, 2000),
        transcriptCount: transcripts?.length || 0,
        // Include top video titles for AI context
        topVideoTitles: (transcripts || []).slice(0, 5).map(t => t.title || 'Untitled'),
        // Include brief transcript snippets for content seeding
        clips: (transcripts || []).slice(0, 8).map(t => ({
            title: t.title || 'Untitled',
            snippet: (t.transcript_text || t.description || '').slice(0, 300),
            views: t.views || 0,
        })),
    };

    const { data: version } = await supabase
        .from('product_versions')
        .insert({
            product_id: product.id,
            version_number: 1,
            build_packet: buildPacket,
            dsl_json: {},
            source_video_ids: [],
        })
        .select('id')
        .single();

    if (version) {
        await supabase
            .from('products')
            .update({ active_version_id: version.id })
            .eq('id', product.id);
    }

    // Build response message
    const typeLabel = {
        pdf_guide: 'PDF Guide',
        mini_course: 'Mini Course',
        challenge_7day: '7-Day Challenge',
        checklist_toolkit: 'Checklist Toolkit',
    }[productType] || productType;

    const responseMessage = `I've created **"${cleanTitle}"** as a ${typeLabel}! 🎉\n\nIt's saved as a draft with ${transcripts?.length || 0} video transcripts ready for content generation.\n\n👉 **[Open the Vibe Builder →](/products/${product.id}/builder)** to design your product page with AI.`;

    return NextResponse.json({
        message: responseMessage,
        productId: product.id,
        productTitle: cleanTitle,
        productType,
    });
}
