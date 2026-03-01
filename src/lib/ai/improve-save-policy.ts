import type { ProductQualityEvaluation, QualityGateKey } from '@/lib/ai/quality-gates';

export interface ImproveQualitySnapshot {
    score: number | null;
    passed: boolean | null;
    failingGateCount: number;
}

export interface EvaluatedImproveQualitySnapshot {
    score: number;
    passed: boolean;
    failingGateCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const IMPROVE_SCORE_REGRESSION_TOLERANCE = 4;

export function parseImproveQualitySnapshot(buildPacket: Record<string, unknown> | null): ImproveQualitySnapshot {
    if (!buildPacket) {
        return { score: null, passed: null, failingGateCount: Number.POSITIVE_INFINITY };
    }

    const hasRecordedQuality = (
        typeof buildPacket.qualityOverallScore === 'number'
        || typeof buildPacket.qualityOverallPassed === 'boolean'
        || Array.isArray(buildPacket.qualityFailingGates)
    );

    if (!hasRecordedQuality) {
        return { score: null, passed: null, failingGateCount: Number.POSITIVE_INFINITY };
    }

    return {
        score: typeof buildPacket.qualityOverallScore === 'number'
            ? buildPacket.qualityOverallScore
            : null,
        passed: typeof buildPacket.qualityOverallPassed === 'boolean'
            ? buildPacket.qualityOverallPassed
            : null,
        failingGateCount: Array.isArray(buildPacket.qualityFailingGates)
            ? buildPacket.qualityFailingGates.filter((item) => typeof item === 'string').length
            : 0,
    };
}

export function chooseStricterImproveBaseline(
    ...snapshots: ImproveQualitySnapshot[]
): ImproveQualitySnapshot {
    return snapshots.reduce<ImproveQualitySnapshot>((best, current) => {
        if (current.passed === true && best.passed !== true) return current;
        if (best.passed === true && current.passed !== true) return best;

        if (current.failingGateCount < best.failingGateCount) return current;
        if (current.failingGateCount > best.failingGateCount) return best;

        if ((current.score ?? -Infinity) > (best.score ?? -Infinity)) return current;
        return best;
    }, { score: null, passed: null, failingGateCount: Number.POSITIVE_INFINITY });
}

export function toImproveQualitySnapshot(
    evaluation: ProductQualityEvaluation
): EvaluatedImproveQualitySnapshot {
    return {
        score: evaluation.overallScore,
        passed: evaluation.overallPassed,
        failingGateCount: evaluation.failingGates.length,
    };
}

export function parseQualityWeights(
    buildPacket: Record<string, unknown> | null
): Partial<Record<QualityGateKey, number>> | undefined {
    if (!buildPacket || !isRecord(buildPacket.qualityWeights)) {
        return undefined;
    }

    const weights = buildPacket.qualityWeights;

    const allowedKeys: QualityGateKey[] = [
        'brandFidelity',
        'distinctiveness',
        'accessibility',
        'contentDepth',
        'evidenceLock',
    ];

    const parsed = allowedKeys.reduce<Partial<Record<QualityGateKey, number>>>((acc, key) => {
        const value = weights[key];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            acc[key] = value;
        }
        return acc;
    }, {});

    return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function getImproveSaveRejection(input: {
    productStatus: string;
    previous: ImproveQualitySnapshot;
    next: EvaluatedImproveQualitySnapshot;
}): string | null {
    if (input.productStatus === 'published' && !input.next.passed) {
        return 'Published products can only save edits that pass all hard quality gates.';
    }

    if (input.previous.passed === true && !input.next.passed) {
        return 'This edit would regress a passing version below the hard quality gate threshold.';
    }

    if (
        input.previous.score !== null
        && input.next.score < input.previous.score - IMPROVE_SCORE_REGRESSION_TOLERANCE
    ) {
        return `This edit would lower quality too much (${Math.round(input.previous.score)} -> ${Math.round(input.next.score)}).`;
    }

    if (
        Number.isFinite(input.previous.failingGateCount)
        && input.next.failingGateCount > input.previous.failingGateCount
    ) {
        return 'This edit would open more failing quality gates than the current version.';
    }

    return null;
}
