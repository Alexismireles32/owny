import { describe, expect, it } from 'vitest';
import {
    buildHeuristicImprovePlan,
    coerceImprovedSectionHtml,
    resolveImproveTargeting,
    type SectionSlice,
} from '@/lib/ai/kimi-product-improve';

const sections: SectionSlice[] = [
    {
        id: 'module-1',
        title: 'Batch Map Foundation',
        rawHtml: '<!-- sources: video-1 -->\n<section id="module-1"></section>',
        sourceVideoIds: ['video-1'],
    },
    {
        id: 'module-2',
        title: 'Hook Library',
        rawHtml: '<!-- sources: video-2 -->\n<section id="module-2"></section>',
        sourceVideoIds: ['video-2'],
    },
    {
        id: 'module-5',
        title: 'Finish Line and CTA',
        rawHtml: '<!-- sources: video-5 -->\n<section id="module-5"></section>',
        sourceVideoIds: ['video-5'],
    },
];

describe('resolveImproveTargeting', () => {
    it('builds a heuristic plan for clearly scoped section edits', () => {
        const plan = buildHeuristicImprovePlan({
            instruction: 'Make the opening feel more premium, sharpen the promise, and tighten the final call to action.',
            sections,
        });

        expect(plan).not.toBeNull();
        expect(plan?.scope).toBe('multi');
        expect(plan?.targetSectionIds).toEqual(['module-1', 'module-5']);
    });

    it('narrows opening-and-cta requests to the first and last sections', () => {
        const targeting = resolveImproveTargeting({
            instruction: 'Make the opening feel more premium, sharpen the promise, and tighten the final call to action.',
            sections,
            plan: {
                scope: 'global',
                targetSectionIds: [],
                shellChange: false,
                strategy: 'Refine the product.',
            },
        });

        expect(targeting.shellOnly).toBe(false);
        expect(targeting.touchedSectionIds).toEqual(['module-1', 'module-5']);
    });

    it('preserves truly global rewrite requests', () => {
        const targeting = resolveImproveTargeting({
            instruction: 'Redesign the whole product so every section feels more editorial and atmospheric throughout.',
            sections,
            plan: {
                scope: 'global',
                targetSectionIds: [],
                shellChange: true,
                strategy: 'Rewrite globally.',
            },
        });

        expect(targeting.shellChange).toBe(true);
        expect(targeting.touchedSectionIds).toEqual(['module-1', 'module-2', 'module-5']);
    });

    it('returns a shell-only heuristic plan for framing-only edits', () => {
        const plan = buildHeuristicImprovePlan({
            instruction: 'Redesign the hero and page framing so it feels more editorial.',
            sections,
        });

        expect(plan).not.toBeNull();
        expect(plan?.shellChange).toBe(true);
        expect(plan?.targetSectionIds).toEqual([]);
    });

    it('honors explicit section references from the instruction when the planner is vague', () => {
        const targeting = resolveImproveTargeting({
            instruction: 'Tighten module 2 and make Hook Library feel more specific.',
            sections,
            plan: {
                scope: 'multi',
                targetSectionIds: [],
                shellChange: false,
                strategy: 'Tighten the copy.',
            },
        });

        expect(targeting.touchedSectionIds).toEqual(['module-2']);
    });

    it('extracts a valid section block from overly broad model output', () => {
        const coerced = coerceImprovedSectionHtml({
            originalSection: sections[0],
            candidateHtml: `<!doctype html>
<html>
  <body>
    <section id="module-1"><h2>Updated intro</h2><p>Sharper promise.</p></section>
    <section id="module-2"><h2>Other section</h2></section>
  </body>
</html>`,
        });

        expect(coerced).toContain('<section id="module-1">');
        expect(coerced).not.toContain('<section id="module-2">');
        expect(coerced).toContain('<!-- sources:');
    });

    it('falls back to the original section when the model returns no valid section block', () => {
        const coerced = coerceImprovedSectionHtml({
            originalSection: sections[1],
            candidateHtml: '<div>Not a section</div>',
        });

        expect(coerced).toBe(sections[1].rawHtml);
    });
});
