'use client';

// DSL → React block renderer
// PRD §6.2 — Renders all 15 block types with variant support

import type { DSLBlock, ProductDSL } from '@/types/product-dsl';

interface BlockRendererProps {
    block: DSLBlock;
    theme: ProductDSL['themeTokens'];
    isSelected?: boolean;
    onSelect?: (blockId: string) => void;
}

export function BlockRenderer({ block, theme, isSelected, onSelect }: BlockRendererProps) {
    const style: React.CSSProperties = {
        cursor: onSelect ? 'pointer' : undefined,
        outline: isSelected ? `2px solid ${theme.primaryColor}` : undefined,
        outlineOffset: isSelected ? '2px' : undefined,
        borderRadius: radiusMap[theme.borderRadius] || '8px',
        transition: 'outline 0.15s ease',
    };

    return (
        <div
            style={style}
            onClick={(e) => {
                e.stopPropagation();
                onSelect?.(block.id);
            }}
        >
            {renderBlock(block, theme)}
        </div>
    );
}

const radiusMap: Record<string, string> = {
    none: '0', sm: '4px', md: '8px', lg: '16px', full: '9999px',
};

function renderBlock(block: DSLBlock, theme: ProductDSL['themeTokens']): React.ReactNode {
    switch (block.type) {
        case 'Hero':
            return (
                <div style={{
                    padding: '3rem 2rem',
                    textAlign: block.variant === 'centered' ? 'center' : 'left',
                    background: block.styleOverrides?.backgroundColor || `linear-gradient(135deg, ${theme.primaryColor}15, ${theme.secondaryColor}15)`,
                }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', color: theme.textColor }}>
                        {block.props.headline}
                    </h1>
                    <p style={{ fontSize: '1.1rem', color: theme.textColor, opacity: 0.7, marginBottom: '1.5rem' }}>
                        {block.props.subhead}
                    </p>
                    {block.props.ctaText && (
                        <button style={{
                            background: theme.primaryColor, color: '#fff',
                            padding: '0.75rem 2rem', borderRadius: '8px', border: 'none',
                            fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
                        }}>
                            {block.props.ctaText}
                        </button>
                    )}
                </div>
            );

        case 'TextSection':
            return (
                <div style={{
                    padding: '1.5rem 2rem',
                    background: block.variant === 'highlight' ? `${theme.primaryColor}08` : 'transparent',
                    borderLeft: block.variant === 'callout' ? `3px solid ${theme.primaryColor}` : undefined,
                }}>
                    {block.props.heading && (
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: theme.textColor }}>
                            {block.props.heading}
                        </h2>
                    )}
                    <p style={{ lineHeight: 1.7, color: theme.textColor, opacity: 0.85 }}>
                        {block.props.body}
                    </p>
                </div>
            );

        case 'Bullets':
            return (
                <div style={{ padding: '1.5rem 2rem' }}>
                    {block.props.heading && (
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: theme.textColor }}>
                            {block.props.heading}
                        </h3>
                    )}
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {block.props.items.map((item, i) => (
                            <li key={i} style={{ padding: '0.4rem 0', display: 'flex', gap: '0.5rem', color: theme.textColor }}>
                                <span style={{ color: theme.primaryColor, fontWeight: 700 }}>
                                    {block.variant === 'checkmark' ? '✓' : block.variant === 'numbered' ? `${i + 1}.` : '•'}
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            );

        case 'Steps':
            return (
                <div style={{ padding: '1.5rem 2rem' }}>
                    {block.props.heading && (
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: theme.textColor }}>
                            {block.props.heading}
                        </h3>
                    )}
                    {block.props.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%', background: theme.primaryColor,
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.85rem', flexShrink: 0,
                            }}>
                                {i + 1}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, color: theme.textColor }}>{step.title}</div>
                                <div style={{ fontSize: '0.9rem', color: theme.textColor, opacity: 0.7 }}>{step.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            );

        case 'Checklist':
            return (
                <div style={{ padding: '1.5rem 2rem' }}>
                    {block.props.heading && (
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: theme.textColor }}>
                            {block.props.heading}
                        </h3>
                    )}
                    {block.props.items.map((item) => (
                        <div key={item.id} style={{ display: 'flex', gap: '0.5rem', padding: '0.4rem 0', color: theme.textColor }}>
                            <span style={{ color: theme.primaryColor }}>☐</span>
                            <span>{item.label}{item.isRequired && <span style={{ color: 'red', marginLeft: 4 }}>*</span>}</span>
                        </div>
                    ))}
                </div>
            );

        case 'Testimonial':
            return (
                <div style={{ padding: '1.5rem 2rem' }}>
                    {block.props.quotes.map((q, i) => (
                        <div key={i} style={{
                            padding: '1rem', marginBottom: '0.75rem', borderRadius: '8px',
                            background: `${theme.primaryColor}08`, borderLeft: `3px solid ${theme.primaryColor}`,
                        }}>
                            <p style={{ fontStyle: 'italic', color: theme.textColor, marginBottom: '0.5rem' }}>
                                &ldquo;{q.text}&rdquo;
                            </p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.primaryColor }}>
                                — {q.author}
                            </p>
                        </div>
                    ))}
                </div>
            );

        case 'FAQ':
            return (
                <div style={{ padding: '1.5rem 2rem' }}>
                    {block.props.heading && (
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: theme.textColor }}>
                            {block.props.heading}
                        </h3>
                    )}
                    {block.props.items.map((item, i) => (
                        <div key={i} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                            <div style={{ fontWeight: 600, color: theme.textColor, marginBottom: '0.25rem' }}>
                                {item.question}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: theme.textColor, opacity: 0.7 }}>
                                {item.answer}
                            </div>
                        </div>
                    ))}
                </div>
            );

        case 'CTA':
            return (
                <div style={{
                    padding: '2rem', textAlign: 'center',
                    background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
                    borderRadius: '12px', margin: '1rem 0',
                }}>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
                        {block.props.headline}
                    </h3>
                    {block.props.subtext && (
                        <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '1rem' }}>{block.props.subtext}</p>
                    )}
                    {block.props.priceText && (
                        <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.5rem', marginBottom: '1rem' }}>
                            {block.props.priceText}
                        </p>
                    )}
                    <button style={{
                        background: '#fff', color: theme.primaryColor, padding: '0.75rem 2rem',
                        borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer',
                    }}>
                        {block.props.buttonText}
                    </button>
                </div>
            );

        case 'Pricing':
            return (
                <div style={{
                    padding: '2rem', textAlign: 'center', border: `2px solid ${theme.primaryColor}`,
                    borderRadius: '12px', margin: '1rem 0',
                }}>
                    {block.props.headline && (
                        <h3 style={{ fontWeight: 700, color: theme.textColor, marginBottom: '0.5rem' }}>{block.props.headline}</h3>
                    )}
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: theme.primaryColor, marginBottom: '0.5rem' }}>
                        {block.props.price}
                        {block.props.period && <span style={{ fontSize: '1rem', fontWeight: 400 }}>/{block.props.period}</span>}
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1.5rem' }}>
                        {block.props.features.map((f, i) => (
                            <li key={i} style={{ padding: '0.3rem 0', color: theme.textColor }}>✓ {f}</li>
                        ))}
                    </ul>
                    <button style={{
                        background: theme.primaryColor, color: '#fff', padding: '0.75rem 2rem',
                        borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', width: '100%',
                    }}>
                        {block.props.buttonText}
                    </button>
                </div>
            );

        case 'Divider':
            return (
                <div style={{ padding: '1rem 2rem' }}>
                    {block.variant === 'space' ? (
                        <div style={{ height: '2rem' }} />
                    ) : block.variant === 'dots' ? (
                        <div style={{ textAlign: 'center', color: theme.textColor, opacity: 0.3, letterSpacing: '0.5rem' }}>• • •</div>
                    ) : (
                        <hr style={{ border: 'none', borderTop: `1px solid ${theme.textColor}20` }} />
                    )}
                </div>
            );

        case 'ModuleHeader':
            return (
                <div style={{
                    padding: '1.5rem 2rem', background: `${theme.primaryColor}10`,
                    borderBottom: `2px solid ${theme.primaryColor}`,
                }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: theme.primaryColor, fontWeight: 700, marginBottom: '0.25rem' }}>
                        Module {block.props.moduleNumber}
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: theme.textColor, marginBottom: '0.25rem' }}>
                        {block.props.title}
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: theme.textColor, opacity: 0.7 }}>{block.props.description}</p>
                    <span style={{ fontSize: '0.8rem', color: theme.primaryColor }}>{block.props.lessonCount} lessons</span>
                </div>
            );

        case 'LessonContent':
            return (
                <div style={{ padding: '1.5rem 2rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: theme.textColor, marginBottom: '0.5rem' }}>
                        {block.props.title}
                    </h3>
                    <p style={{ lineHeight: 1.7, color: theme.textColor, opacity: 0.85, marginBottom: '1rem' }}>
                        {block.props.body}
                    </p>
                    {block.props.steps && block.props.steps.length > 0 && (
                        <div>
                            {block.props.steps.map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ color: theme.primaryColor, fontWeight: 700 }}>{i + 1}.</span>
                                    <span style={{ color: theme.textColor }}>{s.title}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );

        case 'DayHeader':
            return (
                <div style={{
                    padding: '1.5rem 2rem', background: `${theme.secondaryColor}10`,
                    borderLeft: `4px solid ${theme.secondaryColor}`,
                }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: theme.secondaryColor, fontWeight: 700 }}>
                        Day {block.props.dayNumber}
                    </div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: theme.textColor, marginBottom: '0.25rem' }}>
                        {block.props.title}
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: theme.textColor, opacity: 0.7 }}>{block.props.objective}</p>
                </div>
            );

        case 'DownloadButton':
            return (
                <div style={{ padding: '1.5rem 2rem', textAlign: 'center' }}>
                    <button style={{
                        background: theme.primaryColor, color: '#fff', padding: '0.75rem 2rem',
                        borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                        ⬇ {block.props.label}
                    </button>
                </div>
            );

        case 'Image':
            return (
                <div style={{
                    padding: block.variant === 'full-width' ? 0 : '1.5rem 2rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        background: `${theme.primaryColor}10`, padding: '3rem',
                        borderRadius: block.variant === 'rounded' ? '16px' : '8px',
                        color: theme.textColor, opacity: 0.5,
                    }}>
                        🖼 {block.props.alt || 'Image placeholder'}
                    </div>
                    {block.props.caption && (
                        <p style={{ fontSize: '0.8rem', color: theme.textColor, opacity: 0.5, marginTop: '0.5rem' }}>
                            {block.props.caption}
                        </p>
                    )}
                </div>
            );

        default:
            return (
                <div style={{ padding: '1rem 2rem', color: '#999', fontStyle: 'italic' }}>
                    Unknown block type: {(block as DSLBlock).type}
                </div>
            );
    }
}
