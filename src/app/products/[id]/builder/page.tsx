// /products/[id]/builder — Vibe Builder page wrapper
// PRD M10: Server component that loads DSL and wraps the client VibeBuilder

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { BuilderPageClient } from './builder-client';

interface Props {
    params: Promise<{ id: string }>;
}

export default async function BuilderPage({ params }: Props) {
    const { id } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    // Verify ownership
    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) redirect('/onboard');

    // Fetch product
    const { data: product } = await supabase
        .from('products')
        .select('id, title, type, status, active_version_id, creator_id')
        .eq('id', id)
        .single();

    if (!product || product.creator_id !== creator.id) notFound();

    // Fetch active version DSL
    let dslJson = null;
    let buildPacket = null;
    if (product.active_version_id) {
        const { data: version } = await supabase
            .from('product_versions')
            .select('dsl_json, build_packet')
            .eq('id', product.active_version_id)
            .single();
        dslJson = version?.dsl_json || null;
        buildPacket = version?.build_packet || null;
    }

    return (
        <BuilderPageClient
            productId={product.id}
            productTitle={product.title}
            productType={product.type}
            initialDsl={dslJson}
            buildPacket={buildPacket}
        />
    );
}
