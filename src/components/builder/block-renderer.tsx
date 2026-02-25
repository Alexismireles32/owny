'use client';

// DSL → React block renderer
// PRD §6.2 — Renders all 15 block types with variant support
// Tailwind-first rendering: Tailwind for layout/polish, style={{}} for dynamic theme colors

import type { DSLBlock, ProductDSL } from '@/types/product-dsl';

interface BlockRendererProps {
    block: DSLBlock;
    theme: ProductDSL['themeTokens'];
    isSelected?: boolean;
    onSelect?: (blockId: string) => void;
}

const radiusClass: Record<string, string> = {
    none: 'rounded-none',
    sm: 'rounded',
    md: 'rounded-lg',
    lg: 'rounded-2xl',
    full: 'rounded-full',
};

const shadowClass: Record<string, string> = {
    none: 'shadow-none',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
};

export function BlockRenderer({ block, theme, isSelected, onSelect }: BlockRendererProps) {
    return (
        <div
            className={`
                transition-all duration-200
                ${isSelected ? 'ring-2 ring-offset-2' : ''}
                ${onSelect ? 'cursor-pointer' : ''}
                ${radiusClass[theme.borderRadius] || 'rounded-lg'}
            `}
            style={{
                '--tw-ring-color': theme.primaryColor,
                outlineOffset: isSelected ? '2px' : undefined,
            } as React.CSSProperties}
            onClick={(e) => {
                e.stopPropagation();
                onSelect?.(block.id);
            }}
        >
            {renderBlock(block, theme)}
        </div>
    );
}

function renderBlock(block: DSLBlock, theme: ProductDSL['themeTokens']): React.ReactNode {
    switch (block.type) {
        case 'Hero':
            return (
                <div
                    className={`px-8 py-12 ${block.variant === 'centered' ? 'text-center' : 'text-left'}`}
                    style={{
                        background: block.styleOverrides?.backgroundColor
                            || `linear-gradient(135deg, ${theme.primaryColor}15, ${theme.secondaryColor}15)`,
                    }}
                >
                    <h1
                        className="text-3xl font-extrabold mb-2 leading-tight"
                        style={{ color: theme.textColor }}
                    >
                        {block.props.headline}
                    </h1>
                    <p
                        className="text-lg opacity-70 mb-6 max-w-2xl mx-auto"
                        style={{ color: theme.textColor }}
                    >
                        {block.props.subhead}
                    </p>
                    {block.props.ctaText && (
                        <button
                            className={`
                                px-8 py-3 font-semibold text-white border-none
                                ${radiusClass[theme.borderRadius] || 'rounded-lg'}
                                ${shadowClass[theme.shadow] || 'shadow-sm'}
                                transition-all duration-200
                                hover:shadow-lg hover:scale-[1.02]
                                active:scale-[0.98]
                                focus:ring-2 focus:ring-offset-2
                            `}
                            style={{
                                backgroundColor: theme.primaryColor,
                                '--tw-ring-color': theme.primaryColor,
                            } as React.CSSProperties}
                        >
                            {block.props.ctaText}
                        </button>
                    )}
                </div>
            );

        case 'TextSection':
            return (
                <div
                    className={`px-8 py-6 ${block.variant === 'callout' ? 'border-l-[3px]' : ''}`}
                    style={{
                        background: block.variant === 'highlight' ? `${theme.primaryColor}08` : 'transparent',
                        borderLeftColor: block.variant === 'callout' ? theme.primaryColor : undefined,
                    }}
                >
                    {block.props.heading && (
                        <h2
                            className="text-xl font-bold mb-2"
                            style={{ color: theme.textColor }}
                        >
                            {block.props.heading}
                        </h2>
                    )}
                    <p
                        className={`leading-relaxed opacity-85 ${block.variant === 'quote' ? 'italic text-lg border-l-4 pl-4' : ''}`}
                        style={{
                            color: theme.textColor,
                            borderLeftColor: block.variant === 'quote' ? `${theme.primaryColor}40` : undefined,
                        }}
                    >
                        {block.props.body}
                    </p>
                </div>
            );

        case 'Bullets':
            return (
                <div className="px-8 py-6">
                    {block.props.heading && (
                        <h3
                            className="text-lg font-bold mb-3"
                            style={{ color: theme.textColor }}
                        >
                            {block.props.heading}
                        </h3>
                    )}
                    <ul className="space-y-2">
                        {block.props.items.map((item, i) => (
                            <li
                                key={i}
                                className="flex items-start gap-3 group"
                                style={{ color: theme.textColor }}
                            >
                                <span
                                    className="font-bold flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110"
                                    style={{ color: theme.primaryColor }}
                                >
                                    {block.variant === 'checkmark' ? '✓'
                                        : block.variant === 'numbered' ? `${i + 1}.`
                                            : '•'}
                                </span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            );

        case 'Steps':
            return (
                <div className="px-8 py-6">
                    {block.props.heading && (
                        <h3
                            className="text-lg font-bold mb-4"
                            style={{ color: theme.textColor }}
                        >
                            {block.props.heading}
                        </h3>
                    )}
                    <div className={`${block.variant === 'horizontal' ? 'flex gap-6 overflow-x-auto' : 'space-y-4'}`}>
                        {block.props.steps.map((step, i) => (
                            <div
                                key={i}
                                className={`flex gap-4 ${block.variant === 'numbered-card'
                                    ? `p-4 ${radiusClass[theme.borderRadius]} ${shadowClass[theme.shadow]} border`
                                    : ''
                                    }`}
                                style={{
                                    borderColor: block.variant === 'numbered-card' ? `${theme.primaryColor}20` : undefined,
                                }}
                            >
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white"
                                    style={{ backgroundColor: theme.primaryColor }}
                                >
                                    {i + 1}
                                </div>
                                <div>
                                    <div className="font-semibold" style={{ color: theme.textColor }}>{step.title}</div>
                                    <div className="text-sm opacity-70" style={{ color: theme.textColor }}>{step.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );

        case 'Checklist':
            return (
                <div className="px-8 py-6">
                    {block.props.heading && (
                        <h3
                            className="text-lg font-bold mb-3"
                            style={{ color: theme.textColor }}
                        >
                            {block.props.heading}
                        </h3>
                    )}
                    <div className="space-y-2">
                        {block.props.items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-start gap-3 py-1 group hover:bg-black/[0.02] px-2 -mx-2 rounded transition-colors"
                                style={{ color: theme.textColor }}
                            >
                                <span className="mt-0.5 transition-transform group-hover:scale-110" style={{ color: theme.primaryColor }}>☐</span>
                                <div>
                                    <span>{item.label}</span>
                                    {item.isRequired && <span className="text-red-500 ml-1 text-xs font-bold">*</span>}
                                    {item.description && (
                                        <p className="text-sm opacity-60 mt-0.5">{item.description}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );

        case 'Testimonial':
            return (
                <div className="px-8 py-6 space-y-3">
                    {block.props.quotes.map((q, i) => (
                        <div
                            key={i}
                            className={`p-4 ${radiusClass[theme.borderRadius]} border-l-[3px] transition-shadow hover:shadow-md`}
                            style={{
                                background: `${theme.primaryColor}08`,
                                borderLeftColor: theme.primaryColor,
                            }}
                        >
                            <p className="italic mb-2 leading-relaxed" style={{ color: theme.textColor }}>
                                &ldquo;{q.text}&rdquo;
                            </p>
                            <p className="text-sm font-semibold" style={{ color: theme.primaryColor }}>
                                — {q.author}
                            </p>
                        </div>
                    ))}
                </div>
            );

        case 'FAQ':
            return (
                <div className="px-8 py-6">
                    {block.props.heading && (
                        <h3
                            className="text-lg font-bold mb-4"
                            style={{ color: theme.textColor }}
                        >
                            {block.props.heading}
                        </h3>
                    )}
                    <div className="space-y-4 divide-y divide-gray-100">
                        {block.props.items.map((item, i) => (
                            <div key={i} className="pt-4 first:pt-0">
                                <div className="font-semibold mb-1" style={{ color: theme.textColor }}>
                                    {item.question}
                                </div>
                                <div className="text-sm opacity-70 leading-relaxed" style={{ color: theme.textColor }}>
                                    {item.answer}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );

        case 'CTA':
            return (
                <div
                    className={`p-8 text-center ${radiusClass[theme.borderRadius]} my-4 transition-shadow hover:shadow-xl`}
                    style={{
                        background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
                    }}
                >
                    <h3 className="text-xl font-bold text-white mb-2">
                        {block.props.headline}
                    </h3>
                    {block.props.subtext && (
                        <p className="text-white/80 mb-4">{block.props.subtext}</p>
                    )}
                    {block.props.priceText && (
                        <p className="text-white font-extrabold text-2xl mb-4">
                            {block.props.priceText}
                        </p>
                    )}
                    <button
                        className={`
                            bg-white px-8 py-3 font-bold border-none
                            ${radiusClass[theme.borderRadius] || 'rounded-lg'}
                            transition-all duration-200
                            hover:shadow-lg hover:scale-[1.02]
                            active:scale-[0.98]
                        `}
                        style={{ color: theme.primaryColor }}
                    >
                        {block.props.buttonText}
                    </button>
                </div>
            );

        case 'Pricing':
            return (
                <div
                    className={`p-8 text-center border-2 ${radiusClass[theme.borderRadius]} my-4 transition-shadow hover:shadow-lg`}
                    style={{ borderColor: theme.primaryColor }}
                >
                    {block.props.headline && (
                        <h3 className="font-bold mb-2" style={{ color: theme.textColor }}>{block.props.headline}</h3>
                    )}
                    <div className="text-4xl font-extrabold mb-2" style={{ color: theme.primaryColor }}>
                        {block.props.price}
                        {block.props.period && <span className="text-base font-normal opacity-60">/{block.props.period}</span>}
                    </div>
                    <ul className="space-y-1 mb-6">
                        {block.props.features.map((f, i) => (
                            <li key={i} className="py-1" style={{ color: theme.textColor }}>
                                <span style={{ color: theme.primaryColor }}>✓</span> {f}
                            </li>
                        ))}
                    </ul>
                    <button
                        className={`
                            w-full px-8 py-3 text-white font-bold border-none
                            ${radiusClass[theme.borderRadius] || 'rounded-lg'}
                            transition-all duration-200
                            hover:shadow-lg hover:scale-[1.01]
                            active:scale-[0.99]
                        `}
                        style={{ backgroundColor: theme.primaryColor }}
                    >
                        {block.props.buttonText}
                    </button>
                </div>
            );

        case 'Divider':
            return (
                <div className="px-8 py-4">
                    {block.variant === 'space' ? (
                        <div className="h-8" />
                    ) : block.variant === 'dots' ? (
                        <div className="text-center tracking-[0.5rem] opacity-30" style={{ color: theme.textColor }}>• • •</div>
                    ) : (
                        <hr className="border-none h-px" style={{ backgroundColor: `${theme.textColor}20` }} />
                    )}
                </div>
            );

        case 'ModuleHeader':
            return (
                <div
                    className="px-8 py-6 border-b-2"
                    style={{
                        background: `${theme.primaryColor}10`,
                        borderBottomColor: theme.primaryColor,
                    }}
                >
                    <div className="text-xs uppercase font-bold mb-1 tracking-wider" style={{ color: theme.primaryColor }}>
                        Module {block.props.moduleNumber}
                    </div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: theme.textColor }}>
                        {block.props.title}
                    </h2>
                    <p className="text-sm opacity-70" style={{ color: theme.textColor }}>{block.props.description}</p>
                    <span className="text-sm font-medium mt-1 inline-block" style={{ color: theme.primaryColor }}>
                        {block.props.lessonCount} lessons
                    </span>
                </div>
            );

        case 'LessonContent':
            return (
                <div className="px-8 py-6">
                    <h3 className="text-lg font-bold mb-2" style={{ color: theme.textColor }}>
                        {block.props.title}
                    </h3>
                    <p className="leading-relaxed opacity-85 mb-4" style={{ color: theme.textColor }}>
                        {block.props.body}
                    </p>
                    {block.props.steps && block.props.steps.length > 0 && (
                        <div className="space-y-2 pl-2">
                            {block.props.steps.map((s, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="font-bold" style={{ color: theme.primaryColor }}>{i + 1}.</span>
                                    <span style={{ color: theme.textColor }}>{s.title}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );

        case 'DayHeader':
            return (
                <div
                    className="px-8 py-6 border-l-4"
                    style={{
                        background: `${theme.secondaryColor}10`,
                        borderLeftColor: theme.secondaryColor,
                    }}
                >
                    <div className="text-xs uppercase font-bold tracking-wider" style={{ color: theme.secondaryColor }}>
                        Day {block.props.dayNumber}
                    </div>
                    <h2 className="text-lg font-bold mb-1" style={{ color: theme.textColor }}>
                        {block.props.title}
                    </h2>
                    <p className="text-sm opacity-70" style={{ color: theme.textColor }}>{block.props.objective}</p>
                </div>
            );

        case 'DownloadButton':
            return (
                <div className="px-8 py-6 text-center">
                    <button
                        className={`
                            inline-flex items-center gap-2 px-8 py-3 text-white font-semibold border-none
                            ${radiusClass[theme.borderRadius] || 'rounded-lg'}
                            ${shadowClass[theme.shadow] || 'shadow-sm'}
                            transition-all duration-200
                            hover:shadow-lg hover:scale-[1.02]
                            active:scale-[0.98]
                        `}
                        style={{ backgroundColor: theme.primaryColor }}
                    >
                        ⬇ {block.props.label}
                    </button>
                </div>
            );

        case 'Image':
            return (
                <div className={`${block.variant === 'full-width' ? '' : 'px-8 py-6'} text-center`}>
                    <div
                        className={`p-12 ${block.variant === 'rounded' ? 'rounded-2xl' : radiusClass[theme.borderRadius]} opacity-50 transition-opacity hover:opacity-70`}
                        style={{
                            background: `${theme.primaryColor}10`,
                            color: theme.textColor,
                        }}
                    >
                        🖼 {block.props.alt || 'Image placeholder'}
                    </div>
                    {block.props.caption && (
                        <p className="text-xs opacity-50 mt-2" style={{ color: theme.textColor }}>
                            {block.props.caption}
                        </p>
                    )}
                </div>
            );

        default:
            return (
                <div className="px-8 py-4 text-gray-400 italic">
                    Unknown block type: {(block as DSLBlock).type}
                </div>
            );
    }
}
