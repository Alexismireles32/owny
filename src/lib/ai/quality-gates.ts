import type { ProductType } from '@/types/build-packet';

export type QualityGateKey =
    | 'brandFidelity'
    | 'distinctiveness'
    | 'accessibility'
    | 'contentDepth'
    | 'evidenceLock';

export interface GateEvaluation {
    key: QualityGateKey;
    label: string;
    score: number;
    threshold: number;
    passed: boolean;
    notes: string[];
}

export interface ProductQualityEvaluation {
    overallScore: number;
    overallPassed: boolean;
    gates: Record<QualityGateKey, GateEvaluation>;
    failingGates: QualityGateKey[];
    maxCatalogSimilarity: number;
    wordCount: number;
    sourceCommentCount: number;
}

interface EvaluateInput {
    html: string;
    productType: ProductType;
    sourceVideoIds: string[];
    catalogHtml: string[];
    brandTokens: Record<string, unknown> | null;
    creatorHandle: string;
    qualityWeights?: Partial<Record<QualityGateKey, number>>;
}

function extractText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function countWords(html: string): number {
    const text = extractText(html);
    if (!text) return 0;
    return text.split(' ').filter(Boolean).length;
}

function normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function minimumWordTarget(productType: ProductType): number {
    switch (productType) {
        case 'pdf_guide':
            return 1400;
        case 'mini_course':
            return 1200;
        case 'challenge_7day':
            return 1000;
        case 'checklist_toolkit':
            return 900;
        default:
            return 1000;
    }
}

function countProductStructureMarkers(html: string, productType: ProductType): number {
    switch (productType) {
        case 'pdf_guide':
            return (html.match(/id="chapter-\d+"/gi) || []).length;
        case 'mini_course':
            return (html.match(/id="module-\d+"/gi) || []).length;
        case 'challenge_7day':
            return (html.match(/id="day-\d+"/gi) || []).length;
        case 'checklist_toolkit':
            return (html.match(/id="category-\d+"/gi) || []).length;
        default:
            return 0;
    }
}

function readBrandToken(source: Record<string, unknown> | null, key: string): string | null {
    if (!source) return null;
    const raw = source[key];
    if (typeof raw !== 'string') return null;
    const cleaned = raw.trim().toLowerCase();
    return cleaned || null;
}

function evaluateBrandFidelity(input: EvaluateInput): GateEvaluation {
    const notes: string[] = [];
    let score = 100;
    const lowerHtml = input.html.toLowerCase();

    const primary = readBrandToken(input.brandTokens, 'primaryColor');
    const secondary = readBrandToken(input.brandTokens, 'secondaryColor');
    const font = readBrandToken(input.brandTokens, 'fontFamily');

    if (primary && !lowerHtml.includes(primary)) {
        score -= 22;
        notes.push('Primary brand color token not found in generated markup.');
    }
    if (secondary && !lowerHtml.includes(secondary)) {
        score -= 10;
        notes.push('Secondary brand color token not found in generated markup.');
    }
    if (font) {
        const fontMatch = lowerHtml.includes(font) || (font === 'inter' && lowerHtml.includes('inter'));
        if (!fontMatch) {
            score -= 10;
            notes.push('Creator font family token not found in generated markup.');
        }
    }
    if (!lowerHtml.includes(normalize(input.creatorHandle))) {
        score -= 8;
        notes.push('Creator handle is not clearly represented in product content.');
    }
    if (/lorem ipsum|placeholder|coming soon|\[insert/i.test(input.html)) {
        score -= 30;
        notes.push('Placeholder text detected.');
    }

    score = Math.max(0, Math.min(100, score));
    return {
        key: 'brandFidelity',
        label: 'Brand Fidelity',
        score,
        threshold: 80,
        passed: score >= 80,
        notes,
    };
}

function evaluateContentDepth(html: string, productType: ProductType): GateEvaluation {
    const notes: string[] = [];
    const words = countWords(html);
    const target = minimumWordTarget(productType);
    const structureMarkers = countProductStructureMarkers(html, productType);

    let score = Math.round((words / target) * 100);
    score = Math.min(100, score);

    if (structureMarkers >= 4) {
        score = Math.min(100, score + 8);
    } else if (structureMarkers <= 1) {
        score -= 12;
        notes.push('Expected product structure markers are sparse for this product type.');
    }

    if (words < target) {
        notes.push(`Content is under target depth (${words}/${target} words).`);
    }
    if (/lorem ipsum|placeholder|coming soon|\[insert/i.test(html)) {
        score -= 25;
        notes.push('Placeholder text detected.');
    }

    score = Math.max(0, Math.min(100, score));
    return {
        key: 'contentDepth',
        label: 'Content Depth',
        score,
        threshold: 75,
        passed: score >= 75,
        notes,
    };
}

function evaluateAccessibility(html: string): GateEvaluation {
    const notes: string[] = [];
    let score = 100;

    if (!/<html[^>]*lang=/i.test(html)) {
        score -= 15;
        notes.push('`<html lang>` is missing.');
    }
    if (!/<meta[^>]*name=["']viewport["']/i.test(html)) {
        score -= 15;
        notes.push('Viewport meta tag is missing.');
    }

    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    let missingAlt = 0;
    for (const tag of imgTags) {
        if (!/\salt=["'][^"']*["']/i.test(tag)) missingAlt += 1;
    }
    if (missingAlt > 0) {
        score -= Math.min(25, 8 + (missingAlt * 4));
        notes.push(`${missingAlt} image tag(s) missing alt text.`);
    }

    const headingCount = (html.match(/<h[1-3]\b/gi) || []).length;
    if (headingCount < 4) {
        score -= 10;
        notes.push('Heading structure is shallow for a paid product.');
    }

    if (/<marquee\b|blink\b/i.test(html)) {
        score -= 15;
        notes.push('Non-accessible legacy visual tags detected.');
    }

    score = Math.max(0, Math.min(100, score));
    return {
        key: 'accessibility',
        label: 'Accessibility Heuristics',
        score,
        threshold: 70,
        passed: score >= 70,
        notes,
    };
}

function extractSourceAttributions(html: string): string[] {
    const matches = html.matchAll(/<!--\s*sources:\s*([^>]+?)-->/gi);
    const ids: string[] = [];
    for (const match of matches) {
        const payload = match[1] || '';
        const parts = payload.split(',').map((item) => item.trim()).filter(Boolean);
        ids.push(...parts);
    }
    return ids;
}

function evaluateEvidenceLock(html: string, sourceVideoIds: string[]): GateEvaluation {
    const notes: string[] = [];
    const attributionIds = extractSourceAttributions(html);
    const normalizedIds = new Set(attributionIds.map((id) => id.toLowerCase()));
    const uniqueComments = new Set(attributionIds);
    const referencedSourceCount = sourceVideoIds.filter((id) => normalizedIds.has(id.toLowerCase())).length;

    let score = 0;
    if (sourceVideoIds.length > 0) {
        const coverageRatio = referencedSourceCount / sourceVideoIds.length;
        const commentScore = Math.min(1, uniqueComments.size / Math.max(2, sourceVideoIds.length * 0.25));
        score = Math.round((coverageRatio * 70) + (commentScore * 30));

        if (coverageRatio < 0.5) {
            notes.push('Less than half of source videos are explicitly attributed in HTML comments.');
        }
        if (uniqueComments.size < 2) {
            notes.push('Very few source attribution markers were found.');
        }
    } else {
        score = attributionIds.length > 0 ? 70 : 45;
        notes.push('No source video IDs were provided for strict evidence coverage scoring.');
    }

    score = Math.max(0, Math.min(100, score));
    return {
        key: 'evidenceLock',
        label: 'Evidence Lock',
        score,
        threshold: 65,
        passed: score >= 65,
        notes,
    };
}

function normalizeForSimilarity(html: string): string[] {
    const text = extractText(html)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return [];
    return text.split(' ').filter((token) => token.length >= 3);
}

function buildShingles(tokens: string[], size = 4): Set<string> {
    const set = new Set<string>();
    if (tokens.length < size) return set;

    for (let i = 0; i <= tokens.length - size; i += 1) {
        set.add(tokens.slice(i, i + size).join(' '));
    }
    return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const value of a) {
        if (b.has(value)) intersection += 1;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function evaluateDistinctiveness(html: string, catalogHtml: string[]): {
    gate: GateEvaluation;
    maxSimilarity: number;
} {
    if (catalogHtml.length === 0) {
        return {
            gate: {
                key: 'distinctiveness',
                label: 'Distinctiveness',
                score: 100,
                threshold: 28,
                passed: true,
                notes: ['No prior catalog entries available; uniqueness gate auto-passed.'],
            },
            maxSimilarity: 0,
        };
    }

    const baseTokens = normalizeForSimilarity(html);
    const baseShingles = buildShingles(baseTokens);

    let maxSimilarity = 0;
    for (const priorHtml of catalogHtml) {
        const score = jaccard(baseShingles, buildShingles(normalizeForSimilarity(priorHtml)));
        if (score > maxSimilarity) maxSimilarity = score;
    }

    const score = Math.round((1 - maxSimilarity) * 100);
    const passed = maxSimilarity <= 0.72;
    const notes = passed
        ? []
        : [`Similarity to existing catalog is high (${Math.round(maxSimilarity * 100)}%).`];

    return {
        gate: {
            key: 'distinctiveness',
            label: 'Distinctiveness',
            score,
            threshold: 28,
            passed,
            notes,
        },
        maxSimilarity,
    };
}

function normalizeWeights(
    weights?: Partial<Record<QualityGateKey, number>>
): Record<QualityGateKey, number> {
    const defaults: Record<QualityGateKey, number> = {
        brandFidelity: 0.24,
        distinctiveness: 0.2,
        accessibility: 0.18,
        contentDepth: 0.24,
        evidenceLock: 0.14,
    };

    if (!weights) return defaults;

    const merged: Record<QualityGateKey, number> = {
        brandFidelity: weights.brandFidelity ?? defaults.brandFidelity,
        distinctiveness: weights.distinctiveness ?? defaults.distinctiveness,
        accessibility: weights.accessibility ?? defaults.accessibility,
        contentDepth: weights.contentDepth ?? defaults.contentDepth,
        evidenceLock: weights.evidenceLock ?? defaults.evidenceLock,
    };

    const total = Object.values(merged).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return defaults;

    return {
        brandFidelity: merged.brandFidelity / total,
        distinctiveness: merged.distinctiveness / total,
        accessibility: merged.accessibility / total,
        contentDepth: merged.contentDepth / total,
        evidenceLock: merged.evidenceLock / total,
    };
}

export function evaluateProductQuality(input: EvaluateInput): ProductQualityEvaluation {
    const brandFidelity = evaluateBrandFidelity(input);
    const contentDepth = evaluateContentDepth(input.html, input.productType);
    const accessibility = evaluateAccessibility(input.html);
    const evidenceLock = evaluateEvidenceLock(input.html, input.sourceVideoIds);
    const distinctivenessResult = evaluateDistinctiveness(input.html, input.catalogHtml);
    const distinctiveness = distinctivenessResult.gate;
    const maxCatalogSimilarity = distinctivenessResult.maxSimilarity;

    const gates: Record<QualityGateKey, GateEvaluation> = {
        brandFidelity,
        distinctiveness,
        accessibility,
        contentDepth,
        evidenceLock,
    };

    const weights = normalizeWeights(input.qualityWeights);
    const overallScore = Math.round(
        (gates.brandFidelity.score * weights.brandFidelity)
        + (gates.distinctiveness.score * weights.distinctiveness)
        + (gates.accessibility.score * weights.accessibility)
        + (gates.contentDepth.score * weights.contentDepth)
        + (gates.evidenceLock.score * weights.evidenceLock)
    );

    const failingGates = (Object.keys(gates) as QualityGateKey[]).filter((key) => !gates[key].passed);
    return {
        overallScore,
        overallPassed: failingGates.length === 0,
        gates,
        failingGates,
        maxCatalogSimilarity,
        wordCount: countWords(input.html),
        sourceCommentCount: extractSourceAttributions(input.html).length,
    };
}

export function buildQualityFeedbackForPrompt(
    evaluation: ProductQualityEvaluation
): string {
    if (evaluation.overallPassed) {
        return 'All quality gates passed. Maintain current quality while applying only requested refinements.';
    }

    return evaluation.failingGates
        .map((key, idx) => {
            const gate = evaluation.gates[key];
            const notes = gate.notes.length > 0 ? gate.notes.join(' | ') : 'No detail provided.';
            return `${idx + 1}. ${gate.label}: score ${gate.score}/${gate.threshold}. Fixes needed: ${notes}`;
        })
        .join('\n');
}
