'use client';

// Client wrapper for the Vibe Builder page
// Handles save (POST version) and publish (POST publish)

import { useRouter } from 'next/navigation';
import { VibeBuilder } from '@/components/builder/vibe-builder';
import type { ProductDSL } from '@/types/product-dsl';

interface Props {
    productId: string;
    productTitle: string;
    productType: string;
    initialDsl: ProductDSL | null;
    buildPacket: Record<string, unknown> | null;
}

export function BuilderPageClient({ productId, initialDsl, buildPacket }: Props) {
    const router = useRouter();

    async function handleSave(dsl: ProductDSL) {
        await fetch(`/api/products/${productId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dslJson: dsl,
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
            onSave={handleSave}
            onPublish={handlePublish}
        />
    );
}
