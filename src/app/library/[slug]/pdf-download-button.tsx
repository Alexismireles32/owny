'use client';

// Client component for PDF download via signed URL
// PRD M7 — Handles the fetch → signed URL → window.open flow

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
    slug: string;
    primaryColor: string;
}

export function PdfDownloadButton({ slug, primaryColor }: Props) {
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await fetch(`/api/content/${slug}/download`);
            const data = await res.json();
            if (data.downloadUrl) {
                window.open(data.downloadUrl, '_blank');
            }
        } catch {
            // Silently fail — user can retry
        }
        setDownloading(false);
    };

    return (
        <Button
            style={{ backgroundColor: primaryColor }}
            className="text-white"
            onClick={handleDownload}
            disabled={downloading}
        >
            {downloading ? 'Preparing…' : 'Download PDF'}
        </Button>
    );
}
