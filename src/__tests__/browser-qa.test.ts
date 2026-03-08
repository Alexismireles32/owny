import { describe, expect, it } from 'vitest';
import { buildBrowserQaFeedbackForPrompt, scoreBrowserQaViewport } from '@/lib/ai/browser-qa';

describe('browser QA scoring', () => {
    it('passes a healthy viewport result', () => {
        const result = scoreBrowserQaViewport({
            label: 'desktop',
            width: 1440,
            height: 960,
            productType: 'pdf_guide',
            metrics: {
                titlePresent: true,
                viewportMetaPresent: true,
                visibleSectionCount: 6,
                interactiveCount: 4,
                primaryCtaCount: 2,
                headingCount: 6,
                textWordCount: 1800,
                checklistInputCount: 0,
                cardSignalCount: 10,
                horizontalOverflowPx: 0,
                consoleErrorCount: 0,
                pageErrorCount: 0,
                failedRequestCount: 0,
            },
        });

        expect(result.passed).toBe(true);
        expect(result.score).toBe(100);
        expect(result.issues).toHaveLength(0);
    });

    it('fails on overflow, missing CTA, and runtime errors', () => {
        const result = scoreBrowserQaViewport({
            label: 'mobile',
            width: 390,
            height: 844,
            productType: 'mini_course',
            metrics: {
                titlePresent: false,
                viewportMetaPresent: false,
                visibleSectionCount: 2,
                interactiveCount: 0,
                primaryCtaCount: 0,
                headingCount: 1,
                textWordCount: 220,
                checklistInputCount: 0,
                cardSignalCount: 1,
                horizontalOverflowPx: 40,
                consoleErrorCount: 2,
                pageErrorCount: 1,
                failedRequestCount: 2,
            },
        });

        expect(result.passed).toBe(false);
        expect(result.score).toBeLessThan(40);
        expect(result.issues.some((issue) => issue.includes('Horizontal overflow'))).toBe(true);
        expect(result.issues.some((issue) => issue.includes('No visible primary CTA'))).toBe(true);
        expect(result.issues.some((issue) => issue.includes('Runtime page errors'))).toBe(true);
    });

    it('enforces checklist controls for toolkit products', () => {
        const result = scoreBrowserQaViewport({
            label: 'desktop',
            width: 1440,
            height: 960,
            productType: 'checklist_toolkit',
            metrics: {
                titlePresent: true,
                viewportMetaPresent: true,
                visibleSectionCount: 5,
                interactiveCount: 2,
                primaryCtaCount: 1,
                headingCount: 4,
                textWordCount: 1000,
                checklistInputCount: 0,
                cardSignalCount: 8,
                horizontalOverflowPx: 0,
                consoleErrorCount: 0,
                pageErrorCount: 0,
                failedRequestCount: 0,
            },
        });

        expect(result.passed).toBe(false);
        expect(result.issues.some((issue) => issue.includes('checkbox controls'))).toBe(true);
    });

    it('formats browser QA feedback for the repair prompt', () => {
        const feedback = buildBrowserQaFeedbackForPrompt({
            attempted: true,
            skipped: false,
            passed: false,
            score: 72,
            issues: ['Global issue one.', 'Global issue two.'],
            viewports: [
                {
                    label: 'desktop',
                    width: 1440,
                    height: 960,
                    score: 70,
                    passed: false,
                    issues: ['Desktop overflow issue.'],
                    metrics: {
                        titlePresent: true,
                        viewportMetaPresent: true,
                        visibleSectionCount: 4,
                        interactiveCount: 2,
                        primaryCtaCount: 1,
                        headingCount: 4,
                        textWordCount: 900,
                        checklistInputCount: 0,
                        cardSignalCount: 5,
                        horizontalOverflowPx: 24,
                        consoleErrorCount: 0,
                        pageErrorCount: 0,
                        failedRequestCount: 0,
                    },
                },
                {
                    label: 'mobile',
                    width: 390,
                    height: 844,
                    score: 74,
                    passed: false,
                    issues: ['Mobile CTA issue.'],
                    metrics: {
                        titlePresent: true,
                        viewportMetaPresent: true,
                        visibleSectionCount: 4,
                        interactiveCount: 1,
                        primaryCtaCount: 0,
                        headingCount: 4,
                        textWordCount: 860,
                        checklistInputCount: 0,
                        cardSignalCount: 5,
                        horizontalOverflowPx: 0,
                        consoleErrorCount: 1,
                        pageErrorCount: 0,
                        failedRequestCount: 0,
                    },
                },
            ],
        });

        expect(feedback).toContain('Browser QA score: 72/100.');
        expect(feedback).toContain('Global issue one.');
        expect(feedback).toContain('DESKTOP (1440x960)');
        expect(feedback).toContain('overflow=24px');
        expect(feedback).toContain('Fix the rendered behavior');
    });
});
