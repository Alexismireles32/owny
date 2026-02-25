'use client';

// /sandbox — Standalone DSL visualization preview
// No auth, no Supabase, no API keys needed. Just renders sample DSL.

import { useState } from 'react';
import { BlockRenderer } from '@/components/builder/block-renderer';
import type { ProductDSL, ThemeTokens } from '@/types/product-dsl';

// ─── Sample DSL — a realistic product page ───

const SAMPLE_DSL: ProductDSL = {
    product: { title: 'The Morning Protocol', type: 'pdf_guide', version: 1 },
    themeTokens: {
        primaryColor: '#4F46E5',
        secondaryColor: '#818CF8',
        backgroundColor: '#FAFAFA',
        textColor: '#1E1E2E',
        fontFamily: 'inter',
        borderRadius: 'md',
        spacing: 'normal',
        shadow: 'sm',
        mood: 'clean',
    },
    pages: [
        {
            id: 'page_sales',
            type: 'sales',
            title: 'Sales Page',
            accessRule: 'public',
            blocks: [
                {
                    id: 'blk_hero001',
                    type: 'Hero',
                    variant: 'centered',
                    props: {
                        headline: 'The Morning Protocol',
                        subhead: 'Science-backed steps to transform your mornings and 10X your productivity',
                        ctaText: 'Get Instant Access',
                    },
                },
                {
                    id: 'blk_divider1',
                    type: 'Divider',
                    variant: 'dots',
                    props: {},
                },
                {
                    id: 'blk_text001',
                    type: 'TextSection',
                    variant: 'callout',
                    props: {
                        heading: 'The Problem',
                        body: 'Most people waste their first 2 hours scrolling, snoozing, and scrambling. By 10 AM, they\'ve already lost the day. The Morning Protocol changes that completely with a proven 5-step system.',
                    },
                },
                {
                    id: 'blk_bull001',
                    type: 'Bullets',
                    variant: 'checkmark',
                    props: {
                        heading: 'What You\'ll Get',
                        items: [
                            'Complete 5-step morning routine (takes only 45 minutes)',
                            'Supplement stack guide with exact dosages',
                            'Printable daily journal template',
                            'Cold exposure protocol for beginners',
                            'Sleep optimization checklist',
                        ],
                    },
                },
                {
                    id: 'blk_step001',
                    type: 'Steps',
                    variant: 'vertical',
                    props: {
                        heading: 'How It Works',
                        steps: [
                            { title: 'Wake at 5:00 AM', description: 'Set your circadian rhythm with consistent wake times — no alarm snoozing.' },
                            { title: 'Cold Exposure (2 min)', description: 'Cold shower or face dunk to spike norepinephrine and cortisol naturally.' },
                            { title: 'Sunlight + Movement', description: '10 minutes of outdoor light with gentle movement — yoga, walking, or stretching.' },
                            { title: 'Journal (10 min)', description: 'Gratitude + intention setting. The template keeps it structured and fast.' },
                            { title: 'Deep Work Block', description: 'Your most important task, done before the world wakes up.' },
                        ],
                    },
                },
                {
                    id: 'blk_test001',
                    type: 'Testimonial',
                    variant: 'card',
                    props: {
                        quotes: [
                            { text: 'I went from hitting snooze 5 times to being the most productive person in my office. This protocol is life-changing.', author: 'Sarah K., Marketing Director' },
                            { text: 'My energy levels are completely different. I no longer need 3 coffees to function.', author: 'Mike R., Software Engineer' },
                        ],
                    },
                },
                {
                    id: 'blk_faq001',
                    type: 'FAQ',
                    variant: 'list',
                    props: {
                        heading: 'Frequently Asked Questions',
                        items: [
                            { question: 'Do I really need to wake up at 5 AM?', answer: 'No! The protocol works at any wake time. 5 AM is the example, but the sequence matters more than the hour.' },
                            { question: 'What if I\'m not a morning person?', answer: 'That\'s exactly who this is for. The protocol gradually shifts your rhythm over 7 days.' },
                            { question: 'Is this a physical product?', answer: 'It\'s a digital PDF guide you can download instantly and start using tomorrow morning.' },
                        ],
                    },
                },
                {
                    id: 'blk_price01',
                    type: 'Pricing',
                    variant: 'card',
                    props: {
                        headline: 'The Morning Protocol',
                        price: '$19',
                        features: [
                            '45-page PDF guide',
                            'Printable journal template',
                            'Supplement stack reference',
                            'Lifetime access + updates',
                        ],
                        buttonText: 'Get Instant Access',
                    },
                },
                {
                    id: 'blk_cta001',
                    type: 'CTA',
                    variant: 'hero',
                    props: {
                        headline: 'Start Tomorrow Morning',
                        subtext: 'Join 2,400+ people who transformed their mornings',
                        buttonText: 'Get the Protocol — $19',
                        priceText: '$19',
                    },
                },
            ],
        },
    ],
};

// ─── Theme presets ───

const THEMES: Record<string, ThemeTokens> = {
    indigo: SAMPLE_DSL.themeTokens,
    emerald: {
        primaryColor: '#059669',
        secondaryColor: '#34D399',
        backgroundColor: '#F0FDF4',
        textColor: '#1A2E1A',
        fontFamily: 'inter',
        borderRadius: 'lg',
        spacing: 'relaxed',
        shadow: 'md',
        mood: 'fresh',
    },
    rose: {
        primaryColor: '#E11D48',
        secondaryColor: '#FB7185',
        backgroundColor: '#FFF1F2',
        textColor: '#2D1B1E',
        fontFamily: 'inter',
        borderRadius: 'full',
        spacing: 'normal',
        shadow: 'sm',
        mood: 'bold',
    },
    dark: {
        primaryColor: '#8B5CF6',
        secondaryColor: '#C4B5FD',
        backgroundColor: '#0F0F1A',
        textColor: '#E5E5F0',
        fontFamily: 'inter',
        borderRadius: 'md',
        spacing: 'normal',
        shadow: 'lg',
        mood: 'premium',
    },
    sunset: {
        primaryColor: '#EA580C',
        secondaryColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
        textColor: '#2D1F0E',
        fontFamily: 'inter',
        borderRadius: 'sm',
        spacing: 'compact',
        shadow: 'none',
        mood: 'energetic',
    },
};

// ─── Page component ───

export default function SandboxPage() {
    const [selectedTheme, setSelectedTheme] = useState<string>('indigo');
    const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
    const [showJson, setShowJson] = useState(false);

    const theme = THEMES[selectedTheme];
    const page = SAMPLE_DSL.pages[0];

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: '#eee' }}>
            {/* Header */}
            <div style={{
                padding: '1rem 2rem',
                borderBottom: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#1a1a2e',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <a href="/dashboard" style={{ fontSize: '0.8rem', color: '#888', textDecoration: 'none' }}>
                        ← Dashboard
                    </a>
                    <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                        🧪 Owny DSL Sandbox
                    </h1>
                    <span style={{
                        fontSize: '0.7rem', background: '#4F46E5', color: '#fff',
                        padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                    }}>
                        PREVIEW
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Theme switcher */}
                    {Object.entries(THEMES).map(([name, t]) => (
                        <button
                            key={name}
                            onClick={() => setSelectedTheme(name)}
                            style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: `linear-gradient(135deg, ${t.primaryColor}, ${t.secondaryColor})`,
                                border: selectedTheme === name ? '2px solid #fff' : '2px solid transparent',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            title={name}
                        />
                    ))}

                    <div style={{ width: 1, height: 24, background: '#444', margin: '0 0.5rem' }} />

                    {/* JSON toggle */}
                    <button
                        onClick={() => setShowJson(!showJson)}
                        style={{
                            background: showJson ? '#4F46E5' : '#333',
                            color: '#fff', border: 'none', padding: '6px 12px',
                            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
                            fontWeight: 600,
                        }}
                    >
                        {showJson ? '← Preview' : '{ } JSON'}
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>
                {/* Preview panel */}
                <div style={{
                    flex: 1,
                    padding: '2rem',
                }}>
                    {showJson ? (
                        <pre style={{
                            background: '#1a1a2e', borderRadius: '12px', padding: '1.5rem',
                            overflow: 'auto', fontSize: '0.8rem', lineHeight: 1.5,
                            color: '#C4B5FD', maxHeight: '80vh',
                        }}>
                            {JSON.stringify({ ...SAMPLE_DSL, themeTokens: theme }, null, 2)}
                        </pre>
                    ) : (
                        <div style={{
                            background: theme.backgroundColor,
                            borderRadius: '12px',
                            overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            maxWidth: 720,
                            margin: '0 auto',
                        }}>
                            {/* Browser chrome */}
                            <div style={{
                                background: '#e5e5e5', padding: '8px 12px',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
                                <div style={{
                                    flex: 1, background: '#fff', borderRadius: '4px',
                                    padding: '3px 12px', fontSize: '0.7rem', color: '#666',
                                    marginLeft: '8px',
                                }}>
                                    owny.store/p/the-morning-protocol
                                </div>
                            </div>

                            {/* Blocks */}
                            {page.blocks.map((block) => (
                                <BlockRenderer
                                    key={block.id}
                                    block={block}
                                    theme={theme}
                                    isSelected={selectedBlock === block.id}
                                    onSelect={setSelectedBlock}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Info sidebar */}
                <div style={{
                    width: 280, padding: '1.5rem', borderLeft: '1px solid #333',
                    fontSize: '0.85rem',
                }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: '#C4B5FD' }}>
                        📊 DSL Stats
                    </h3>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: '#999' }}>Product</span>
                            <span style={{ fontWeight: 600 }}>{SAMPLE_DSL.product.title}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: '#999' }}>Type</span>
                            <span style={{ fontWeight: 600 }}>{SAMPLE_DSL.product.type}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: '#999' }}>Pages</span>
                            <span style={{ fontWeight: 600 }}>{SAMPLE_DSL.pages.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: '#999' }}>Blocks</span>
                            <span style={{ fontWeight: 600 }}>{page.blocks.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: '#999' }}>Theme</span>
                            <span style={{
                                fontWeight: 600, textTransform: 'capitalize',
                                color: theme.primaryColor,
                            }}>
                                {selectedTheme}
                            </span>
                        </div>
                    </div>

                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#C4B5FD' }}>
                        🧱 Blocks
                    </h3>

                    {page.blocks.map((block) => (
                        <button
                            key={block.id}
                            onClick={() => setSelectedBlock(block.id === selectedBlock ? null : block.id)}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', marginBottom: '4px', borderRadius: '6px',
                                border: 'none', cursor: 'pointer', fontSize: '0.8rem',
                                background: selectedBlock === block.id ? '#4F46E530' : 'transparent',
                                color: selectedBlock === block.id ? '#C4B5FD' : '#999',
                                transition: 'all 0.15s',
                            }}
                        >
                            <span style={{ fontWeight: 600, color: selectedBlock === block.id ? '#fff' : '#ccc' }}>
                                {block.type}
                            </span>
                            <span style={{ marginLeft: 4 }}>
                                ({block.variant})
                            </span>
                        </button>
                    ))}

                    {selectedBlock && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#1a1a2e', borderRadius: '8px' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#C4B5FD', marginBottom: '0.5rem' }}>
                                Selected Block JSON
                            </h4>
                            <pre style={{
                                fontSize: '0.7rem', color: '#888', overflow: 'auto',
                                maxHeight: 200, lineHeight: 1.4,
                            }}>
                                {JSON.stringify(page.blocks.find(b => b.id === selectedBlock), null, 2)}
                            </pre>
                        </div>
                    )}

                    <div style={{
                        marginTop: '2rem', padding: '1rem', background: '#1a1a2e',
                        borderRadius: '8px', fontSize: '0.75rem', color: '#666',
                        lineHeight: 1.5,
                    }}>
                        <strong style={{ color: '#999' }}>💡 How it works:</strong><br />
                        This page renders a hardcoded ProductDSL through the same BlockRenderer used in the real Vibe Builder. Click blocks to inspect their JSON. Switch themes to see how themeTokens affect rendering.
                    </div>
                </div>
            </div>
        </div>
    );
}
