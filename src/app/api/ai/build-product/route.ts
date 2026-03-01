// POST /api/ai/build-product
// Deprecated: product generation is centralized in /api/products/build

import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({
        error: 'Product generation now runs exclusively through /api/products/build. Use Studio on the dashboard to create products.',
        manualEditRequired: true,
    }, { status: 410 });
}
