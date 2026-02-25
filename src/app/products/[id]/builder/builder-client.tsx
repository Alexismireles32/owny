'use client';

// Client wrapper for the Vibe Builder page
// Handles save (POST version with DSL + HTML) and publish

import { useRouter } from 'next/navigation';
import { VibeBuilder } from '@/components/builder/vibe-builder';
import type { ProductDSL } from '@/types/product-dsl';

interface Props {
    productId: string;
    productTitle: string;
    productType: string;
    initialDsl: ProductDSL | null;
    initialHtml: string | null;
    buildPacket: Record<string, unknown> | null;
}

export function BuilderPageClient({ productId, initialDsl, initialHtml, buildPacket }: Props) {
    const router = useRouter();

    async function handleSave(dsl: ProductDSL, html: string | null) {
        await fetch(`/api/products/${productId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dslJson: dsl,
                generatedHtml: html,
                buildPacket: buildPacket || {},
            }),
        });
    }

    async function handlePublish() {
        await fetch(`/api/products/${productId}/publish`, {
            method: 'POST',
        });
        router.push(`/products/${productId}`);
    }

    return (
        <VibeBuilder
            productId={productId}
            initialDsl={initialDsl}
            initialHtml={initialHtml}
            initialBuildPacket={buildPacket}
            onSave={handleSave}
            onPublish={handlePublish}
        />
    );
}
