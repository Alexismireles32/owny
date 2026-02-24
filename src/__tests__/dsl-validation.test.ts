// Test: DSL schema validation
// PRD requires JSON schema validation on all AI outputs

import { describe, it, expect } from 'vitest';

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

                    // Validate known block types
                    const validTypes = [
                        'hero', 'text', 'image', 'video', 'list', 'callout',
                        'quote', 'divider', 'spacer', 'cta', 'faq',
                        'testimonial', 'pricing', 'checklist', 'accordion',
                    ];
                    if (block.type && !validTypes.includes(block.type)) {
                        errors.push(`Invalid block type: "${block.type}"`);
                    }
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

describe('DSL Schema Validation', () => {
    it('should pass for a valid DSL', () => {
        const validDSL = {
            pages: [
                {
                    id: 'cover',
                    type: 'cover',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'hero',
                            variant: 'centered',
                            props: { headline: 'Test Product' },
                        },
                    ],
                },
                {
                    id: 'content-1',
                    type: 'content',
                    blocks: [
                        {
                            id: 'b2',
                            type: 'text',
                            variant: 'body',
                            props: { content: 'Hello world' },
                        },
                        {
                            id: 'b3',
                            type: 'list',
                            variant: 'numbered',
                            props: { items: ['item 1', 'item 2'] },
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

    it('should fail for duplicate block IDs', () => {
        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: [
                        { id: 'b1', type: 'text', props: {} },
                        { id: 'b1', type: 'hero', props: {} },
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
                    blocks: [{ id: 'b1', type: 'text', props: {} }],
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
                    blocks: [{ type: 'text', props: {} }],
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Each block must have a string id');
    });

    it('should validate all 15 supported block types', () => {
        const types = [
            'hero', 'text', 'image', 'video', 'list', 'callout',
            'quote', 'divider', 'spacer', 'cta', 'faq',
            'testimonial', 'pricing', 'checklist', 'accordion',
        ];

        const dsl = {
            pages: [
                {
                    id: 'p1',
                    type: 'content',
                    blocks: types.map((t, i) => ({
                        id: `b${i}`,
                        type: t,
                        props: {},
                    })),
                },
            ],
        };

        const result = validateProductDSL(dsl);
        expect(result.valid).toBe(true);
    });
});
