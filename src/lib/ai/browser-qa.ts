import type { ProductType } from '@/types/build-packet';

export interface BrowserQaViewportMetrics {
    titlePresent: boolean;
    viewportMetaPresent: boolean;
    visibleSectionCount: number;
    interactiveCount: number;
    primaryCtaCount: number;
    headingCount: number;
    textWordCount: number;
    checklistInputCount: number;
    cardSignalCount: number;
    horizontalOverflowPx: number;
    consoleErrorCount: number;
    pageErrorCount: number;
    failedRequestCount: number;
}

export interface BrowserQaViewportResult {
    label: 'desktop' | 'mobile';
    width: number;
    height: number;
    score: number;
    passed: boolean;
    issues: string[];
    metrics: BrowserQaViewportMetrics;
}

export interface BrowserQaReport {
    attempted: boolean;
    skipped: boolean;
    passed: boolean;
    score: number | null;
    issues: string[];
    viewports: BrowserQaViewportResult[];
    error?: string;
}

export function buildBrowserQaFeedbackForPrompt(report: BrowserQaReport): string {
    const lines: string[] = [];

    if (report.score !== null) {
        lines.push(`Browser QA score: ${report.score}/100.`);
    }

    if (report.issues.length > 0) {
        lines.push('Global issues:');
        for (const issue of report.issues.slice(0, 12)) {
            lines.push(`- ${issue}`);
        }
    }

    for (const viewport of report.viewports) {
        lines.push(`${viewport.label.toUpperCase()} (${viewport.width}x${viewport.height})`);
        if (viewport.issues.length === 0) {
            lines.push('- No viewport-specific issues detected.');
        } else {
            for (const issue of viewport.issues.slice(0, 10)) {
                lines.push(`- ${issue}`);
            }
        }
        lines.push(
            `- Metrics: sections=${viewport.metrics.visibleSectionCount}, ctas=${viewport.metrics.primaryCtaCount}, headings=${viewport.metrics.headingCount}, overflow=${viewport.metrics.horizontalOverflowPx}px, pageErrors=${viewport.metrics.pageErrorCount}, consoleErrors=${viewport.metrics.consoleErrorCount}, failedRequests=${viewport.metrics.failedRequestCount}.`
        );
    }

    lines.push('Fix the rendered behavior, not just the static markup.');
    lines.push('Preserve creator voice, source comments, Tailwind, Alpine, and product depth while resolving these viewport issues.');

    return lines.join('\n');
}

interface BrowserQaInput {
    html: string;
    productType: ProductType;
}

interface EvaluatedViewportMetrics extends BrowserQaViewportMetrics {
    issues: string[];
}

const CTA_PATTERN = /\b(buy|get|start|join|download|enroll|continue|unlock|claim|access|begin|shop|reserve)\b/i;
const VIEWPORTS = [
    { label: 'desktop' as const, width: 1440, height: 960 },
    { label: 'mobile' as const, width: 390, height: 844 },
];

function shouldIgnoreFailedRequest(url: string): boolean {
    return url.startsWith('data:')
        || url.includes('fonts.googleapis.com')
        || url.includes('fonts.gstatic.com');
}

function evaluateViewportMetrics(
    metrics: BrowserQaViewportMetrics,
    productType: ProductType
): EvaluatedViewportMetrics {
    const issues: string[] = [];

    if (!metrics.titlePresent) {
        issues.push('Document title is missing.');
    }
    if (!metrics.viewportMetaPresent) {
        issues.push('Viewport meta tag is missing.');
    }
    if (metrics.pageErrorCount > 0) {
        issues.push(`Runtime page errors detected (${metrics.pageErrorCount}).`);
    }
    if (metrics.consoleErrorCount > 0) {
        issues.push(`Console errors detected (${metrics.consoleErrorCount}).`);
    }
    if (metrics.failedRequestCount > 0) {
        issues.push(`Failed asset requests detected (${metrics.failedRequestCount}).`);
    }
    if (metrics.horizontalOverflowPx > 4) {
        issues.push(`Horizontal overflow detected (${metrics.horizontalOverflowPx}px).`);
    }
    if (metrics.visibleSectionCount < 3) {
        issues.push(`Too few visible sections (${metrics.visibleSectionCount}).`);
    }
    if (metrics.interactiveCount < 1) {
        issues.push('No interactive controls detected.');
    }
    if (metrics.primaryCtaCount < 1) {
        issues.push('No visible primary CTA detected.');
    }
    if (metrics.headingCount < 3) {
        issues.push(`Heading structure is shallow (${metrics.headingCount} headings).`);
    }
    if (metrics.textWordCount < 600) {
        issues.push(`Rendered content looks too thin (${metrics.textWordCount} words).`);
    }
    if (metrics.cardSignalCount < 3) {
        issues.push('Rendered page lacks enough card/surface hierarchy signals.');
    }
    if (productType === 'checklist_toolkit' && metrics.checklistInputCount < 2) {
        issues.push('Checklist toolkit lacks working checkbox controls.');
    }
    return {
        ...metrics,
        issues,
    };
}

export function scoreBrowserQaViewport(input: {
    label: 'desktop' | 'mobile';
    width: number;
    height: number;
    metrics: BrowserQaViewportMetrics;
    productType: ProductType;
}): BrowserQaViewportResult {
    const evaluated = evaluateViewportMetrics(input.metrics, input.productType);
    const score = Math.max(
        0,
        Math.min(
            100,
            100
            - (evaluated.issues.includes('Document title is missing.') ? 8 : 0)
            - (evaluated.issues.includes('Viewport meta tag is missing.') ? 10 : 0)
            - (evaluated.pageErrorCount > 0 ? 35 : 0)
            - (evaluated.consoleErrorCount > 0 ? Math.min(18, 8 + (evaluated.consoleErrorCount * 2)) : 0)
            - (evaluated.failedRequestCount > 0 ? Math.min(12, 4 + (evaluated.failedRequestCount * 2)) : 0)
            - (evaluated.horizontalOverflowPx > 4 ? 16 : 0)
            - (evaluated.visibleSectionCount < 3 ? 12 : 0)
            - (evaluated.interactiveCount < 1 ? 12 : 0)
            - (evaluated.primaryCtaCount < 1 ? 14 : 0)
            - (evaluated.headingCount < 3 ? 8 : 0)
            - (evaluated.textWordCount < 600 ? 10 : 0)
            - (evaluated.cardSignalCount < 3 ? 8 : 0)
            - (input.productType === 'checklist_toolkit' && evaluated.checklistInputCount < 2 ? 14 : 0)
        )
    );

    return {
        label: input.label,
        width: input.width,
        height: input.height,
        score,
        passed:
            score >= 78
            && evaluated.pageErrorCount === 0
            && evaluated.horizontalOverflowPx <= 4
            && !(input.productType === 'checklist_toolkit' && evaluated.checklistInputCount < 2),
        issues: evaluated.issues,
        metrics: {
            titlePresent: evaluated.titlePresent,
            viewportMetaPresent: evaluated.viewportMetaPresent,
            visibleSectionCount: evaluated.visibleSectionCount,
            interactiveCount: evaluated.interactiveCount,
            primaryCtaCount: evaluated.primaryCtaCount,
            headingCount: evaluated.headingCount,
            textWordCount: evaluated.textWordCount,
            checklistInputCount: evaluated.checklistInputCount,
            cardSignalCount: evaluated.cardSignalCount,
            horizontalOverflowPx: evaluated.horizontalOverflowPx,
            consoleErrorCount: evaluated.consoleErrorCount,
            pageErrorCount: evaluated.pageErrorCount,
            failedRequestCount: evaluated.failedRequestCount,
        },
    };
}

export async function runProductBrowserQa(input: BrowserQaInput): Promise<BrowserQaReport> {
    let playwright: typeof import('@playwright/test');

    try {
        playwright = await import('@playwright/test');
    } catch (error) {
        return {
            attempted: false,
            skipped: true,
            passed: true,
            score: null,
            issues: ['Playwright is not available in this runtime.'],
            viewports: [],
            error: error instanceof Error ? error.message : 'Failed to load Playwright',
        };
    }

    let browser;
    try {
        browser = await playwright.chromium.launch({ headless: true });
    } catch (error) {
        // Browser binary not installed (common in serverless environments)
        return {
            attempted: false,
            skipped: true,
            passed: true,
            score: null,
            issues: ['Playwright browser binary is not available — skipping browser QA.'],
            viewports: [],
            error: error instanceof Error ? error.message : 'Failed to launch browser',
        };
    }

    try {
        const viewports: BrowserQaViewportResult[] = [];

        for (const viewport of VIEWPORTS) {
            const page = await browser.newPage({
                viewport: { width: viewport.width, height: viewport.height },
            });

            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            const failedRequests: string[] = [];

            page.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text());
                }
            });
            page.on('pageerror', (error) => {
                pageErrors.push(error.message);
            });
            page.on('requestfailed', (request) => {
                const url = request.url();
                if (!shouldIgnoreFailedRequest(url)) {
                    failedRequests.push(url);
                }
            });

            await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(input.html)}`, {
                waitUntil: 'load',
            });
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(300);
            await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => undefined);

            const rawMetrics = await page.evaluate((patternSource) => {
                const interactiveSelector = 'a,button,[role="button"],input[type="button"],input[type="submit"]';
                const ctaPattern = new RegExp(patternSource, 'i');
                const interactive = Array.from(document.querySelectorAll<HTMLElement>(interactiveSelector));
                const visibleSections = Array.from(document.querySelectorAll<HTMLElement>('section'))
                    .filter((element) => {
                        const rect = element.getBoundingClientRect();
                        return rect.width > 0 && rect.height >= 80;
                    });
                const ctas = interactive.filter((element) => {
                    const text = (
                        element.innerText
                        || element.getAttribute('aria-label')
                        || (element instanceof HTMLInputElement ? element.value : '')
                        || ''
                    ).trim();
                    return text.length > 0 && ctaPattern.test(text);
                });
                const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
                const cardSignalCount = Array.from(document.querySelectorAll<HTMLElement>('[class]'))
                    .filter((element) => {
                        const className = element.className || '';
                        return typeof className === 'string'
                            && (/rounded-/.test(className) || /\bborder\b/.test(className) || /shadow/.test(className));
                    })
                    .length;

                return {
                    titlePresent: document.title.trim().length > 0,
                    viewportMetaPresent: !!document.querySelector('meta[name="viewport"]'),
                    visibleSectionCount: visibleSections.length,
                    interactiveCount: interactive.length,
                    primaryCtaCount: ctas.length,
                    headingCount: document.querySelectorAll('h1,h2,h3').length,
                    textWordCount: bodyText.length > 0 ? bodyText.split(' ').filter(Boolean).length : 0,
                    checklistInputCount: document.querySelectorAll('input[type="checkbox"]').length,
                    cardSignalCount,
                    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
                };
            }, CTA_PATTERN.source);

            const result = scoreBrowserQaViewport({
                label: viewport.label,
                width: viewport.width,
                height: viewport.height,
                productType: input.productType,
                metrics: {
                    ...rawMetrics,
                    consoleErrorCount: consoleErrors.length,
                    pageErrorCount: pageErrors.length,
                    failedRequestCount: failedRequests.length,
                },
            });

            await page.close();
            viewports.push(result);
        }

        const issues = Array.from(new Set(viewports.flatMap((viewport) => viewport.issues)));
        const score = viewports.length > 0
            ? Math.round(viewports.reduce((sum, viewport) => sum + viewport.score, 0) / viewports.length)
            : null;

        return {
            attempted: true,
            skipped: false,
            passed: viewports.every((viewport) => viewport.passed) && (score ?? 0) >= 80,
            score,
            issues,
            viewports,
        };
    } catch (error) {
        return {
            attempted: true,
            skipped: false,
            passed: false,
            score: null,
            issues: ['Browser QA execution failed.'],
            viewports: [],
            error: error instanceof Error ? error.message : 'Unknown browser QA error',
        };
    } finally {
        await browser.close();
    }
}
