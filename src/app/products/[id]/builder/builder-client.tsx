'use client';

// Client wrapper for the Vibe Builder page
// Handles save (POST version with DSL + HTML) and publish

import { useRouter } from 'next/navigation';
import { VibeBuilder } from '@/components/builder/vibe-builder';
import type { ProductDSL } from '@/types/product-dsl';
import { getApiErrorMessage, readJsonSafe } from '@/lib/utils';

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

    async function handleSave(dsl: ProductDSL, html: string | null, nextBuildPacket: Record<string, unknown>) {
        const res = await fetch(`/api/products/${productId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dslJson: dsl,
                generatedHtml: html,
                buildPacket: nextBuildPacket || buildPacket || {},
            }),
        });

        if (!res.ok) {
            const payload = await readJsonSafe<{ error?: string }>(res);
            throw new Error(getApiErrorMessage(payload, 'Failed to save product changes.'));
        }
    }

    async function handlePublish() {
        const res = await fetch(`/api/products/${productId}/publish`, {
            method: 'POST',
        });

        if (!res.ok) {
            const payload = await readJsonSafe<{ error?: string }>(res);
            throw new Error(getApiErrorMessage(payload, 'Failed to publish this product.'));
        }

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
