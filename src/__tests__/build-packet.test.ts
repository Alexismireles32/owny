// Test: Build Packet validation
// PRD §8.5: Build Packet must have valid structure

import { describe, it, expect } from 'vitest';

interface BuildPacket {
    productType: string;
    userPrompt: string;
    audience?: string;
    tone?: string;
    sources: Array<{
        videoId: string;
        title: string | null;
        clipCard: Record<string, unknown> | null;
        reason: string;
    }>;
    creator: {
        handle: string;
        displayName: string;
        brandTokens: {
            primaryColor: string;
            fontFamily: string;
            mood: string;
        };
    };
    designIntent?: {
        mood?: string;
    };
    outline?: {
        chapters: Array<{ title: string; description: string }>;
    };
}

function validateBuildPacket(packet: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!packet || typeof packet !== 'object') {
        return { valid: false, errors: ['Build packet must be an object'] };
    }

    const validTypes = ['pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit'];

    if (!packet.productType || typeof packet.productType !== 'string') {
        errors.push('productType is required and must be a string');
    } else if (!validTypes.includes(packet.productType as string)) {
        errors.push(`productType must be one of: ${validTypes.join(', ')}`);
    }

    if (!packet.userPrompt || typeof packet.userPrompt !== 'string') {
        errors.push('userPrompt is required and must be a string');
    }

    if (!packet.sources || !Array.isArray(packet.sources)) {
        errors.push('sources must be an array');
    } else if (packet.sources.length === 0) {
        errors.push('sources must contain at least one video');
    } else {
        for (const src of packet.sources as Array<Record<string, unknown>>) {
            if (!src.videoId || typeof src.videoId !== 'string') {
                errors.push('Each source must have a videoId');
            }
            if (!src.reason || typeof src.reason !== 'string') {
                errors.push('Each source must have a reason');
            }
        }
    }

    if (!packet.creator || typeof packet.creator !== 'object') {
        errors.push('creator is required');
    } else {
        const creator = packet.creator as Record<string, unknown>;
        if (!creator.handle) errors.push('creator.handle is required');
        if (!creator.displayName) errors.push('creator.displayName is required');
        if (!creator.brandTokens || typeof creator.brandTokens !== 'object') {
            errors.push('creator.brandTokens is required');
        }
    }

    // Type-specific validation
    if (packet.productType === 'pdf_guide' && packet.outline) {
        const outline = packet.outline as Record<string, unknown>;
        if (!Array.isArray(outline.chapters) || outline.chapters.length === 0) {
            errors.push('PDF guide outline must have at least one chapter');
        }
    }

    if (packet.productType === 'mini_course' && packet.outline) {
        const outline = packet.outline as Record<string, unknown>;
        if (!Array.isArray(outline.chapters) || outline.chapters.length === 0) {
            errors.push('Mini course outline must have at least one lesson');
        }
    }

    return { valid: errors.length === 0, errors };
}

describe('Build Packet Validation', () => {
    const validPacket: BuildPacket = {
        productType: 'pdf_guide',
        userPrompt: 'Create a productivity guide from my best videos',
        sources: [
            { videoId: 'vid1', title: 'Morning Routine', clipCard: null, reason: 'Covers productivity basics' },
            { videoId: 'vid2', title: 'Deep Work', clipCard: null, reason: 'Advanced focus techniques' },
        ],
        creator: {
            handle: 'testcreator',
            displayName: 'Test Creator',
            brandTokens: {
                primaryColor: '#6366f1',
                fontFamily: 'inter',
                mood: 'professional',
            },
        },
    };

    it('should pass for a valid build packet', () => {
        const result = validateBuildPacket(validPacket as unknown as Record<string, unknown>);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail when productType is missing', () => {
        const packet = { ...validPacket, productType: undefined };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('productType is required and must be a string');
    });

    it('should fail for invalid productType', () => {
        const packet = { ...validPacket, productType: 'invalid_type' };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('productType must be one of');
    });

    it('should fail when userPrompt is missing', () => {
        const packet = { ...validPacket, userPrompt: undefined };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('userPrompt is required and must be a string');
    });

    it('should fail when sources is empty', () => {
        const packet = { ...validPacket, sources: [] };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('sources must contain at least one video');
    });

    it('should fail when source is missing videoId', () => {
        const packet = {
            ...validPacket,
            sources: [{ title: 'Test', clipCard: null, reason: 'test' }],
        };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Each source must have a videoId');
    });

    it('should fail when source is missing reason', () => {
        const packet = {
            ...validPacket,
            sources: [{ videoId: 'vid1', title: 'Test', clipCard: null }],
        };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Each source must have a reason');
    });

    it('should fail when creator is missing', () => {
        const packet = { ...validPacket, creator: undefined };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('creator is required');
    });

    it('should fail when creator.handle is missing', () => {
        const packet = {
            ...validPacket,
            creator: { ...validPacket.creator, handle: '' },
        };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('creator.handle is required');
    });

    it('should accept all valid product types', () => {
        const types = ['pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit'];
        for (const type of types) {
            const packet = { ...validPacket, productType: type };
            const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
            expect(result.valid).toBe(true);
        }
    });

    it('should validate pdf_guide outline when present', () => {
        const packet = {
            ...validPacket,
            productType: 'pdf_guide',
            outline: { chapters: [] },
        };
        const result = validateBuildPacket(packet as unknown as Record<string, unknown>);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('PDF guide outline must have at least one chapter');
    });
});
