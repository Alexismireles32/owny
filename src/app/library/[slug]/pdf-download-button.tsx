'use client';

// Client component for PDF download via signed URL
// PRD M7 — Handles the fetch → signed URL → window.open flow

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

interface Props {
    slug: string;
    primaryColor: string;
}

export function PdfDownloadButton({ slug, primaryColor }: Props) {
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDownload = async () => {
        setDownloading(true);
        setError(null);
        try {
            const res = await fetch(`/api/content/${slug}/download`);
            const data = await readJsonSafe<{ downloadUrl?: string; error?: string }>(res);

            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = `/sign-in?next=${encodeURIComponent(`/library/${slug}`)}`;
                    return;
                }
                setError(getApiErrorMessage(data, 'Could not prepare your PDF download.'));
                return;
            }

            if (data?.downloadUrl) {
                window.open(data.downloadUrl, '_blank');
                return;
            }

            setError('Could not prepare your PDF download.');
        } catch {
            setError('Network error while preparing your PDF download.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="space-y-2">
            <Button
                style={{ backgroundColor: primaryColor }}
                className="text-white"
                onClick={handleDownload}
                disabled={downloading}
            >
                {downloading ? 'Preparing…' : 'Download PDF'}
            </Button>
            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}
        </div>
    );
}
