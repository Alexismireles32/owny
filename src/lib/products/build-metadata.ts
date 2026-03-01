type BuildPacket = Record<string, unknown> | null;

export interface ParsedBuildMetadata {
    htmlBuildMode: string | null;
    qualityOverallScore: number | null;
    qualityOverallPassed: boolean | null;
    creativeDirectionName: string | null;
    stageTimingsMs: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBuildMetadata(buildPacket: BuildPacket): ParsedBuildMetadata | null {
    if (!isRecord(buildPacket)) return null;

    const htmlBuildMode = typeof buildPacket.htmlBuildMode === 'string'
        ? buildPacket.htmlBuildMode
        : null;
    const qualityOverallScore = typeof buildPacket.qualityOverallScore === 'number'
        ? Math.round(buildPacket.qualityOverallScore)
        : null;
    const qualityOverallPassed = typeof buildPacket.qualityOverallPassed === 'boolean'
        ? buildPacket.qualityOverallPassed
        : null;
    const creativeDirectionName = typeof buildPacket.creativeDirectionName === 'string'
        ? buildPacket.creativeDirectionName
        : null;

    const stageTimingsMs: Record<string, number> = {};
    if (isRecord(buildPacket.stageTimingsMs)) {
        for (const [key, value] of Object.entries(buildPacket.stageTimingsMs)) {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                stageTimingsMs[key] = Math.round(value);
            }
        }
    }

    if (!htmlBuildMode && qualityOverallScore === null && qualityOverallPassed === null && !creativeDirectionName && Object.keys(stageTimingsMs).length === 0) {
        return null;
    }

    return {
        htmlBuildMode,
        qualityOverallScore,
        qualityOverallPassed,
        creativeDirectionName,
        stageTimingsMs,
    };
}

export function formatBuildModeLabel(mode: string | null): string | null {
    if (!mode) return null;

    const labels: Record<string, string> = {
        'kimi-sectioned': 'Kimi staged',
        'kimi-improve-sectioned': 'Kimi refine',
        'kimi-improve-monolith': 'Kimi full rewrite',
    };

    return labels[mode] || mode.replace(/[-_]/g, ' ');
}

export function formatStageTimingSummary(stageTimingsMs: Record<string, number>): string | null {
    if (typeof stageTimingsMs.total === 'number') {
        return formatDuration(stageTimingsMs.total);
    }

    const values = Object.values(stageTimingsMs);
    if (values.length === 0) return null;
    return formatDuration(values.reduce((sum, value) => sum + value, 0));
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 100) / 10;
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round((seconds % 60) * 10) / 10;
    return `${minutes}m ${remainingSeconds}s`;
}
