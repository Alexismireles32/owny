'use client';

// Vibe Builder — Three-panel layout: Outline Tree | Live Preview | Block Editor
// PRD M10

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BlockRenderer } from '@/components/builder/block-renderer';
import type { ProductDSL, DSLBlock, DSLPage } from '@/types/product-dsl';

interface VibeBuilderProps {
    productId: string;
    initialDsl: ProductDSL | null;
    onSave: (dsl: ProductDSL) => Promise<void>;
    onPublish: () => Promise<void>;
}

export function VibeBuilder({ productId, initialDsl, onSave, onPublish }: VibeBuilderProps) {
    const [dsl, setDsl] = useState<ProductDSL>(initialDsl || defaultDSL());
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [selectedPageIdx, setSelectedPageIdx] = useState(0);
    const [saving, setSaving] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    const currentPage = dsl.pages[selectedPageIdx] || dsl.pages[0];
    const selectedBlock = currentPage?.blocks.find((b) => b.id === selectedBlockId) || null;

    // --- Outline actions ---
    const selectBlock = useCallback((blockId: string) => {
        setSelectedBlockId(blockId);
    }, []);

    const moveBlock = useCallback((direction: 'up' | 'down') => {
        if (!selectedBlockId || !currentPage) return;
        const idx = currentPage.blocks.findIndex((b) => b.id === selectedBlockId);
        if (idx === -1) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= currentPage.blocks.length) return;

        setDsl((prev) => {
            const updated = { ...prev };
            const pages = [...updated.pages];
            const blocks = [...pages[selectedPageIdx].blocks];
            [blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]];
            pages[selectedPageIdx] = { ...pages[selectedPageIdx], blocks };
            return { ...updated, pages };
        });
    }, [selectedBlockId, currentPage, selectedPageIdx]);

    const deleteBlock = useCallback(() => {
        if (!selectedBlockId) return;
        setDsl((prev) => {
            const updated = { ...prev };
            const pages = [...updated.pages];
            pages[selectedPageIdx] = {
                ...pages[selectedPageIdx],
                blocks: pages[selectedPageIdx].blocks.filter((b) => b.id !== selectedBlockId),
            };
            return { ...updated, pages };
        });
        setSelectedBlockId(null);
    }, [selectedBlockId, selectedPageIdx]);

    const addBlock = useCallback((type: DSLBlock['type']) => {
        const id = `blk_${Math.random().toString(36).slice(2, 10)}`;
        const newBlock = createDefaultBlock(type, id);
        if (!newBlock) return;

        setDsl((prev) => {
            const updated = { ...prev };
            const pages = [...updated.pages];
            pages[selectedPageIdx] = {
                ...pages[selectedPageIdx],
                blocks: [...pages[selectedPageIdx].blocks, newBlock],
            };
            return { ...updated, pages };
        });
        setSelectedBlockId(id);
    }, [selectedPageIdx]);

    // --- Block editor update ---
    const updateBlock = useCallback((blockId: string, updates: Partial<DSLBlock>) => {
        setDsl((prev) => {
            const updated = { ...prev };
            const pages = [...updated.pages];
            const blocks = pages[selectedPageIdx].blocks.map((b) =>
                b.id === blockId ? { ...b, ...updates } as DSLBlock : b
            );
            pages[selectedPageIdx] = { ...pages[selectedPageIdx], blocks };
            return { ...updated, pages };
        });
    }, [selectedPageIdx]);

    // --- Theme update ---
    const updateTheme = useCallback((key: string, value: string) => {
        setDsl((prev) => ({
            ...prev,
            themeTokens: { ...prev.themeTokens, [key]: value },
        }));
    }, []);

    // --- AI Improve ---
    const handleAiImprove = useCallback(async () => {
        if (!selectedBlock || !aiInput.trim()) return;
        setAiLoading(true);
        try {
            const res = await fetch('/api/ai/improve-block', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    block: selectedBlock,
                    instruction: aiInput,
                    context: {
                        productType: dsl.product.type,
                        themeTokens: dsl.themeTokens,
                        pageType: currentPage.type,
                        surroundingBlocks: [],
                    },
                }),
            });
            const data = await res.json();
            if (data.block) {
                updateBlock(selectedBlock.id, data.block);
            }
        } catch { /* ignore */ }
        setAiLoading(false);
        setAiInput('');
    }, [selectedBlock, aiInput, dsl, currentPage, updateBlock]);

    // --- Save / Publish ---
    const handleSave = useCallback(async () => {
        setSaving(true);
        await onSave(dsl);
        setSaving(false);
    }, [dsl, onSave]);

    return (
        <div className="h-screen flex flex-col bg-slate-50">
            {/* Top bar */}
            <header className="h-12 border-b bg-white flex items-center justify-between px-4 flex-shrink-0">
                <div className="flex items-center gap-2">
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

            {/* Three-panel layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Panel 1: Outline Tree */}
                <div className="w-64 border-r bg-white overflow-y-auto flex-shrink-0">
                    <div className="p-3 border-b">
                        <h3 className="text-xs font-bold uppercase text-muted-foreground">Pages</h3>
                    </div>
                    {dsl.pages.map((page, pi) => (
                        <div key={page.id}>
                            <button
                                className={`w-full text-left px-3 py-2 text-sm font-medium hover:bg-slate-50 ${pi === selectedPageIdx ? 'bg-slate-100 text-primary' : ''
                                    }`}
                                onClick={() => { setSelectedPageIdx(pi); setSelectedBlockId(null); }}
                            >
                                {page.title || `Page ${pi + 1}`}
                            </button>
                            {pi === selectedPageIdx && (
                                <div className="pl-3">
                                    {page.blocks.map((block, bi) => (
                                        <button
                                            key={block.id}
                                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5 ${block.id === selectedBlockId ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'
                                                }`}
                                            onClick={() => selectBlock(block.id)}
                                        >
                                            <span className="opacity-40">{bi + 1}</span>
                                            <span className="truncate">{getBlockLabel(block)}</span>
                                        </button>
                                    ))}
                                    {/* Add block */}
                                    <div className="px-3 py-2">
                                        <AddBlockMenu onAdd={addBlock} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Theme editor */}
                    <Separator className="my-2" />
                    <div className="p-3">
                        <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Theme</h3>
                        <div className="space-y-2">
                            <ColorInput label="Primary" value={dsl.themeTokens.primaryColor} onChange={(v) => updateTheme('primaryColor', v)} />
                            <ColorInput label="Secondary" value={dsl.themeTokens.secondaryColor} onChange={(v) => updateTheme('secondaryColor', v)} />
                            <ColorInput label="Background" value={dsl.themeTokens.backgroundColor} onChange={(v) => updateTheme('backgroundColor', v)} />
                            <ColorInput label="Text" value={dsl.themeTokens.textColor} onChange={(v) => updateTheme('textColor', v)} />
                            <div>
                                <label className="text-xs text-muted-foreground">Font</label>
                                <select
                                    className="w-full border rounded px-2 py-1 text-xs"
                                    value={dsl.themeTokens.fontFamily}
                                    onChange={(e) => updateTheme('fontFamily', e.target.value)}
                                >
                                    <option value="inter">Inter</option>
                                    <option value="dm-sans">DM Sans</option>
                                    <option value="space-grotesk">Space Grotesk</option>
                                    <option value="lora">Lora</option>
                                    <option value="merriweather">Merriweather</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Panel 2: Live Preview */}
                <div className="flex-1 overflow-y-auto" style={{
                    backgroundColor: dsl.themeTokens.backgroundColor,
                    fontFamily: fontFamilyMap[dsl.themeTokens.fontFamily] || 'Inter, sans-serif',
                }}>
                    <div className="max-w-2xl mx-auto py-8">
                        {currentPage?.blocks.map((block) => (
                            <BlockRenderer
                                key={block.id}
                                block={block}
                                theme={dsl.themeTokens}
                                isSelected={block.id === selectedBlockId}
                                onSelect={selectBlock}
                            />
                        ))}
                        {(!currentPage?.blocks || currentPage.blocks.length === 0) && (
                            <div className="text-center py-16 text-muted-foreground">
                                <p className="text-2xl mb-2">🎨</p>
                                <p>No blocks yet. Add blocks from the outline panel.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 3: Block Editor */}
                <div className="w-80 border-l bg-white overflow-y-auto flex-shrink-0">
                    {selectedBlock ? (
                        <div className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-sm">{selectedBlock.type}</h3>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => moveBlock('up')}>↑</Button>
                                    <Button variant="ghost" size="sm" onClick={() => moveBlock('down')}>↓</Button>
                                    <Button variant="ghost" size="sm" className="text-red-500" onClick={deleteBlock}>✕</Button>
                                </div>
                            </div>

                            {/* Block props editor */}
                            <BlockPropsEditor
                                block={selectedBlock}
                                onChange={(updates) => updateBlock(selectedBlock.id, updates)}
                            />

                            {/* AI Improve */}
                            <Separator />
                            <div>
                                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">AI Improve</h4>
                                <div className="flex gap-1">
                                    <Input
                                        placeholder="Make it more concise…"
                                        value={aiInput}
                                        onChange={(e) => setAiInput(e.target.value)}
                                        className="text-xs"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAiImprove()}
                                    />
                                    <Button size="sm" onClick={handleAiImprove} disabled={aiLoading}>
                                        {aiLoading ? '…' : '✨'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 text-center text-muted-foreground">
                            <p className="text-2xl mb-2">👈</p>
                            <p className="text-sm">Click a block to edit it</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Helper components ---

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2">
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-6 h-6 rounded cursor-pointer" />
            <label className="text-xs text-muted-foreground flex-1">{label}</label>
            <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-16 border rounded px-1 py-0.5 text-xs" />
        </div>
    );
}

function AddBlockMenu({ onAdd }: { onAdd: (type: DSLBlock['type']) => void }) {
    const [open, setOpen] = useState(false);
    const types: { type: DSLBlock['type']; icon: string }[] = [
        { type: 'Hero', icon: '🎯' },
        { type: 'TextSection', icon: '📝' },
        { type: 'Bullets', icon: '•' },
        { type: 'Steps', icon: '🔢' },
        { type: 'Checklist', icon: '☑' },
        { type: 'Testimonial', icon: '💬' },
        { type: 'FAQ', icon: '❓' },
        { type: 'CTA', icon: '🚀' },
        { type: 'Pricing', icon: '💰' },
        { type: 'Divider', icon: '—' },
        { type: 'Image', icon: '🖼' },
        { type: 'DownloadButton', icon: '⬇' },
    ];

    if (!open) {
        return (
            <button
                className="w-full border border-dashed rounded px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                onClick={() => setOpen(true)}
            >
                + Add Block
            </button>
        );
    }

    return (
        <Card className="border shadow-sm">
            <CardHeader className="p-2">
                <CardTitle className="text-xs flex items-center justify-between">
                    Add Block
                    <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-2 grid grid-cols-2 gap-1">
                {types.map(({ type, icon }) => (
                    <button
                        key={type}
                        className="text-left px-2 py-1 text-xs rounded hover:bg-slate-100 flex items-center gap-1"
                        onClick={() => { onAdd(type); setOpen(false); }}
                    >
                        <span>{icon}</span>
                        <span>{type}</span>
                    </button>
                ))}
            </CardContent>
        </Card>
    );
}

function BlockPropsEditor({ block, onChange }: { block: DSLBlock; onChange: (u: Partial<DSLBlock>) => void }) {
    const props = (block as { props: Record<string, unknown> }).props || {};

    return (
        <div className="space-y-2">
            {Object.entries(props).map(([key, value]) => {
                if (typeof value === 'string') {
                    return (
                        <div key={key}>
                            <label className="text-xs text-muted-foreground capitalize">{key}</label>
                            {value.length > 80 ? (
                                <textarea
                                    className="w-full border rounded px-2 py-1 text-xs min-h-[60px]"
                                    value={value}
                                    onChange={(e) => onChange({ props: { ...props, [key]: e.target.value } } as Partial<DSLBlock>)}
                                />
                            ) : (
                                <Input
                                    className="text-xs"
                                    value={value}
                                    onChange={(e) => onChange({ props: { ...props, [key]: e.target.value } } as Partial<DSLBlock>)}
                                />
                            )}
                        </div>
                    );
                }
                if (typeof value === 'number') {
                    return (
                        <div key={key}>
                            <label className="text-xs text-muted-foreground capitalize">{key}</label>
                            <Input
                                type="number"
                                className="text-xs"
                                value={value}
                                onChange={(e) => onChange({ props: { ...props, [key]: Number(e.target.value) } } as Partial<DSLBlock>)}
                            />
                        </div>
                    );
                }
                if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
                    return (
                        <div key={key}>
                            <label className="text-xs text-muted-foreground capitalize">{key}</label>
                            <textarea
                                className="w-full border rounded px-2 py-1 text-xs min-h-[60px]"
                                value={(value as string[]).join('\n')}
                                onChange={(e) => onChange({
                                    props: { ...props, [key]: e.target.value.split('\n') },
                                } as Partial<DSLBlock>)}
                            />
                            <span className="text-xs text-muted-foreground">One per line</span>
                        </div>
                    );
                }
                return (
                    <div key={key}>
                        <label className="text-xs text-muted-foreground capitalize">{key}</label>
                        <p className="text-xs text-muted-foreground italic">Complex field — use AI Improve</p>
                    </div>
                );
            })}
        </div>
    );
}

// --- Utilities ---

function getBlockLabel(block: DSLBlock): string {
    const p = (block as { props: Record<string, unknown> }).props;
    const text = (p?.headline || p?.heading || p?.title || p?.label || block.type) as string;
    return text.length > 25 ? text.slice(0, 25) + '…' : text;
}

const fontFamilyMap: Record<string, string> = {
    'inter': 'Inter, sans-serif',
    'dm-sans': '"DM Sans", sans-serif',
    'space-grotesk': '"Space Grotesk", sans-serif',
    'lora': 'Lora, serif',
    'merriweather': 'Merriweather, serif',
};

function createDefaultBlock(type: DSLBlock['type'], id: string): DSLBlock | null {
    const base = { id, variant: 'standard' as const, styleOverrides: {} };
    switch (type) {
        case 'Hero': return { ...base, type: 'Hero', variant: 'centered', props: { headline: 'Your Headline', subhead: 'Your subheadline goes here', ctaText: 'Get Started' } };
        case 'TextSection': return { ...base, type: 'TextSection', variant: 'standard', props: { heading: 'Section Title', body: 'Write your content here...' } };
        case 'Bullets': return { ...base, type: 'Bullets', variant: 'checkmark', props: { heading: 'Key Points', items: ['Point 1', 'Point 2', 'Point 3'] } };
        case 'Steps': return { ...base, type: 'Steps', variant: 'vertical', props: { heading: 'How It Works', steps: [{ title: 'Step 1', description: 'Description' }] } };
        case 'Checklist': return { ...base, type: 'Checklist', variant: 'simple', props: { heading: 'Checklist', items: [{ id: 'chk_1', label: 'Item 1', isRequired: false }] } };
        case 'Testimonial': return { ...base, type: 'Testimonial', variant: 'card', props: { quotes: [{ text: 'Great product!', author: 'Customer' }] } };
        case 'FAQ': return { ...base, type: 'FAQ', variant: 'accordion', props: { heading: 'FAQ', items: [{ question: 'Question?', answer: 'Answer.' }] } };
        case 'CTA': return { ...base, type: 'CTA', variant: 'simple', props: { headline: 'Ready to start?', buttonText: 'Buy Now' } };
        case 'Pricing': return { ...base, type: 'Pricing', variant: 'card', props: { price: '$29', features: ['Feature 1', 'Feature 2'], buttonText: 'Get Access' } };
        case 'Divider': return { ...base, type: 'Divider', variant: 'line', props: {} as Record<string, never> };
        case 'Image': return { ...base, type: 'Image', variant: 'contained', props: { src: '', alt: 'Image placeholder' } };
        case 'DownloadButton': return { ...base, type: 'DownloadButton', variant: 'primary', props: { label: 'Download PDF', fileKey: '' } };
        default: return null;
    }
}

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
        },
        pages: [{
            id: 'page_sales',
            type: 'sales',
            title: 'Sales Page',
            blocks: [],
            accessRule: 'public',
        }],
    };
}
