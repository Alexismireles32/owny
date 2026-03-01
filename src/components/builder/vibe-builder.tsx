'use client';

// Vibe Builder — HTML Code Generation Edition
// Two modes: (1) AI generates full HTML+Tailwind page, (2) User improves via chat
// Preview: Sandboxed iframe with srcdoc for instant rendering
// Features: SSE streaming, auto-save, device preview, quick prompt auto-submit

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import type { ProductDSL, ThemeTokens } from '@/types/product-dsl';

interface VibeBuilderProps {
    productId: string;
    initialDsl: ProductDSL | null;
    initialHtml: string | null;
    initialBuildPacket: Record<string, unknown> | null;
    onSave: (dsl: ProductDSL, html: string | null, buildPacket: Record<string, unknown>) => Promise<void>;
    onPublish: () => Promise<void>;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
};

interface QualityGateSnapshot {
    key: string;
    label: string;
    score: number;
    threshold: number;
    passed: boolean;
}

interface QualityInsights {
    overallScore: number | null;
    overallPassed: boolean | null;
    failingGates: string[];
    designCanonVersion: string | null;
    creativeDirectionId: string | null;
    criticIterations: number | null;
    gateScores: QualityGateSnapshot[];
}

interface BuildRuntimeInsights {
    htmlBuildMode: string | null;
    stageTimingsMs: Record<string, number>;
    improvedSectionIds: string[];
    rejectionReason: string | null;
    saveRejected: boolean;
    failingGates: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function gateLabel(key: string): string {
    const labels: Record<string, string> = {
        brandFidelity: 'Brand',
        distinctiveness: 'Distinctive',
        accessibility: 'A11y',
        contentDepth: 'Depth',
        evidenceLock: 'Evidence',
    };
    return labels[key] || key;
}

function toQualityInsightsFromBuildPacket(buildPacket: Record<string, unknown> | null): QualityInsights | null {
    if (!isRecord(buildPacket)) return null;

    const overallScore = typeof buildPacket.qualityOverallScore === 'number'
        ? buildPacket.qualityOverallScore
        : null;
    const overallPassed = typeof buildPacket.qualityOverallPassed === 'boolean'
        ? buildPacket.qualityOverallPassed
        : null;
    const failingGates = Array.isArray(buildPacket.qualityFailingGates)
        ? buildPacket.qualityFailingGates
            .map((item) => (typeof item === 'string' ? item : null))
            .filter((item): item is string => Boolean(item))
        : [];
    const designCanonVersion = typeof buildPacket.designCanonVersion === 'string'
        ? buildPacket.designCanonVersion
        : null;
    const creativeDirectionId = typeof buildPacket.creativeDirectionId === 'string'
        ? buildPacket.creativeDirectionId
        : null;
    const criticIterations = typeof buildPacket.criticIterations === 'number'
        ? buildPacket.criticIterations
        : null;

    const gateScores: QualityGateSnapshot[] = [];
    if (isRecord(buildPacket.qualityGateScores)) {
        for (const [key, raw] of Object.entries(buildPacket.qualityGateScores)) {
            if (!isRecord(raw)) continue;
            const score = typeof raw.score === 'number' ? raw.score : null;
            const threshold = typeof raw.threshold === 'number' ? raw.threshold : null;
            const passed = typeof raw.passed === 'boolean' ? raw.passed : null;
            if (score === null || threshold === null || passed === null) continue;
            gateScores.push({
                key,
                label: gateLabel(key),
                score,
                threshold,
                passed,
            });
        }
    }

    if (overallScore === null && gateScores.length === 0 && !designCanonVersion && !creativeDirectionId) {
        return null;
    }

    return {
        overallScore,
        overallPassed,
        failingGates,
        designCanonVersion,
        creativeDirectionId,
        criticIterations,
        gateScores,
    };
}

function toBuildRuntimeInsightsFromBuildPacket(buildPacket: Record<string, unknown> | null): BuildRuntimeInsights | null {
    if (!isRecord(buildPacket)) return null;

    const htmlBuildMode = typeof buildPacket.htmlBuildMode === 'string'
        ? buildPacket.htmlBuildMode
        : null;
    const improvedSectionIds = Array.isArray(buildPacket.improvedSectionIds)
        ? buildPacket.improvedSectionIds
            .map((item) => (typeof item === 'string' ? item : null))
            .filter((item): item is string => Boolean(item))
        : [];
    const rejectionReason = typeof buildPacket.rejectionReason === 'string'
        ? buildPacket.rejectionReason
        : null;
    const saveRejected = buildPacket.saveRejected === true;
    const failingGates = Array.isArray(buildPacket.qualityFailingGates)
        ? buildPacket.qualityFailingGates
            .map((item) => (typeof item === 'string' ? item : null))
            .filter((item): item is string => Boolean(item))
        : [];
    const stageTimingsMs: Record<string, number> = {};
    if (isRecord(buildPacket.stageTimingsMs)) {
        for (const [key, value] of Object.entries(buildPacket.stageTimingsMs)) {
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                stageTimingsMs[key] = Math.round(value);
            }
        }
    }

    if (!htmlBuildMode && improvedSectionIds.length === 0 && !rejectionReason && Object.keys(stageTimingsMs).length === 0) {
        return null;
    }

    return { htmlBuildMode, stageTimingsMs, improvedSectionIds, rejectionReason, saveRejected, failingGates };
}

function formatBuildMode(mode: string | null): string | null {
    if (!mode) return null;
    const labels: Record<string, string> = {
        'kimi-sectioned': 'Kimi staged',
        'kimi-improve-sectioned': 'Kimi refine',
        'kimi-improve-monolith': 'Kimi rewrite',
    };
    return labels[mode] || mode.replace(/[-_]/g, ' ');
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 100) / 10;
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round((seconds % 60) * 10) / 10;
    return `${minutes}m ${remainder}s`;
}

function summarizeStageTimings(stageTimingsMs: Record<string, number>): string | null {
    if (typeof stageTimingsMs.total === 'number') return formatDuration(stageTimingsMs.total);
    const values = Object.values(stageTimingsMs);
    if (values.length === 0) return null;
    return formatDuration(values.reduce((sum, value) => sum + value, 0));
}

function mergeBuildPacketWithMetadata(
    packet: Record<string, unknown>,
    metadata: Record<string, unknown> | null
): Record<string, unknown> {
    if (!metadata) return packet;
    const merged: Record<string, unknown> = { ...packet };

    if (typeof metadata.qualityScore === 'number') merged.qualityOverallScore = metadata.qualityScore;
    if (typeof metadata.qualityPassed === 'boolean') merged.qualityOverallPassed = metadata.qualityPassed;
    if (Array.isArray(metadata.failingGates)) merged.qualityFailingGates = metadata.failingGates;
    if (typeof metadata.designCanonVersion === 'string') merged.designCanonVersion = metadata.designCanonVersion;
    if (typeof metadata.creativeDirectionId === 'string') merged.creativeDirectionId = metadata.creativeDirectionId;
    if (typeof metadata.criticIterations === 'number') merged.criticIterations = metadata.criticIterations;
    if (Array.isArray(metadata.criticModels)) merged.criticModels = metadata.criticModels;
    if (typeof metadata.htmlBuildMode === 'string') merged.htmlBuildMode = metadata.htmlBuildMode;
    if (isRecord(metadata.stageTimingsMs)) merged.stageTimingsMs = metadata.stageTimingsMs;
    if (Array.isArray(metadata.touchedSectionIds)) merged.improvedSectionIds = metadata.touchedSectionIds;
    if (typeof metadata.rejectionReason === 'string') merged.rejectionReason = metadata.rejectionReason;
    if (typeof metadata.saveRejected === 'boolean') merged.saveRejected = metadata.saveRejected;

    return merged;
}

function mergeQualityInsightsWithMetadata(
    existing: QualityInsights | null,
    metadata: Record<string, unknown> | null
): QualityInsights | null {
    if (!metadata) return existing;

    const hasAnyQualitySignal = (
        typeof metadata.qualityScore === 'number'
        || typeof metadata.qualityPassed === 'boolean'
        || Array.isArray(metadata.failingGates)
        || typeof metadata.designCanonVersion === 'string'
        || typeof metadata.creativeDirectionId === 'string'
    );

    if (!hasAnyQualitySignal) return existing;

    return {
        overallScore: typeof metadata.qualityScore === 'number'
            ? metadata.qualityScore
            : (existing?.overallScore ?? null),
        overallPassed: typeof metadata.qualityPassed === 'boolean'
            ? metadata.qualityPassed
            : (existing?.overallPassed ?? null),
        failingGates: Array.isArray(metadata.failingGates)
            ? metadata.failingGates
                .map((item) => (typeof item === 'string' ? item : null))
                .filter((item): item is string => Boolean(item))
            : (existing?.failingGates ?? []),
        designCanonVersion: typeof metadata.designCanonVersion === 'string'
            ? metadata.designCanonVersion
            : (existing?.designCanonVersion ?? null),
        creativeDirectionId: typeof metadata.creativeDirectionId === 'string'
            ? metadata.creativeDirectionId
            : (existing?.creativeDirectionId ?? null),
        criticIterations: typeof metadata.criticIterations === 'number'
            ? metadata.criticIterations
            : (existing?.criticIterations ?? null),
        gateScores: existing?.gateScores || [],
    };
}

export function VibeBuilder({ productId, initialDsl, initialHtml, initialBuildPacket, onSave, onPublish }: VibeBuilderProps) {
    // State
    const [dsl, setDsl] = useState<ProductDSL>(() => {
        if (
            initialDsl &&
            typeof initialDsl === 'object' &&
            initialDsl.product &&
            typeof initialDsl.product.title === 'string' &&
            typeof initialDsl.product.type === 'string'
        ) {
            return initialDsl as ProductDSL;
        }
        return defaultDSL();
    });
    const [generatedHtml, setGeneratedHtml] = useState<string | null>(initialHtml);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [improveInput, setImproveInput] = useState('');
    const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([]);
    const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
    const [lastSavedHtml, setLastSavedHtml] = useState<string | null>(initialHtml);
    const [workingBuildPacket, setWorkingBuildPacket] = useState<Record<string, unknown>>(() => {
        if (isRecord(initialBuildPacket)) return { ...initialBuildPacket };
        return {};
    });
    const [qualityInsights, setQualityInsights] = useState<QualityInsights | null>(() => (
        toQualityInsightsFromBuildPacket(isRecord(initialBuildPacket) ? initialBuildPacket : null)
    ));
    const [buildRuntimeInsights, setBuildRuntimeInsights] = useState<BuildRuntimeInsights | null>(() => (
        toBuildRuntimeInsightsFromBuildPacket(isRecord(initialBuildPacket) ? initialBuildPacket : null)
    ));
    const chatEndRef = useRef<HTMLDivElement>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hasHtml = !!generatedHtml;

    // --- Auto-save: debounced save after HTML changes ---
    useEffect(() => {
        if (!generatedHtml || generatedHtml === lastSavedHtml) return;

        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(async () => {
            try {
                await onSave(dsl, generatedHtml, workingBuildPacket);
                setLastSavedHtml(generatedHtml);
            } catch {
                // silent — will retry on next change
            }
        }, 5000); // auto-save 5s after last AI change

        return () => {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        };
    }, [generatedHtml, dsl, lastSavedHtml, onSave, workingBuildPacket]);

    const handleOpenStudio = useCallback(() => {
        window.location.href = '/dashboard';
    }, []);

    // --- AI Improve (send current HTML + instruction) ---
    const handleAiImprove = useCallback(async (directPrompt?: string) => {
        const instruction = (directPrompt || improveInput).trim();
        if (!instruction || !generatedHtml) return;
        if (!directPrompt) setImproveInput('');
        setAiLoading(true);
        setChatHistory((prev) => [...prev, { role: 'user', message: instruction }]);

        try {
            const res = await fetch('/api/ai/improve-html', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    html: generatedHtml,
                    instruction,
                    buildPacket: workingBuildPacket,
                }),
            });

            const data = await res.json();
            const metadata = isRecord(data.metadata) ? data.metadata : null;

            if (data.html) {
                setGeneratedHtml(data.html);
                const updatedPacket = mergeBuildPacketWithMetadata(workingBuildPacket, metadata);
                setWorkingBuildPacket(updatedPacket);
                setQualityInsights((prev) => (
                    mergeQualityInsightsWithMetadata(
                        prev || toQualityInsightsFromBuildPacket(updatedPacket),
                        metadata
                    )
                ));
                setBuildRuntimeInsights(toBuildRuntimeInsightsFromBuildPacket(updatedPacket));
                setChatHistory((prev) => [...prev, { role: 'ai', message: '✅ Applied your changes! Take a look at the preview.' }]);
            } else {
                if (metadata) {
                    const updatedPacket = mergeBuildPacketWithMetadata(workingBuildPacket, metadata);
                    setWorkingBuildPacket(updatedPacket);
                    setQualityInsights((prev) => (
                        mergeQualityInsightsWithMetadata(
                            prev || toQualityInsightsFromBuildPacket(updatedPacket),
                            metadata
                        )
                    ));
                    setBuildRuntimeInsights(toBuildRuntimeInsightsFromBuildPacket(updatedPacket));
                }
                setChatHistory((prev) => [...prev, { role: 'ai', message: `❌ ${data.error || 'Failed to improve. Try a different instruction.'}` }]);
            }
        } catch {
            setChatHistory((prev) => [...prev, { role: 'ai', message: '❌ Network error. Please try again.' }]);
        }
        setAiLoading(false);

        // Scroll chat to bottom
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, [improveInput, generatedHtml, productId, workingBuildPacket]);

    // --- Theme update (for metadata) ---
    const updateTheme = useCallback((key: string, value: string) => {
        setDsl((prev) => ({
            ...prev,
            themeTokens: { ...prev.themeTokens, [key]: value },
        }));
    }, []);

    // --- Save / Publish ---
    const handleSave = useCallback(async () => {
        setActionError(null);
        setSaving(true);
        try {
            await onSave(dsl, generatedHtml, workingBuildPacket);
            setLastSavedHtml(generatedHtml);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not save your draft.');
        } finally {
            setSaving(false);
        }
    }, [dsl, generatedHtml, onSave, workingBuildPacket]);

    const isSaved = generatedHtml === lastSavedHtml;

    const handlePublish = useCallback(async () => {
        setActionError(null);
        setPublishing(true);
        try {
            await onPublish();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not publish this product.');
        } finally {
            setPublishing(false);
        }
    }, [onPublish]);

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-[#071320] via-[#0d1e31] to-[#132a3f] text-slate-100">
            {/* Top bar */}
            <header className="h-12 border-b border-white/15 bg-black/25 backdrop-blur-md flex items-center justify-between px-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <a
                        href={`/products/${productId}`}
                        className="text-xs text-slate-300 hover:text-white transition-colors"
                    >
                        ← Back
                    </a>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="font-bold text-sm">{dsl.product.title || 'Untitled Product'}</span>
                    <Badge variant="secondary" className="text-xs border-white/20 bg-white/10 text-slate-100">{dsl.product.type}</Badge>
                    {!isSaved && (
                        <span className="text-xs text-amber-300 font-medium">● Unsaved</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Device Preview Toggle */}
                    <div className="flex items-center border border-white/20 rounded-lg overflow-hidden bg-white/5">
                        {(['desktop', 'tablet', 'mobile'] as DeviceMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setDeviceMode(mode)}
                                className={`px-2 py-1 text-xs transition-colors ${deviceMode === mode
                                    ? 'bg-cyan-500 text-[#05263a]'
                                    : 'text-slate-300 hover:bg-white/10'
                                    }`}
                                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} preview`}
                            >
                                {mode === 'desktop' ? '🖥' : mode === 'tablet' ? '📱' : '📲'}
                            </button>
                        ))}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-white/25 bg-white/10 text-slate-100 hover:bg-white/15"
                        onClick={handleSave}
                        disabled={saving || isSaved}
                    >
                        {saving ? 'Saving…' : isSaved ? 'Saved ✓' : 'Save Draft'}
                    </Button>
                    <Button
                        size="sm"
                        className="bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105"
                        onClick={handlePublish}
                        disabled={publishing}
                    >
                        {publishing ? 'Publishing…' : 'Publish'}
                    </Button>
                </div>
            </header>
            {actionError && (
                <div className="px-4 py-2 text-xs text-red-200 bg-red-900/30 border-b border-red-500/25">
                    {actionError}
                </div>
            )}

            {/* Two-panel layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Controls & AI Chat */}
                <aside className="w-80 border-r border-white/15 bg-black/25 backdrop-blur-sm flex flex-col flex-shrink-0 overflow-hidden">
                    {/* Product Info (editable) */}
                    <div className="p-4 border-b border-white/15 space-y-3">
                        <label className="block text-xs font-medium text-slate-300">Title</label>
                        <input
                            type="text"
                            value={dsl.product.title || ''}
                            onChange={(e) =>
                                setDsl((prev) => ({
                                    ...prev,
                                    product: { ...prev.product, title: e.target.value },
                                }))
                            }
                            className="w-full text-sm border border-white/20 bg-white/10 text-slate-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        />
                        <label className="block text-xs font-medium text-slate-300">Mood</label>
                        <select
                            value={dsl.themeTokens?.mood || 'professional'}
                            onChange={(e) => updateTheme('mood', e.target.value)}
                            className="w-full text-sm border border-white/20 bg-white/10 text-slate-100 rounded-md px-3 py-2"
                        >
                            <option value="professional">Professional</option>
                            <option value="clean">Clean</option>
                            <option value="fresh">Fresh</option>
                            <option value="bold">Bold</option>
                            <option value="premium">Premium</option>
                            <option value="energetic">Energetic</option>
                        </select>

                        {qualityInsights && (
                            <div className="mt-3 rounded-lg border border-white/20 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold tracking-wide uppercase text-slate-300">Quality Insights</p>
                                    {qualityInsights.overallScore !== null && (
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${qualityInsights.overallPassed
                                            ? 'text-emerald-200 border-emerald-300/40 bg-emerald-400/15'
                                            : 'text-amber-200 border-amber-300/40 bg-amber-400/15'
                                            }`}>
                                            {qualityInsights.overallScore}/100
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 text-xs text-slate-300 space-y-1">
                                    {qualityInsights.designCanonVersion && (
                                        <p><span className="text-slate-400">Canon:</span> {qualityInsights.designCanonVersion}</p>
                                    )}
                                    {qualityInsights.creativeDirectionId && (
                                        <p><span className="text-slate-400">Direction:</span> {qualityInsights.creativeDirectionId.replace(/-/g, ' ')}</p>
                                    )}
                                    {qualityInsights.criticIterations !== null && (
                                        <p><span className="text-slate-400">Critic iterations:</span> {qualityInsights.criticIterations}</p>
                                    )}
                                </div>
                                {qualityInsights.gateScores.length > 0 && (
                                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                                        {qualityInsights.gateScores.map((gate) => (
                                            <div key={gate.key} className="rounded border border-white/15 bg-black/20 px-2 py-1">
                                                <p className="text-[10px] uppercase tracking-wide text-slate-400">{gate.label}</p>
                                                <p className={`text-xs font-semibold ${gate.passed ? 'text-emerald-200' : 'text-amber-200'}`}>
                                                    {gate.score}/{gate.threshold}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {qualityInsights.failingGates.length > 0 && (
                                    <p className="mt-2 text-[11px] text-amber-200">
                                        Open gates: {qualityInsights.failingGates.map((gate) => gateLabel(gate)).join(', ')}
                                    </p>
                                )}
                            </div>
                        )}

                        {buildRuntimeInsights && (
                            <div className="mt-3 rounded-lg border border-white/20 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold tracking-wide uppercase text-slate-300">Build Runtime</p>
                                    {buildRuntimeInsights.htmlBuildMode && (
                                        <span className="rounded-full border border-cyan-300/35 bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-cyan-100">
                                            {formatBuildMode(buildRuntimeInsights.htmlBuildMode)}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 space-y-1 text-xs text-slate-300">
                                    {buildRuntimeInsights.saveRejected && buildRuntimeInsights.rejectionReason && (
                                        <p className="text-amber-200">
                                            <span className="text-amber-300">Preview rejected:</span> {buildRuntimeInsights.rejectionReason}
                                        </p>
                                    )}
                                    {summarizeStageTimings(buildRuntimeInsights.stageTimingsMs) && (
                                        <p>
                                            <span className="text-slate-400">Total time:</span>{' '}
                                            {summarizeStageTimings(buildRuntimeInsights.stageTimingsMs)}
                                        </p>
                                    )}
                                    {buildRuntimeInsights.improvedSectionIds.length > 0 && (
                                        <p>
                                            <span className="text-slate-400">Touched sections:</span>{' '}
                                            {buildRuntimeInsights.improvedSectionIds.join(', ')}
                                        </p>
                                    )}
                                    {buildRuntimeInsights.saveRejected && buildRuntimeInsights.failingGates.length > 0 && (
                                        <p className="text-amber-200">
                                            <span className="text-slate-400">Failing gates:</span>{' '}
                                            {buildRuntimeInsights.failingGates.map((gate) => gateLabel(gate)).join(', ')}
                                        </p>
                                    )}
                                </div>
                                {Object.keys(buildRuntimeInsights.stageTimingsMs).length > 0 && (
                                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                                        {Object.entries(buildRuntimeInsights.stageTimingsMs)
                                            .filter(([key]) => key !== 'total')
                                            .sort((a, b) => a[0].localeCompare(b[0]))
                                            .map(([key, value]) => (
                                                <div key={key} className="rounded border border-white/15 bg-black/20 px-2 py-1">
                                                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{key}</p>
                                                    <p className="text-xs font-semibold text-cyan-100">{formatDuration(value)}</p>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Studio CTA — shown when no HTML exists */}
                    {!hasHtml && (
                        <div className="p-4 border-b border-white/15">
                            <Button
                                className="w-full bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105"
                                onClick={handleOpenStudio}
                            >
                                Open Product Studio
                            </Button>
                            <p className="mt-2 text-center text-xs text-slate-300">
                                New products are generated in Studio. This page is for refining and publishing an existing build.
                            </p>
                        </div>
                    )}

                    {/* AI Chat — shown when HTML exists */}
                    {hasHtml && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/15">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                        AI Design Chat
                                    </h3>
                                </div>
                            </div>

                            {/* Chat messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {chatHistory.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`text-sm rounded-lg px-3 py-2 ${msg.role === 'user'
                                            ? 'bg-cyan-300 text-[#05263a] ml-6'
                                            : 'bg-white/10 text-slate-100 mr-6 border border-white/15'
                                            }`}
                                    >
                                        {msg.message}
                                    </div>
                                ))}
                                {aiLoading && (
                                    <div className="bg-white/10 text-slate-300 text-sm rounded-lg px-3 py-2 mr-6 animate-pulse border border-white/15">
                                        Thinking...
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat input */}
                            <div className="p-3 border-t border-white/15">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={improveInput}
                                        onChange={(e) => setImproveInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAiImprove()}
                                        placeholder="Make the hero bigger, add testimonials..."
                                        className="flex-1 text-sm border border-white/20 bg-white/10 text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                        disabled={aiLoading}
                                    />
                                    <Button
                                        size="sm"
                                        className="bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105"
                                        onClick={() => handleAiImprove()}
                                        disabled={aiLoading || !improveInput.trim()}
                                    >
                                        Send
                                    </Button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {QUICK_PROMPTS.map((prompt) => (
                                        <button
                                            key={prompt}
                                            onClick={() => handleAiImprove(prompt)}
                                            disabled={aiLoading}
                                            className="text-xs px-2 py-1 bg-white/10 hover:bg-white/15 rounded-md text-slate-200 border border-white/15 transition-colors disabled:opacity-40"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Right Panel: Preview (iframe or empty state) */}
                <main className="flex-1 overflow-hidden bg-black/20 flex items-stretch justify-center p-4">
                    {hasHtml ? (
                        <div
                            className="bg-[#0b1523] border border-white/15 rounded-xl shadow-xl overflow-hidden flex flex-col transition-all duration-300"
                            style={{
                                width: DEVICE_WIDTHS[deviceMode],
                                maxWidth: '100%',
                                margin: deviceMode !== 'desktop' ? '0 auto' : undefined,
                            }}
                        >
                            {/* Preview header */}
                            <div className="h-8 bg-black/25 border-b border-white/10 flex items-center px-4 gap-2 flex-shrink-0">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                                <span className="text-xs text-slate-400 ml-2">
                                    Live Preview — {deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}
                                </span>
                            </div>
                            {/* iframe preview */}
                            <iframe
                                srcDoc={generatedHtml!}
                                sandbox="allow-scripts"
                                className="flex-1 w-full border-0"
                                title="Product Preview"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center max-w-md text-slate-100">
                            {aiLoading ? (
                                // Skeleton loading state
                                <div className="w-full max-w-lg space-y-4 animate-pulse">
                                    <div className="h-48 bg-gradient-to-r from-cyan-400/30 to-amber-400/30 rounded-xl" />
                                    <div className="h-6 bg-white/20 rounded w-3/4 mx-auto" />
                                    <div className="h-4 bg-white/20 rounded w-1/2 mx-auto" />
                                    <div className="space-y-2 mt-6">
                                        <div className="h-4 bg-white/15 rounded w-full" />
                                        <div className="h-4 bg-white/15 rounded w-5/6" />
                                        <div className="h-4 bg-white/15 rounded w-4/6" />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="text-6xl mb-4">🎨</div>
                                    <h2 className="text-xl font-bold mb-2">
                                        Generate In Studio
                                    </h2>
                                    <p className="text-slate-300 mb-6">
                                        The main Studio on your dashboard is the only product generation flow. Return here after generation to refine and publish.
                                    </p>
                                    <Button
                                        className="bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105 px-8 py-3"
                                        onClick={handleOpenStudio}
                                    >
                                        Open Product Studio
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

// Quick improvement prompts — auto-submit on click
const QUICK_PROMPTS = [
    'Make it bolder',
    'Add more sections',
    'Make the hero bigger',
    'Add testimonials',
    'Use darker colors',
    'Add a FAQ section',
];

// Default DSL for backward compat
function defaultDSL(): ProductDSL {
    return {
        product: { title: 'Untitled Product', type: 'pdf_guide', version: 1 },
        themeTokens: {
            primaryColor: '#6366f1',
            secondaryColor: '#8b5cf6',
            backgroundColor: '#ffffff',
            textColor: '#1f2937',
            fontFamily: 'inter',
            borderRadius: 'md',
            spacing: 'normal',
            shadow: 'sm',
            mood: 'professional',
        } as ThemeTokens,
        pages: [
            {
                id: 'page_sales',
                type: 'sales',
                title: 'Sales Page',
                accessRule: 'public',
                blocks: [],
            },
        ],
    };
}
