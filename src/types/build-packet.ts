// src/types/build-packet.ts
// PRD §6.1 — Planner → Builder contract

export type ProductType =
  | 'pdf_guide'
  | 'mini_course'
  | 'challenge_7day'
  | 'checklist_toolkit';

export interface BuildPacket {
  productType: ProductType;

  creator: {
    handle: string;
    displayName: string;
    brandTokens: BrandTokens;
    tone: string; // e.g. "friendly, authoritative, casual"
  };

  userPrompt: string; // original request from creator

  sources: SourceVideo[];

  salesPage: {
    headline: string;
    subhead: string;
    benefits: string[]; // 4-6 bullets
    testimonials: { quote: string; name: string }[]; // can be empty
    faq: { question: string; answer: string }[];
    ctaText: string;
    priceText: string;
    suggestedPriceCents: number;
  };

  content: PDFContent | CourseContent | ChallengeContent | ChecklistContent;

  designIntent: {
    mood: 'minimal' | 'bold' | 'premium' | 'playful' | 'editorial';
    layoutDensity: 'airy' | 'standard' | 'dense';
    imageStyle: 'none' | 'icons' | 'photos' | 'illustrations';
  };

  compliance: {
    disclaimers: string[];
    flaggedClaims: string[];
  };
}

export interface SourceVideo {
  videoId: string;
  title: string | null;
  keyBullets: string[];
  tags: string[];
}

export interface BrandTokens {
  primaryColor: string; // hex
  secondaryColor: string; // hex
  backgroundColor: string;
  textColor: string;
  fontFamily: 'inter' | 'dm-sans' | 'space-grotesk' | 'lora' | 'merriweather';
  mood: string;
}

// --- Product-type-specific content ---

export interface PDFContent {
  type: 'pdf_guide';
  chapters: {
    title: string;
    sections: {
      heading: string;
      body: string;
      bullets?: string[];
      steps?: string[];
      sourceVideoIds: string[];
    }[];
  }[];
}

export interface CourseContent {
  type: 'mini_course';
  modules: {
    title: string;
    description: string;
    lessons: {
      title: string;
      body: string;
      steps?: string[];
      checklist?: string[];
      sourceVideoIds: string[];
    }[];
  }[];
}

export interface ChallengeContent {
  type: 'challenge_7day';
  days: {
    dayNumber: number;
    title: string;
    objective: string;
    tasks: {
      title: string;
      description: string;
      durationMinutes?: number;
      sourceVideoIds: string[];
    }[];
    reflection?: string;
  }[];
}

export interface ChecklistContent {
  type: 'checklist_toolkit';
  categories: {
    title: string;
    description: string;
    items: {
      label: string;
      description?: string;
      isRequired: boolean;
      sourceVideoIds: string[];
    }[];
  }[];
}
