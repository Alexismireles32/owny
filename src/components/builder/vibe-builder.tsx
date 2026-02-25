'use client';

// Vibe Builder — HTML Code Generation Edition
// Two modes: (1) AI generates full HTML+Tailwind page, (2) User improves via chat
// Preview: Sandboxed iframe with srcdoc for instant rendering

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import type { ProductDSL, ThemeTokens } from '@/types/product-dsl';

interface VibeBuilderProps {
    productId: string;
    initialDsl: ProductDSL | null;
    initialHtml: string | null;
    onSave: (dsl: ProductDSL, html: string | null) => Promise<void>;
    onPublish: () => Promise<void>;
}

export function VibeBuilder({ productId, initialDsl, initialHtml, onSave, onPublish }: VibeBuilderProps) {
    // State
    const [dsl, setDsl] = useState<ProductDSL>(() => {
        if (initialDsl && typeof initialDsl === 'object') return initialDsl as ProductDSL;
        return defaultDSL();
    });
    const [generatedHtml, setGeneratedHtml] = useState<string | null>(initialHtml);
    const [saving, setSaving] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiProgress, setAiProgress] = useState('');
    const [improveInput, setImproveInput] = useState('');
    const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const hasHtml = !!generatedHtml;

    // --- Full AI Generation (HTML+Tailwind) ---
    const handleAiGenerate = useCallback(async () => {
        setAiLoading(true);
        setAiProgress('Generating your product page with AI...');

        try {
            const buildPacket = {
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
    }, [dsl]);

    // --- AI Improve (send current HTML + instruction) ---
    const handleAiImprove = useCallback(async () => {
        if (!improveInput.trim() || !generatedHtml) return;
        const instruction = improveInput.trim();
        setImproveInput('');
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
        setSaving(true);
        await onSave(dsl, generatedHtml);
        setSaving(false);
    }, [dsl, generatedHtml, onSave]);

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            {/* Top bar */}
            <header className="h-12 border-b bg-white flex items-center justify-between px-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <a
                        href={`/products/${productId}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        ← Back
                    </a>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="font-bold text-sm">{dsl.product.title || 'Untitled Product'}</span>
                    <Badge variant="secondary" className="text-xs">{dsl.product.type}</Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Draft'}
                    </Button>
                    <Button size="sm" onClick={onPublish}>Publish</Button>
                </div>
            </header>

            {/* Two-panel layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Controls & AI Chat */}
                <aside className="w-80 border-r bg-white flex flex-col flex-shrink-0 overflow-hidden">
                    {/* Product Info (editable) */}
                    <div className="p-4 border-b space-y-3">
                        <label className="block text-xs font-medium text-muted-foreground">Title</label>
                        <input
                            type="text"
                            value={dsl.product.title || ''}
                            onChange={(e) =>
                                setDsl((prev) => ({
                                    ...prev,
                                    product: { ...prev.product, title: e.target.value },
                                }))
                            }
                            className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <label className="block text-xs font-medium text-muted-foreground">Mood</label>
                        <select
                            value={dsl.themeTokens?.mood || 'professional'}
                            onChange={(e) => updateTheme('mood', e.target.value)}
                            className="w-full text-sm border rounded-md px-3 py-2"
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
                        <div className="p-4 border-b">
                            <Button
                                className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
                                onClick={handleAiGenerate}
                                disabled={aiLoading}
                            >
                                {aiLoading ? '✨ Generating...' : '✨ Generate with AI'}
                            </Button>
                            {aiProgress && (
                                <p className="text-xs text-muted-foreground mt-2 text-center">{aiProgress}</p>
                            )}
                        </div>
                    )}

                    {/* AI Chat — shown when HTML exists */}
                    {hasHtml && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-4 py-2 border-b">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        AI Design Chat
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-6"
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
                                                ? 'bg-indigo-50 text-indigo-900 ml-6'
                                                : 'bg-gray-50 text-gray-700 mr-6'
                                            }`}
                                    >
                                        {msg.message}
                                    </div>
                                ))}
                                {aiLoading && (
                                    <div className="bg-gray-50 text-gray-500 text-sm rounded-lg px-3 py-2 mr-6 animate-pulse">
                                        Thinking...
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat input */}
                            <div className="p-3 border-t">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={improveInput}
                                        onChange={(e) => setImproveInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAiImprove()}
                                        placeholder="Make the hero bigger, add testimonials..."
                                        className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        disabled={aiLoading}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleAiImprove}
                                        disabled={aiLoading || !improveInput.trim()}
                                    >
                                        Send
                                    </Button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {QUICK_PROMPTS.map((prompt) => (
                                        <button
                                            key={prompt}
                                            onClick={() => {
                                                setImproveInput(prompt);
                                            }}
                                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-600 transition-colors"
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
                <main className="flex-1 overflow-hidden bg-gray-100 flex items-stretch justify-center p-4">
                    {hasHtml ? (
                        <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg overflow-hidden flex flex-col">
                            {/* Preview header */}
                            <div className="h-8 bg-gray-50 border-b flex items-center px-4 gap-2 flex-shrink-0">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                                <span className="text-xs text-gray-400 ml-2">Live Preview</span>
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
                        <div className="flex flex-col items-center justify-center text-center max-w-md">
                            <div className="text-6xl mb-4">🎨</div>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">
                                Create Your Product Page
                            </h2>
                            <p className="text-muted-foreground mb-6">
                                Set your title and mood in the sidebar, then click "Generate with AI" to create a
                                stunning product page with beautiful design, animations, and interactivity.
                            </p>
                            <Button
                                className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 px-8 py-3"
                                onClick={handleAiGenerate}
                                disabled={aiLoading}
                            >
                                {aiLoading ? '✨ Generating...' : '✨ Generate with AI'}
                            </Button>
                            {aiProgress && (
                                <p className="text-sm text-muted-foreground mt-4">{aiProgress}</p>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

// Quick improvement prompts
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
