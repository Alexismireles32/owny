'use client';

// Client component for product publish/archive actions

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

interface Props {
    productId: string;
    status: string;
}

export function ProductActions({ productId, status }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function executeAction(request: Promise<Response>, fallback: string) {
        setError(null);
        setLoading(true);
        try {
            const res = await request;
            const payload = await readJsonSafe<{ error?: string }>(res);
            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    router.push('/sign-in?next=%2Fdashboard');
                    return;
                }
                setError(getApiErrorMessage(payload, fallback));
                return;
            }
            router.refresh();
        } catch {
            setError(fallback);
        } finally {
            setLoading(false);
        }
    }

    async function handlePublish() {
        await executeAction(
            fetch(`/api/products/${productId}/publish`, { method: 'POST' }),
            'Could not publish this product.'
        );
    }

    async function handleArchive() {
        await executeAction(
            fetch(`/api/products/${productId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'archived' }),
            }),
            'Could not archive this product.'
        );
    }

    async function handleRollback() {
        await executeAction(
            fetch(`/api/products/${productId}/rollback`, { method: 'POST' }),
            'Could not rollback this product version.'
        );
    }

    return (
        <div className="space-y-2">
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
            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}
        </div>
    );
}
