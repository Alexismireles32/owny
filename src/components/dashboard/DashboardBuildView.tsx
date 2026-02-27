'use client';

import { useCallback } from 'react';
import { ProductBuilder } from './ProductBuilder';

interface DashboardBuildViewProps {
    creatorId: string;
    displayName: string;
}

export function DashboardBuildView({ creatorId, displayName }: DashboardBuildViewProps) {
    const handleProductCreated = useCallback(() => {
        // Build view is now standalone; no cross-panel refresh is needed.
    }, []);

    return (
        <div className="h-full min-h-0">
            <ProductBuilder
                creatorId={creatorId}
                displayName={displayName}
                onProductCreated={handleProductCreated}
            />
        </div>
    );
}
