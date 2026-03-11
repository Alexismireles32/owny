'use client';

// Vibe Builder — HTML Code Generation Edition
// Two modes: (1) AI generates full HTML+Tailwind page, (2) User improves via chat
// Preview: Sandboxed iframe with srcdoc for instant rendering
// Features: SSE streaming, auto-save, device preview, quick prompt auto-submit

import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    ChevronDown,
    Loader2,
    Monitor,
    Palette,
    Smartphone,
    Sparkles,
    Tablet,
    User,
} from 'lucide-react';
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

const DEVICE_ICONS: Record<DeviceMode, React.ReactNode> = {
    desktop: <Monitor className="size-3.5" />,
    tablet: <Tablet className="size-3.5" />,
    mobile: <Smartphone className="size-3.5" />,
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

function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Stagger animation variants
// ---------------------------------------------------------------------------
const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
};
const staggerItem = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

export function VibeBuilder({ productId, initialDsl, initialHtml, initialBuildPacket, onSave, onPublish }: VibeBuilderProps) {
    const shouldReduceMotion = useReducedMotion();

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
    const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string; ts: number }>>([]);
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

    // New state for UI enhancements
    const [qualityExpanded, setQualityExpanded] = useState(true);
    const [runtimeExpanded, setRuntimeExpanded] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hasHtml = !!generatedHtml;

    // Reset iframe loaded state when HTML changes
    useEffect(() => {
        setIframeLoaded(false);
    }, [generatedHtml]);

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
        setChatHistory((prev) => [...prev, { role: 'user', message: instruction, ts: Date.now() }]);

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
                setChatHistory((prev) => [...prev, { role: 'ai', message: '✅ Applied your changes! Take a look at the preview.', ts: Date.now() }]);
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
                setChatHistory((prev) => [...prev, { role: 'ai', message: `❌ ${data.error || 'Failed to improve. Try a different instruction.'}`, ts: Date.now() }]);
            }
        } catch {
            setChatHistory((prev) => [...prev, { role: 'ai', message: '❌ Network error. Please try again.', ts: Date.now() }]);
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
            toast.success('Draft saved');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not save your draft.';
            setActionError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }, [dsl, generatedHtml, onSave, workingBuildPacket]);

    const isSaved = generatedHtml === lastSavedHtml;

    // --- ⌘S save shortcut ---
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                if (!saving && !isSaved) handleSave();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saving, isSaved, handleSave]);

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

    // Animation helper — skips motion if user prefers reduced motion
    const _m = shouldReduceMotion
        ? { initial: false as const, animate: undefined, exit: undefined, transition: { duration: 0 } }
        : {};

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-[#071320] via-[#0d1e31] to-[#132a3f] text-slate-100">
            {/* Top bar */}
            <motion.header
                initial={shouldReduceMotion ? false : { y: -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="h-12 border-b border-white/15 bg-black/25 backdrop-blur-md flex items-center justify-between px-4 flex-shrink-0"
            >
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
                    <AnimatePresence>
                        {!isSaved && (
                            <motion.span
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="text-xs text-amber-300 font-medium"
                            >
                                ● Unsaved
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
                <div className="flex items-center gap-2">
                    {/* Device Preview Toggle */}
                    <div className="flex items-center border border-white/20 rounded-lg overflow-hidden bg-white/5">
                        {(['desktop', 'tablet', 'mobile'] as DeviceMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setDeviceMode(mode)}
                                className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-all duration-200 ${deviceMode === mode
                                    ? 'bg-cyan-500 text-[#05263a] shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
                                    }`}
                                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} preview`}
                            >
                                {DEVICE_ICONS[mode]}
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
                        {saving ? (
                            <><Loader2 className="size-3.5 animate-spin mr-1" /> Saving…</>
                        ) : isSaved ? 'Saved ✓' : 'Save Draft'}
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
            </motion.header>

            <AnimatePresence>
                {actionError && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 py-2 text-xs text-red-200 bg-red-900/30 border-b border-red-500/25 overflow-hidden"
                    >
                        {actionError}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Two-panel layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Controls & AI Chat */}
                <motion.aside
                    initial={shouldReduceMotion ? false : { x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
                    className="w-80 border-r border-white/15 bg-black/25 backdrop-blur-sm flex flex-col flex-shrink-0 overflow-hidden"
                >
                    {/* Product Info (editable) */}
                    <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                        className="p-4 border-b border-white/15 space-y-3"
                    >
                        <motion.div variants={staggerItem}>
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
                                className="w-full text-sm border border-white/20 bg-white/10 text-slate-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-shadow"
                            />
                        </motion.div>
                        <motion.div variants={staggerItem}>
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
                        </motion.div>

                        {/* Quality Insights — collapsible */}
                        {qualityInsights && (
                            <motion.div variants={staggerItem} className="mt-3 rounded-lg border border-white/20 bg-white/5 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setQualityExpanded(!qualityExpanded)}
                                    className="flex items-center justify-between w-full p-3 hover:bg-white/5 transition-colors"
                                >
                                    <p className="text-[11px] font-semibold tracking-wide uppercase text-slate-300">Quality Insights</p>
                                    <div className="flex items-center gap-2">
                                        {qualityInsights.overallScore !== null && (
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${qualityInsights.overallPassed
                                                ? 'text-emerald-200 border-emerald-300/40 bg-emerald-400/15'
                                                : 'text-amber-200 border-amber-300/40 bg-amber-400/15'
                                                }`}>
                                                {qualityInsights.overallScore}/100
                                            </span>
                                        )}
                                        <ChevronDown className={`size-3.5 text-slate-400 transition-transform duration-200 ${qualityExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                <AnimatePresence initial={false}>
                                    {qualityExpanded && (
                                        <motion.div
                                            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-3 pb-3">
                                                <div className="text-xs text-slate-300 space-y-1">
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}

                        {/* Build Runtime Insights — collapsible */}
                        {buildRuntimeInsights && (
                            <motion.div variants={staggerItem} className="mt-3 rounded-lg border border-white/20 bg-white/5 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setRuntimeExpanded(!runtimeExpanded)}
                                    className="flex items-center justify-between w-full p-3 hover:bg-white/5 transition-colors"
                                >
                                    <p className="text-[11px] font-semibold tracking-wide uppercase text-slate-300">Build Runtime</p>
                                    <div className="flex items-center gap-2">
                                        {buildRuntimeInsights.htmlBuildMode && (
                                            <span className="rounded-full border border-cyan-300/35 bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-cyan-100">
                                                {formatBuildMode(buildRuntimeInsights.htmlBuildMode)}
                                            </span>
                                        )}
                                        <ChevronDown className={`size-3.5 text-slate-400 transition-transform duration-200 ${runtimeExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                <AnimatePresence initial={false}>
                                    {runtimeExpanded && (
                                        <motion.div
                                            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-3 pb-3 space-y-1 text-xs text-slate-300">
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
                                                <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </motion.div>

                    {/* Studio CTA — shown when no HTML exists */}
                    {!hasHtml && (
                        <motion.div
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="p-4 border-b border-white/15"
                        >
                            <Button
                                className="w-full bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105"
                                onClick={handleOpenStudio}
                            >
                                Open Product Studio
                            </Button>
                            <p className="mt-2 text-center text-xs text-slate-300">
                                New products are generated in Studio. This page is for refining and publishing an existing build.
                            </p>
                        </motion.div>
                    )}

                    {/* AI Chat — shown when HTML exists */}
                    {hasHtml && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/15">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                        <Sparkles className="size-3 text-cyan-400" />
                                        AI Design Chat
                                    </h3>
                                </div>
                            </div>

                            {/* Chat messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 builder-scrollbar">
                                {chatHistory.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        initial={shouldReduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ duration: 0.2 }}
                                        className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                    >
                                        {/* Avatar */}
                                        <span className={`mt-1 flex-shrink-0 rounded-full p-1.5 ${msg.role === 'ai'
                                            ? 'bg-gradient-to-br from-cyan-400 to-amber-400'
                                            : 'bg-cyan-300/80'
                                            }`}>
                                            {msg.role === 'ai'
                                                ? <Sparkles className="size-2.5 text-[#05263a]" />
                                                : <User className="size-2.5 text-[#05263a]" />}
                                        </span>
                                        <div className={msg.role === 'user' ? 'text-right' : ''}>
                                            <div
                                                className={`text-sm rounded-lg px-3 py-2 ${msg.role === 'user'
                                                    ? 'bg-cyan-300 text-[#05263a]'
                                                    : 'bg-white/10 text-slate-100 border border-white/15'
                                                    }`}
                                            >
                                                {msg.message}
                                            </div>
                                            <span className="text-[10px] text-slate-500 mt-0.5 block">
                                                {relativeTime(msg.ts)}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                                {aiLoading && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-start gap-2"
                                    >
                                        <span className="mt-1 flex-shrink-0 rounded-full p-1.5 bg-gradient-to-br from-cyan-400 to-amber-400">
                                            <Sparkles className="size-2.5 text-[#05263a]" />
                                        </span>
                                        <div className="bg-white/10 text-slate-300 text-sm rounded-lg px-3 py-2 border border-white/15 flex items-center gap-2">
                                            <span className="flex gap-1">
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                                            </span>
                                        </div>
                                    </motion.div>
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
                                        className="flex-1 text-sm border border-white/20 bg-white/10 text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-shadow"
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
                                <div className="mt-1.5 flex items-center justify-between">
                                    <div className="flex flex-wrap gap-1">
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
                                    <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2 hidden sm:inline">⏎ Send</span>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.aside>

                {/* Right Panel: Preview (iframe or empty state) */}
                <main className="flex-1 overflow-hidden bg-black/20 flex items-stretch justify-center p-4">
                    {hasHtml ? (
                        <motion.div
                            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 }}
                            className="relative bg-[#0b1523] border border-white/15 rounded-xl overflow-hidden flex flex-col transition-all duration-300 ring-1 ring-cyan-500/10 shadow-[0_0_40px_-12px_rgba(34,211,238,0.12)]"
                            style={{
                                width: DEVICE_WIDTHS[deviceMode],
                                maxWidth: '100%',
                                margin: deviceMode !== 'desktop' ? '0 auto' : undefined,
                            }}
                        >
                            {/* Preview header */}
                            <div className="h-8 bg-black/25 border-b border-white/10 flex items-center px-4 gap-2 flex-shrink-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                                <span className="text-xs text-slate-500 ml-2 font-medium">
                                    Live Preview — {deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}
                                </span>
                            </div>

                            {/* Iframe shimmer loading overlay */}
                            <AnimatePresence>
                                {!iframeLoaded && (
                                    <motion.div
                                        initial={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.4 }}
                                        className="absolute inset-x-0 bottom-0 top-8 z-10 pointer-events-none"
                                    >
                                        <div
                                            className="h-full w-full"
                                            style={{
                                                background: 'linear-gradient(90deg, rgba(15,23,42,0.5) 25%, rgba(30,41,59,0.3) 50%, rgba(15,23,42,0.5) 75%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'builder-shimmer 1.5s ease-in-out infinite',
                                            }}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* iframe preview */}
                            <iframe
                                srcDoc={generatedHtml!}
                                sandbox="allow-scripts"
                                className="flex-1 w-full border-0"
                                title="Product Preview"
                                onLoad={() => setIframeLoaded(true)}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                            className="flex flex-col items-center justify-center text-center max-w-md text-slate-100"
                        >
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
                                    <span className="rounded-2xl bg-gradient-to-br from-cyan-500/20 to-amber-500/20 border border-white/10 p-4 mb-4">
                                        <Palette className="size-8 text-cyan-300" />
                                    </span>
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
                        </motion.div>
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
