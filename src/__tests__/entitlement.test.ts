// Test: Entitlement checking
// PRD §8.7: Content delivery requires active entitlement

import { describe, it, expect, beforeEach } from 'vitest';

// Simulate entitlement checking logic (mirrors /api/content/[slug]/download)
interface Entitlement {
    buyer_profile_id: string;
    product_id: string;
    status: 'active' | 'revoked' | 'expired';
}

class MockEntitlementStore {
    private entitlements: Entitlement[] = [];

    addEntitlement(buyerId: string, productId: string, status: Entitlement['status'] = 'active') {
        this.entitlements.push({
            buyer_profile_id: buyerId,
            product_id: productId,
            status,
        });
    }

    checkEntitlement(buyerId: string, productId: string): Entitlement | null {
        return this.entitlements.find(
            (e) => e.buyer_profile_id === buyerId && e.product_id === productId && e.status === 'active'
        ) || null;
    }

    revokeEntitlement(buyerId: string, productId: string) {
        const ent = this.entitlements.find(
            (e) => e.buyer_profile_id === buyerId && e.product_id === productId
        );
        if (ent) ent.status = 'revoked';
    }

    clear() {
        this.entitlements = [];
    }
}

function handleDownloadRequest(
    store: MockEntitlementStore,
    userId: string | null,
    productId: string
): { status: number; body: Record<string, unknown> } {
    // Must be authenticated
    if (!userId) {
        return { status: 401, body: { error: 'Unauthorized' } };
    }

    // Check entitlement
    const entitlement = store.checkEntitlement(userId, productId);
    if (!entitlement) {
        return { status: 403, body: { error: 'Not entitled to this product' } };
    }

    // Return signed URL
    return {
        status: 200,
        body: {
            downloadUrl: `https://storage.example.com/products/${productId}/output.pdf?token=signed`,
            filename: 'product.pdf',
        },
    };
}

describe('Entitlement Checking', () => {
    let store: MockEntitlementStore;

    beforeEach(() => {
        store = new MockEntitlementStore();
    });

    it('should allow download for user with active entitlement', () => {
        store.addEntitlement('buyer1', 'product1', 'active');

        const result = handleDownloadRequest(store, 'buyer1', 'product1');
        expect(result.status).toBe(200);
        expect(result.body.downloadUrl).toBeDefined();
    });

    it('should return 403 for user without entitlement', () => {
        const result = handleDownloadRequest(store, 'buyer1', 'product1');
        expect(result.status).toBe(403);
        expect(result.body.error).toBe('Not entitled to this product');
    });

    it('should return 401 for unauthenticated user', () => {
        const result = handleDownloadRequest(store, null, 'product1');
        expect(result.status).toBe(401);
        expect(result.body.error).toBe('Unauthorized');
    });

    it('should return 403 for revoked entitlement', () => {
        store.addEntitlement('buyer1', 'product1', 'active');
        store.revokeEntitlement('buyer1', 'product1');

        const result = handleDownloadRequest(store, 'buyer1', 'product1');
        expect(result.status).toBe(403);
    });

    it('should return 403 for expired entitlement', () => {
        store.addEntitlement('buyer1', 'product1', 'expired');

        const result = handleDownloadRequest(store, 'buyer1', 'product1');
        expect(result.status).toBe(403);
    });

    it('should not allow cross-product access', () => {
        store.addEntitlement('buyer1', 'product1', 'active');

        const result = handleDownloadRequest(store, 'buyer1', 'product2');
        expect(result.status).toBe(403);
    });

    it('should not allow cross-user access', () => {
        store.addEntitlement('buyer1', 'product1', 'active');

        const result = handleDownloadRequest(store, 'buyer2', 'product1');
        expect(result.status).toBe(403);
    });

    it('should handle multiple entitlements correctly', () => {
        store.addEntitlement('buyer1', 'product1', 'active');
        store.addEntitlement('buyer1', 'product2', 'active');
        store.addEntitlement('buyer2', 'product1', 'active');

        expect(handleDownloadRequest(store, 'buyer1', 'product1').status).toBe(200);
        expect(handleDownloadRequest(store, 'buyer1', 'product2').status).toBe(200);
        expect(handleDownloadRequest(store, 'buyer2', 'product1').status).toBe(200);
        expect(handleDownloadRequest(store, 'buyer2', 'product2').status).toBe(403);
    });
});
