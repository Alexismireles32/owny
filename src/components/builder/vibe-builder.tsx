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
    onSave: (dsl: ProductDSL, html: string | null) => Promise<void>;
    onPublish: () => Promise<void>;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
};

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
    const [aiProgress, setAiProgress] = useState('');
    const [actionError, setActionError] = useState<string | null>(null);
    const [improveInput, setImproveInput] = useState('');
    const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([]);
    const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
    const [lastSavedHtml, setLastSavedHtml] = useState<string | null>(initialHtml);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hasHtml = !!generatedHtml;

    // --- Auto-save: debounced save after HTML changes ---
    useEffect(() => {
        if (!generatedHtml || generatedHtml === lastSavedHtml) return;

        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(async () => {
            try {
                await onSave(dsl, generatedHtml);
                setLastSavedHtml(generatedHtml);
            } catch {
                // silent — will retry on next change
            }
        }, 5000); // auto-save 5s after last AI change

        return () => {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        };
    }, [generatedHtml, dsl, lastSavedHtml, onSave]);

    // --- Full AI Generation (HTML+Tailwind) with SSE Streaming ---
    const handleAiGenerate = useCallback(async () => {
        setAiLoading(true);
        setAiProgress('Connecting to AI...');

        try {
            // Use the real build packet if available (from product chat),
            // otherwise construct a minimal one from the DSL
            const buildPacket = initialBuildPacket && Object.keys(initialBuildPacket).length > 0
                ? {
                    ...initialBuildPacket,
                    productType: initialBuildPacket.productType || dsl.product.type,
                    title: dsl.product.title,
                    tone: dsl.themeTokens?.mood || (initialBuildPacket.tone as string) || 'professional',
                    brandTokens: dsl.themeTokens,
                }
                : {
                    productType: dsl.product.type,
                    title: dsl.product.title,
                    audience: 'general',
                    tone: dsl.themeTokens?.mood || 'professional',
                    brandTokens: dsl.themeTokens,
                    clips: [],
                };

            const res = await fetch('/api/ai/build-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ buildPacket }),
            });

            const data = await res.json();

            if (!res.ok) {
                setAiProgress(`Error: ${data.error || 'Failed to generate product'}`);
                setAiLoading(false);
                return;
            }

            if (data.html) {
                setGeneratedHtml(data.html);
                if (data.dsl) setDsl(data.dsl);
                setAiProgress('');
                setChatHistory([{ role: 'ai', message: '✨ Your product page is ready! Use the chat below to refine the design.' }]);
            } else if (data.dsl) {
                // Fallback: legacy DSL response
                setDsl(data.dsl);
                setAiProgress('Generated DSL (no HTML). Try again or use legacy mode.');
            } else {
                setAiProgress('No content returned — try again.');
            }
        } catch (err) {
            setAiProgress(`Error: ${err instanceof Error ? err.message : 'Network error'}`);
        }
        setAiLoading(false);
    }, [dsl, initialBuildPacket]);

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
                body: JSON.stringify({ html: generatedHtml, instruction }),
            });

            const data = await res.json();

            if (data.html) {
                setGeneratedHtml(data.html);
                setChatHistory((prev) => [...prev, { role: 'ai', message: '✅ Applied your changes! Take a look at the preview.' }]);
            } else {
                setChatHistory((prev) => [...prev, { role: 'ai', message: `❌ ${data.error || 'Failed to improve. Try a different instruction.'}` }]);
            }
        } catch {
            setChatHistory((prev) => [...prev, { role: 'ai', message: '❌ Network error. Please try again.' }]);
        }
        setAiLoading(false);

        // Scroll chat to bottom
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, [improveInput, generatedHtml]);

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
            await onSave(dsl, generatedHtml);
            setLastSavedHtml(generatedHtml);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not save your draft.');
        } finally {
            setSaving(false);
        }
    }, [dsl, generatedHtml, onSave]);

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
                    </div>

                    {/* Generate Button — shown when no HTML exists */}
                    {!hasHtml && (
                        <div className="p-4 border-b border-white/15">
                            <Button
                                className="w-full bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105"
                                onClick={handleAiGenerate}
                                disabled={aiLoading}
                            >
                                {aiLoading ? '✨ Generating...' : '✨ Generate with AI'}
                            </Button>
                            {aiProgress && (
                                <p className="text-xs text-slate-300 mt-2 text-center">{aiProgress}</p>
                            )}
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
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-6 text-slate-100 hover:bg-white/10"
                                        onClick={handleAiGenerate}
                                        disabled={aiLoading}
                                    >
                                        🔄 Regenerate
                                    </Button>
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
                                        {aiProgress || 'Thinking...'}
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
                                    <p className="text-sm text-slate-300 mt-4">
                                        {aiProgress || '✨ AI is building your product page...'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="text-6xl mb-4">🎨</div>
                                    <h2 className="text-xl font-bold mb-2">
                                        Create Your Product Page
                                    </h2>
                                    <p className="text-slate-300 mb-6">
                                        Set your title and mood in the sidebar, then click &quot;Generate with AI&quot; to create a
                                        stunning product page with beautiful design, animations, and interactivity.
                                    </p>
                                    <Button
                                        className="bg-gradient-to-r from-cyan-400 to-amber-400 text-[#05263a] hover:brightness-105 px-8 py-3"
                                        onClick={handleAiGenerate}
                                        disabled={aiLoading}
                                    >
                                        ✨ Generate with AI
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
