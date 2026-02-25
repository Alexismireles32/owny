// Test: DSL schema validation
// PRD §6.2 requires JSON schema validation on all AI outputs
// Block types MUST match PRD §6.2 exactly (PascalCase)

import { describe, it, expect } from 'vitest';

// PRD §6.2 — all 15 allowed block types
const VALID_BLOCK_TYPES = [
    'Hero', 'TextSection', 'Bullets', 'Steps', 'Checklist',
    'Image', 'Testimonial', 'FAQ', 'CTA', 'Pricing',
    'Divider', 'ModuleHeader', 'LessonContent', 'DayHeader', 'DownloadButton',
];

// Inline validateProductDSL logic for unit testing (mirrors src/lib/ai/router.ts)
function validateProductDSL(dsl: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!dsl || typeof dsl !== 'object') {
        return { valid: false, errors: ['DSL must be an object'] };
    }

    // Must have pages array
    const pages = dsl.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
        errors.push('DSL must have at least one page');
    } else {
        const blockIds = new Set<string>();

        for (const page of pages) {
            if (!page.id || typeof page.id !== 'string') {
                errors.push('Each page must have a string id');
            }
            if (!page.type || typeof page.type !== 'string') {
                errors.push('Each page must have a string type');
            }
            if (!Array.isArray(page.blocks)) {
                errors.push(`Page "${page.id}" must have a blocks array`);
            } else {
                for (const block of page.blocks) {
                    if (!block.id || typeof block.id !== 'string') {
                        errors.push('Each block must have a string id');
                    }
                    if (!block.type || typeof block.type !== 'string') {
                        errors.push('Each block must have a string type');
                    }

                    // Check for duplicate IDs
                    if (block.id && blockIds.has(block.id)) {
                        errors.push(`Duplicate block ID: "${block.id}"`);
                    }
                    blockIds.add(block.id);

                    // Validate known block types (PRD §6.2)
                    if (block.type && !VALID_BLOCK_TYPES.includes(block.type)) {
                        errors.push(`Invalid block type: "${block.type}"`);
                    }
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

describe('DSL Schema Validation', () => {
    it('should pass for a valid DSL with PRD block types', () => {
        const validDSL = {
            pages: [
                {
                    id: 'pg_sales',
                    type: 'sales',
                    blocks: [
                        {
                            id: 'blk_hero0001',
                            type: 'Hero',
                            variant: 'centered',
                            props: { headline: 'Test Product', subhead: 'A great product' },
                        },
                    ],
                },
                {
                    id: 'pg_content1',
                    type: 'content',
                    blocks: [
                        {
                            id: 'blk_text0001',
                            type: 'TextSection',
                            variant: 'standard',
                            props: { heading: 'Introduction', body: 'Hello world' },
                        },
                        {
                            id: 'blk_bull0001',
                            type: 'Bullets',
                            variant: 'checkmark',
                            props: { heading: 'Key Points', items: ['item 1', 'item 2'] },
                        },
                    ],
                },
            ],
        };

        const result = validateProductDSL(validDSL);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail when pages array is missing', () => {
        const result = validateProductDSL({});
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('DSL must have at least one page');
    });

    it('should fail when pages array is empty', () => {
        const result = validateProductDSL({ pages: [] });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('DSL must have at least one page');
    });

    it('should fail for invalid block types', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: [
                        { id: 'b1', type: 'nonexistent_block', props: {} },
                    ],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid block type: "nonexistent_block"');
    });

    it('should fail for lowercase block types (must be PascalCase per PRD)', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: [
                        { id: 'b1', type: 'hero', props: {} },
                    ],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid block type: "hero"');
    });

    it('should fail for duplicate block IDs', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: [
                        { id: 'b1', type: 'TextSection', props: {} },
                        { id: 'b1', type: 'Hero', props: {} },
                    ],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Duplicate block ID: "b1"');
    });

    it('should fail when page is missing id', () => {
        const dsl = {
            pages: [
                {
                    type: 'content',
                    blocks: [{ id: 'b1', type: 'TextSection', props: {} }],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Each page must have a string id');
    });

    it('should fail when block is missing id', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: [{ type: 'TextSection', props: {} }],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Each block must have a string id');
    });

    it('should validate all 15 PRD block types', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: VALID_BLOCK_TYPES.map((t, i) => ({
                        id: `blk_${String(i).padStart(4, '0')}`,
                        type: t,
                        variant: 'standard',
                        props: {},
                    })),
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should reject blocks with empty type string', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: [{ id: 'b1', type: '', props: {} }],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
    });
});
