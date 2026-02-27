'use client';

import { useCallback, useState } from 'react';
import { StorefrontPreview } from './StorefrontPreview';

interface DashboardStorefrontViewProps {
    creatorId: string;
    handle: string;
}

export function DashboardStorefrontView({ creatorId, handle }: DashboardStorefrontViewProps) {
    const [storefrontKey, setStorefrontKey] = useState(0);

    const refreshStorefront = useCallback(() => {
        setStorefrontKey((prev) => prev + 1);
    }, []);

    return (
        <div className="h-full min-h-0">
            <StorefrontPreview
                creatorId={creatorId}
                handle={handle}
                storefrontKey={storefrontKey}
                onRestyle={refreshStorefront}
            />
        </div>
    );
}
