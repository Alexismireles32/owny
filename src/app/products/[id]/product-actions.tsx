'use client';

// Client component for product publish/archive actions

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
    productId: string;
    status: string;
}

export function ProductActions({ productId, status }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handlePublish() {
        setLoading(true);
        try {
            const res = await fetch(`/api/products/${productId}/publish`, { method: 'POST' });
            if (res.ok) router.refresh();
        } catch { /* ignore */ }
        setLoading(false);
    }

    async function handleArchive() {
        setLoading(true);
        try {
            const res = await fetch(`/api/products/${productId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'archived' }),
            });
            if (res.ok) router.refresh();
        } catch { /* ignore */ }
        setLoading(false);
    }

    async function handleRollback() {
        setLoading(true);
        try {
            const res = await fetch(`/api/products/${productId}/rollback`, { method: 'POST' });
            if (res.ok) router.refresh();
        } catch { /* ignore */ }
        setLoading(false);
    }

    return (
        <div className="flex items-center gap-2">
            {status === 'draft' && (
                <Button size="sm" onClick={handlePublish} disabled={loading}>
                    Publish
                </Button>
            )}
            {status === 'published' && (
                <>
                    <Button size="sm" variant="outline" onClick={handleRollback} disabled={loading}>
                        Rollback
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleArchive} disabled={loading}>
                        Archive
                    </Button>
                </>
            )}
            {status === 'archived' && (
                <Button size="sm" onClick={handlePublish} disabled={loading}>
                    Re-publish
                </Button>
            )}
        </div>
    );
}
