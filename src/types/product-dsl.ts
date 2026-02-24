// src/types/product-dsl.ts
// PRD §6.2 — Builder output → Renderer input

import type { ProductType } from './build-packet';

export interface ThemeTokens {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
    spacing: 'compact' | 'normal' | 'relaxed';
    shadow: 'none' | 'sm' | 'md' | 'lg';
    mood: string;
}

export interface ProductDSL {
    product: {
        title: string;
        type: ProductType;
        version: number;
    };

    themeTokens: ThemeTokens;

    pages: DSLPage[];
}

export interface DSLPage {
    id: string;
    type: 'sales' | 'content' | 'lesson' | 'day' | 'checklist';
    title: string;
    blocks: DSLBlock[];
    accessRule: 'public' | 'email_gated' | 'paid' | 'subscription';
}

export type DSLBlock =
    | HeroBlock
    | TextSectionBlock
    | BulletsBlock
    | StepsBlock
    | ChecklistBlock
    | ImageBlock
    | TestimonialBlock
    | FAQBlock
    | CTABlock
    | PricingBlock
    | DividerBlock
    | ModuleHeaderBlock
    | LessonContentBlock
    | DayHeaderBlock
    | DownloadButtonBlock;

// --- Block definitions ---

export interface BaseBlock {
    id: string; // "blk_a1b2c3d4"
    type: string;
    variant: string;
    styleOverrides?: Partial<{
        backgroundColor: string;
        textColor: string;
        padding: string;
    }>;
}

export interface HeroBlock extends BaseBlock {
    type: 'Hero';
    variant: 'centered' | 'split' | 'editorial' | 'card';
    props: {
        headline: string;
        subhead: string;
        ctaText?: string;
        ctaUrl?: string;
        backgroundImage?: string;
    };
}

export interface TextSectionBlock extends BaseBlock {
    type: 'TextSection';
    variant: 'standard' | 'highlight' | 'quote' | 'callout';
    props: {
        heading?: string;
        body: string;
    };
}

export interface BulletsBlock extends BaseBlock {
    type: 'Bullets';
    variant: 'simple' | 'icon' | 'numbered' | 'checkmark';
    props: {
        heading?: string;
        items: string[];
    };
}

export interface StepsBlock extends BaseBlock {
    type: 'Steps';
    variant: 'vertical' | 'horizontal' | 'numbered-card';
    props: {
        heading?: string;
        steps: { title: string; description: string }[];
    };
}

export interface ChecklistBlock extends BaseBlock {
    type: 'Checklist';
    variant: 'simple' | 'grouped' | 'progress';
    props: {
        heading?: string;
        items: {
            id: string;
            label: string;
            description?: string;
            isRequired: boolean;
        }[];
    };
}

export interface ImageBlock extends BaseBlock {
    type: 'Image';
    variant: 'full-width' | 'contained' | 'rounded' | 'card';
    props: {
        src: string;
        alt: string;
        caption?: string;
    };
}

export interface TestimonialBlock extends BaseBlock {
    type: 'Testimonial';
    variant: 'simple' | 'card' | 'featured';
    props: {
        quotes: { text: string; author: string; avatar?: string }[];
    };
}

export interface FAQBlock extends BaseBlock {
    type: 'FAQ';
    variant: 'accordion' | 'list' | 'card';
    props: {
        heading?: string;
        items: { question: string; answer: string }[];
    };
}

export interface CTABlock extends BaseBlock {
    type: 'CTA';
    variant: 'simple' | 'hero' | 'banner' | 'sticky';
    props: {
        headline: string;
        subtext?: string;
        buttonText: string;
        buttonUrl?: string;
        priceText?: string;
    };
}

export interface PricingBlock extends BaseBlock {
    type: 'Pricing';
    variant: 'simple' | 'card' | 'comparison';
    props: {
        headline?: string;
        price: string;
        period?: string;
        features: string[];
        buttonText: string;
    };
}

export interface DividerBlock extends BaseBlock {
    type: 'Divider';
    variant: 'line' | 'space' | 'dots';
    props: Record<string, never>;
}

export interface ModuleHeaderBlock extends BaseBlock {
    type: 'ModuleHeader';
    variant: 'standard' | 'numbered' | 'icon';
    props: {
        moduleNumber: number;
        title: string;
        description: string;
        lessonCount: number;
    };
}

export interface LessonContentBlock extends BaseBlock {
    type: 'LessonContent';
    variant: 'standard' | 'steps' | 'mixed';
    props: {
        title: string;
        body: string;
        steps?: { title: string; description: string }[];
        checklist?: { id: string; label: string }[];
    };
}

export interface DayHeaderBlock extends BaseBlock {
    type: 'DayHeader';
    variant: 'standard' | 'bold' | 'minimal';
    props: {
        dayNumber: number;
        title: string;
        objective: string;
    };
}

export interface DownloadButtonBlock extends BaseBlock {
    type: 'DownloadButton';
    variant: 'primary' | 'secondary' | 'outline';
    props: {
        label: string;
        fileKey: string; // reference to Supabase storage object
    };
}
