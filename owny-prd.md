# OWNY.STORE — Launch-Ready PRD v1.0
## Creator Product Studio + Paywalled Hub

**Hand this entire document to GPT-5.3-Codex as your implementation spec.**

---

## 0. PRODUCT DEFINITION

**What it is:** A web app that lets social creators turn their existing TikTok video library into sellable digital products (PDF guides, mini-courses, challenges, interactive toolkits) and host them on a paywalled hub the creator places inside Linktree/Stan or uses as their main bio link.

**One-sentence pitch:** "Owny turns your social video library into paid digital products your fans can buy and actually follow — then hosts it all behind one link with real paywalls, progress, and subscriptions."

**Core loop:** Import transcripts → index → request "make product about X" → AI selects relevant videos → generates copy + structure → renders to Product DSL → live preview + click-to-edit → publish → sell via Stripe → buyer login-light access → library + progress.

---

## 1. TECH STACK (LOCKED)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | SSR + API routes + RSC |
| Styling | Tailwind CSS + shadcn/ui | Proven, fast, consistent |
| Database | Supabase (Postgres + RLS + pgvector) | Auth + DB + storage + vectors in one |
| Auth | Supabase Auth (magic link / email OTP) | Passwordless for buyers, email/pass for creators |
| Payments | Stripe (Checkout + Billing + Webhooks) | Industry standard |
| File Storage | Supabase Storage (private bucket) | Signed URLs for PDFs |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) | Cheap, accurate, pgvector-compatible |
| Planner Model | Claude Sonnet 4.5 via Anthropic API | Best reasoning for content selection + copy |
| Builder Model | **Kimi K2.5** via Moonshot API | Visual coding strength, cheap, OpenAI-compatible |
| TikTok Ingestion | **ScrapeCreators API** | Real-time, pay-per-credit, no rate limits |
| Email | Resend | Transactional email, easy Next.js integration |
| Error Tracking | Sentry | Client + server errors |
| Jobs | Inngest (or DB-based job queue) | Retries, observability, serverless-friendly |

---

## 2. SCOPE

### 2.1 In Scope (MVP)

**Creator side:**
- Auth + onboarding (handle, brand DNA)
- TikTok import via ScrapeCreators (primary) + CSV upload + manual paste (fallback)
- Indexing pipeline: clip cards + embeddings + full-text search
- Product Studio: wizard → AI plan → AI build → live preview → click-to-edit → publish
- Product types: PDF Guide, Mini-Course, 7-Day Challenge, Checklist Toolkit
- Hub/catalog page at `/c/[handle]`
- Basic analytics (revenue, purchases, page views)
- Stripe Connect Standard (creator payouts)

**Buyer side:**
- Product sales pages
- Stripe Checkout (one-time + subscription)
- Webhooks → entitlements
- Magic-link login
- Buyer library ("My Purchases")
- PDF viewer + secure download
- Course/challenge consumption + progress tracking

**Ops & launch:**
- Webhook idempotency
- Transactional emails (6 templates)
- Refund workflow
- Rate limiting on AI + import
- Basic admin panel
- Legal pages (ToS, Privacy, Refund, DMCA)
- Sentry + structured logs

### 2.2 Explicitly Out of Scope
- Native mobile apps
- Marketplace/discovery
- Community/forums
- Competitor/trend scraping
- Screenshot → pixel-perfect importer
- Self-updating products from new videos
- Advanced course features (quizzes, certificates, cohorts)

---

## 3. SCRAPECREATORS INTEGRATION (PRIMARY INGESTION)

### 3.1 Endpoints We Use

**Base URL:** `https://api.scrapecreators.com`
**Auth:** Header `x-api-key: {SCRAPECREATORS_API_KEY}`

| Endpoint | Method | Purpose | Credit Cost |
|---|---|---|---|
| `/v1/tiktok/profile?handle={handle}` | GET | Get profile metadata (name, bio, followers, avatar) | 1 |
| `/v3/tiktok/profile/videos?handle={handle}&sort_by=latest&max_cursor={cursor}&trim=true` | GET | List videos paginated (~30 per page) | 1 per page |
| `/v1/tiktok/video/transcript?url={videoUrl}&language=en&use_ai_as_fallback=true` | GET | Get transcript for single video | 1 (10 with AI fallback) |

**Pagination for videos:** Response includes `max_cursor` for next page. Loop until `has_more` is false or desired count reached.

### 3.2 Import Flow (Step by Step)

```
Creator enters TikTok handle
  → Check consent checkbox: "I own/control this account and authorize import"
  → POST /api/import/tiktok { handle, maxVideos: 500 }

Server-side job:
  1. GET /v1/tiktok/profile → store creator profile metadata
  2. Loop GET /v3/tiktok/profile/videos (paginated) → store all video metadata
  3. For each video, enqueue transcript job:
     GET /v1/tiktok/video/transcript → store transcript
  4. For each transcript stored, enqueue clip-card job
  5. For each clip card, enqueue embedding job
```

### 3.3 Import Cost Model (500 videos)

| Step | API Calls | Credits |
|---|---|---|
| Profile | 1 | 1 |
| List videos (500 ÷ ~30/page) | ~17 pages | 17 |
| Transcripts (500 videos, no AI fallback) | 500 | 500 |
| Transcripts (with AI fallback for failures) | ~50 fallbacks | 500 |
| **Total** | | **~518–1,018 credits** |

At ScrapeCreators pricing (~$10 for starter credits), a 500-video import costs roughly **$5–10** in API credits. This is a cost your platform absorbs or passes to the creator.

### 3.4 Provider Adapter Interface

**CRITICAL:** All imports go through an adapter so you can swap ScrapeCreators ↔ Apify ↔ manual without rewriting product logic.

```typescript
// src/lib/import/types.ts

export interface VideoMeta {
  externalVideoId: string;
  url: string;
  title: string | null;
  description: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  duration: number | null; // seconds
  createdAt: string | null; // ISO date
  thumbnailUrl: string | null;
}

export interface ProfileMeta {
  handle: string;
  displayName: string;
  bio: string | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  avatarUrl: string | null;
}

export interface TranscriptResult {
  videoExternalId: string;
  transcriptText: string;
  language: string;
  source: 'caption' | 'ai_fallback';
}

export interface ImportProvider {
  getProfile(handle: string): Promise<ProfileMeta>;
  listVideos(handle: string, options: {
    maxVideos?: number;
    sortBy?: 'latest' | 'popular';
    cursor?: string;
  }): AsyncGenerator<VideoMeta[], void, unknown>;
  getTranscript(videoUrl: string, options: {
    language?: string;
    useAiFallback?: boolean;
  }): Promise<TranscriptResult | null>;
}
```

```typescript
// src/lib/import/scrapecreators.ts
// Implements ImportProvider using ScrapeCreators API
// Key implementation notes:
// - Use `trim=true` on video list calls to reduce payload size
// - Use `use_ai_as_fallback=true` only when standard transcript returns empty
// - Throttle transcript calls: max 5 concurrent, 200ms delay between batches
// - Store raw API responses in jobs.payload for debugging
// - On 4xx/5xx: retry up to 3 times with exponential backoff
```

### 3.5 Fallback Import Methods

| Method | How | When |
|---|---|---|
| CSV Upload | Creator uploads CSV with columns: `title, url, transcript, views, created_at` | ScrapeCreators down or creator prefers |
| Manual Paste | Creator adds one video at a time: paste transcript + optional metadata | Small libraries or missing transcripts |
| YouTube (future) | YouTube Data API v3 (official, OAuth) | Phase 2 expansion |

---

## 4. KIMI K2.5 BUILDER INTEGRATION

### 4.1 API Configuration

```typescript
// src/lib/ai/kimi.ts
import OpenAI from 'openai';

const kimiClient = new OpenAI({
  apiKey: process.env.KIMI_API_KEY,
  baseURL: 'https://api.moonshot.ai/v1',
});

// Builder calls use Instant mode (fast, cheap)
const BUILDER_CONFIG = {
  model: 'kimi-k2.5',
  temperature: 0.6,
  top_p: 0.95,
  max_tokens: 16384,
  extra_body: { thinking: { type: 'disabled' } },
} as const;

// For complex layout decisions, use Thinking mode
const BUILDER_THINKING_CONFIG = {
  model: 'kimi-k2.5',
  temperature: 1.0,
  top_p: 0.95,
  max_tokens: 16384,
  // thinking enabled by default (no extra_body needed)
} as const;
```

### 4.2 Kimi's Role (Strictly Defined)

Kimi does ONE thing: **Convert a Build Packet into a Product DSL JSON.**

Kimi does NOT:
- Read raw transcripts
- Select which videos to use
- Write sales copy (that's the Planner's job)
- Make content decisions
- Generate arbitrary code

### 4.3 Kimi System Prompt

```
You are a Product DSL Builder. Your ONLY job is to convert a Build Packet JSON
into a Product DSL JSON that conforms exactly to the provided schema.

RULES:
1. Output ONLY valid JSON. No commentary, no markdown, no explanation.
2. Every block must have a valid `type` from the allowed set.
3. Every block must have a unique `id` (format: "blk_" + 8 random alphanumeric chars).
4. Use the provided `themeTokens` for all styling decisions.
5. Use the provided `salesCopy` and `content` verbatim — do not rewrite or invent content.
6. Choose appropriate block `variant` values to create visual variety.
7. Structure the sales page for maximum conversion: Hero → Problem → Solution → Benefits → Social Proof → FAQ → CTA.
8. For courses/challenges, create clear module/day structure with progress-trackable sections.
9. If the Build Packet specifies a `mood`, select variants that match (e.g., "premium" = more whitespace, larger type; "bold" = high contrast, dense).

ALLOWED BLOCK TYPES: Hero, TextSection, Bullets, Steps, Checklist, Image, Testimonial, FAQ, CTA, Pricing, Divider, ModuleHeader, LessonContent, DayHeader, DownloadButton

OUTPUT: A single JSON object conforming to ProductDSL schema. Nothing else.
```

### 4.4 Kimi Cost Per Product Generation

| Component | Tokens | Cost |
|---|---|---|
| System prompt + Build Packet (input) | ~3,000–5,000 | $0.002–0.003 |
| Product DSL output | ~4,000–8,000 | $0.010–0.024 |
| **Total per generation** | | **~$0.012–0.027** |

With schema validation retry (1 retry): ~$0.025–0.054 worst case.

### 4.5 Model Router (Adapter Pattern)

```typescript
// src/lib/ai/router.ts

export interface AIModelAdapter {
  generateDSL(buildPacket: BuildPacket): Promise<ProductDSL>;
  improveBlock(block: DSLBlock, instruction: string, context: ProductContext): Promise<DSLBlock>;
}

// Primary: Kimi K2.5
export class KimiBuilder implements AIModelAdapter { ... }

// Fallback: Claude Sonnet 4.5 (if Kimi fails schema validation twice)
export class ClaudeBuilder implements AIModelAdapter { ... }

export function getBuilder(): AIModelAdapter {
  return new KimiBuilder(); // swap here if needed
}
```

---

## 5. AI PIPELINE (RETRIEVE → COMPRESS → BUILD)

### 5.1 Overview

```
User Request: "Make an ebook about my morning routine"
    ↓
[STEP 1] Clip Card Generation (offline, on import)
    ↓
[STEP 2] Hybrid Retrieval (online, per request)
    ↓
[STEP 3] Rerank + Select (online, per request)
    ↓
[STEP 4] Planner: Source Pack + Copy + Outline (Claude Sonnet 4.5)
    ↓
[STEP 5] Builder: Product DSL (Kimi K2.5)
    ↓
[STEP 6] Render Preview (deterministic, no AI)
```

### 5.2 Step 1: Clip Card Generation (Offline)

**Model:** Claude Sonnet 4.5 (or Claude Haiku 4.5 for cost savings)
**When:** Enqueued after each transcript is stored
**Cost:** ~$0.003 per card (Haiku) or ~$0.015 per card (Sonnet)

**System Prompt:**
```
You are a Content Indexer. Given a video transcript and metadata, produce a structured
Clip Card as JSON. This card will be used for search and retrieval — make it precise.

OUTPUT FORMAT (JSON only):
{
  "topicTags": ["morning routine", "skincare", "productivity"],
  "title": "Best inferred title for this video",
  "keySteps": ["Step 1 description", "Step 2 description"],
  "whoItsFor": "People who want to optimize their morning",
  "outcome": "A structured morning that saves 30 minutes",
  "warnings": ["Consult doctor before starting supplement stack"],
  "bestHook": "The first sentence/hook from the transcript",
  "contentType": "tutorial" | "story" | "review" | "tips" | "routine" | "other",
  "estimatedDuration": "30-45 seconds"
}
```

**Input:** `{ transcript: string, metadata: { title, views, likes, duration, createdAt } }`

### 5.3 Step 2: Hybrid Retrieval

**Vector Search (pgvector):**
```sql
SELECT v.id, v.title, cc.card_json,
  1 - (cc.embedding <=> $queryEmbedding) AS similarity
FROM clip_cards cc
JOIN videos v ON v.id = cc.video_id
WHERE v.creator_id = $creatorId
ORDER BY similarity DESC
LIMIT 80;
```

**Full-Text Search (Postgres tsvector):**
```sql
SELECT v.id, v.title, cc.card_json,
  ts_rank(tc.fts, plainto_tsquery('english', $query)) AS rank
FROM transcript_chunks tc
JOIN videos v ON v.id = tc.video_id
JOIN clip_cards cc ON cc.video_id = v.id
WHERE v.creator_id = $creatorId
  AND tc.fts @@ plainto_tsquery('english', $query)
ORDER BY rank DESC
LIMIT 80;
```

**Metadata Boost:** After merge + dedupe, boost scores for:
- Higher view count (normalized to creator's avg)
- More recent videos (decay factor)
- Videos tagged with matching `contentType`

**Output:** Top 100–200 candidate video IDs with scores.

### 5.4 Step 3: Rerank + Select

**Model:** Claude Sonnet 4.5 (single call)
**Input:** Top 60 Clip Cards (compressed) + user request
**Output:** Ranked top 20 with reasons

**System Prompt:**
```
You are a Content Curator. Given a product request and a list of video clip cards,
select the 15-25 most relevant videos and rank them by relevance.

RULES:
1. Ensure COVERAGE: selected videos should cover all subtopics needed for the product.
2. Ensure DIVERSITY: avoid selecting 5 videos that all say the same thing.
3. If fewer than 8 videos are relevant, say so — the creator may need to film more content.
4. For each selected video, provide a 1-sentence reason for inclusion.

OUTPUT (JSON only):
{
  "selectedVideos": [
    { "videoId": "uuid", "reason": "Covers morning hydration protocol", "relevanceScore": 0.95 }
  ],
  "coverageGaps": ["No content about morning meditation found"],
  "confidence": "high" | "medium" | "low"
}
```

### 5.5 Step 4: Planner (Source Pack + Copy + Outline)

**Model:** Claude Sonnet 4.5
**Input:** User request + selected Clip Cards + creator brand DNA
**Output:** Build Packet JSON

**System Prompt:**
```
You are a Digital Product Strategist for social media creators. Given a product request,
selected source videos, and brand DNA, produce a complete Build Packet.

RULES:
1. All content must be based ONLY on the provided clip cards and transcripts. Do not invent claims.
2. Write in the creator's voice/tone as specified in brand DNA.
3. Generate a compelling offer: headline, subhead, 5 benefit bullets, 3 FAQ items, CTA text.
4. Structure content appropriately for the product type:
   - pdf_guide: chapters with sections
   - mini_course: modules with lessons
   - challenge_7day: 7 days with daily tasks
   - checklist_toolkit: categories with actionable items
5. Include compliance disclaimers relevant to the content niche.
6. Suggest a price point based on content depth and niche standards.
7. Every content section must include `sourceVideoIds` for attribution.

OUTPUT: Valid JSON conforming to the BuildPacket schema below.
```

### 5.6 Step 5: Builder (Kimi K2.5)

See Section 4 above. Kimi receives the Build Packet and outputs Product DSL.

### 5.7 Cost Per Full Product Generation

| Step | Model | Est. Cost |
|---|---|---|
| Retrieval (vector + FTS) | pgvector + Postgres | ~$0 (DB queries) |
| Embedding the query | OpenAI text-embedding-3-small | $0.00002 |
| Rerank (60 clip cards) | Claude Sonnet 4.5 | ~$0.02–0.04 |
| Planner (Build Packet) | Claude Sonnet 4.5 | ~$0.05–0.10 |
| Builder (Product DSL) | Kimi K2.5 | ~$0.015–0.03 |
| **Total per product** | | **~$0.09–0.17** |

---

## 6. TYPE DEFINITIONS (TYPESCRIPT)

### 6.1 Build Packet (Planner → Builder contract)

```typescript
// src/types/build-packet.ts

export type ProductType = 'pdf_guide' | 'mini_course' | 'challenge_7day' | 'checklist_toolkit';

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
  primaryColor: string;   // hex
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
```

### 6.2 Product DSL (Builder output → Renderer input)

```typescript
// src/types/product-dsl.ts

export interface ProductDSL {
  product: {
    title: string;
    type: ProductType;
    version: number;
  };

  themeTokens: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
    spacing: 'compact' | 'normal' | 'relaxed';
    shadow: 'none' | 'sm' | 'md' | 'lg';
    mood: string;
  };

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
    items: { id: string; label: string; description?: string; isRequired: boolean }[];
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
  props: {};
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
```

### 6.3 Clip Card

```typescript
// src/types/clip-card.ts

export interface ClipCard {
  topicTags: string[];
  title: string;
  keySteps: string[];
  whoItsFor: string;
  outcome: string;
  warnings: string[];
  bestHook: string;
  contentType: 'tutorial' | 'story' | 'review' | 'tips' | 'routine' | 'other';
  estimatedDuration: string;
}
```

---

## 7. DATABASE SCHEMA

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- IDENTITY
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('creator', 'buyer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE creators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  brand_tokens JSONB NOT NULL DEFAULT '{}',
  featured_product_id UUID, -- FK added after products table
  stripe_connect_account_id TEXT,
  stripe_connect_status TEXT DEFAULT 'unconnected'
    CHECK (stripe_connect_status IN ('unconnected', 'pending', 'connected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_creators_profile ON creators(profile_id);

-- ============================================
-- VIDEO LIBRARY
-- ============================================

CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'scrapecreators'
    CHECK (source IN ('scrapecreators', 'csv', 'manual', 'youtube')),
  external_video_id TEXT,
  url TEXT,
  title TEXT,
  description TEXT,
  views INTEGER,
  likes INTEGER,
  comments_count INTEGER,
  shares INTEGER,
  duration INTEGER, -- seconds
  thumbnail_url TEXT,
  created_at_source TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_videos_creator ON videos(creator_id);
CREATE UNIQUE INDEX idx_videos_external ON videos(creator_id, external_video_id)
  WHERE external_video_id IS NOT NULL;

CREATE TABLE video_transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  source TEXT DEFAULT 'caption' CHECK (source IN ('caption', 'ai_fallback', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_transcripts_video ON video_transcripts(video_id);

CREATE TABLE transcript_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(1536), -- text-embedding-3-small
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_video ON transcript_chunks(video_id);
CREATE INDEX idx_chunks_embedding ON transcript_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_fts ON transcript_chunks USING gin(fts);

CREATE TABLE clip_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  card_json JSONB NOT NULL, -- ClipCard type
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_clipcards_video ON clip_cards(video_id);
CREATE INDEX idx_clipcards_embedding ON clip_cards
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- PRODUCTS
-- ============================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  active_version_id UUID, -- FK added after product_versions table
  access_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (access_type IN ('public', 'email_gated', 'paid', 'subscription')),
  price_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  stripe_price_id TEXT, -- Stripe Price object for subscriptions
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_creator ON products(creator_id);
CREATE INDEX idx_products_slug ON products(slug);

CREATE TABLE product_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  build_packet JSONB NOT NULL,
  dsl_json JSONB NOT NULL,
  source_video_ids UUID[] DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_versions_product ON product_versions(product_id);

ALTER TABLE products ADD CONSTRAINT fk_active_version
  FOREIGN KEY (active_version_id) REFERENCES product_versions(id);
ALTER TABLE creators ADD CONSTRAINT fk_featured_product
  FOREIGN KEY (featured_product_id) REFERENCES products(id);

-- ============================================
-- ORDERS & ENTITLEMENTS
-- ============================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_profile_id UUID NOT NULL REFERENCES profiles(id),
  product_id UUID NOT NULL REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_buyer ON orders(buyer_profile_id);
CREATE INDEX idx_orders_product ON orders(product_id);
CREATE INDEX idx_orders_stripe ON orders(stripe_checkout_session_id);

CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_profile_id UUID NOT NULL REFERENCES profiles(id),
  product_id UUID NOT NULL REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_via TEXT DEFAULT 'purchase' CHECK (granted_via IN ('purchase', 'admin', 'promo')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_entitlements_unique ON entitlements(buyer_profile_id, product_id);

-- ============================================
-- PROGRESS
-- ============================================

CREATE TABLE course_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_profile_id UUID NOT NULL REFERENCES profiles(id),
  product_id UUID NOT NULL REFERENCES products(id),
  progress_data JSONB NOT NULL DEFAULT '{}',
  -- progress_data shape: { completedBlockIds: string[], lastAccessedAt: string, percentComplete: number }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_progress_unique ON course_progress(buyer_profile_id, product_id);

-- ============================================
-- STRIPE WEBHOOK IDEMPOTENCY
-- ============================================

CREATE TABLE stripe_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- JOBS
-- ============================================

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN (
    'tiktok_import', 'transcript_fetch', 'clip_card_gen',
    'embedding_gen', 'csv_parse', 'product_build'
  )),
  creator_id UUID REFERENCES creators(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_status ON jobs(status, type);
CREATE INDEX idx_jobs_creator ON jobs(creator_id);

-- ============================================
-- ANALYTICS (minimal)
-- ============================================

CREATE TABLE page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path TEXT NOT NULL,
  creator_id UUID REFERENCES creators(id),
  product_id UUID REFERENCES products(id),
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pageviews_product ON page_views(product_id, created_at);

-- ============================================
-- ADMIN & MODERATION
-- ============================================

CREATE TABLE takedowns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'lifted')),
  admin_profile_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. API ROUTES

### 8.1 Auth & Profile
Handled by Supabase Auth. App creates `profiles` row on first auth via database trigger or middleware.

### 8.2 Creator APIs

| Route | Method | Description |
|---|---|---|
| `/api/creators/onboard` | POST | Create creator record (handle, brand tokens) |
| `/api/creators/me` | GET | Get current creator profile |
| `/api/creators/me` | PATCH | Update brand tokens, bio, featured product |

### 8.3 Import APIs

| Route | Method | Description |
|---|---|---|
| `/api/import/tiktok` | POST | Start TikTok import job `{ handle, maxVideos, consent: true }` |
| `/api/import/csv` | POST | Upload CSV file |
| `/api/import/manual` | POST | Add single video `{ title?, url?, transcript, views? }` |
| `/api/import/status` | GET | Get import job status for current creator |

### 8.4 AI APIs

| Route | Method | Description |
|---|---|---|
| `/api/ai/plan-product` | POST | Retrieve → Rerank → Build Packet. Body: `{ productType, prompt, audience, tone, mood }` |
| `/api/ai/build-product` | POST | Build Packet → Product DSL (Kimi). Body: `{ buildPacket }` |
| `/api/ai/improve-block` | POST | Improve single block. Body: `{ block, instruction, context }` |

### 8.5 Product APIs

| Route | Method | Description |
|---|---|---|
| `/api/products` | POST | Create product + initial draft version |
| `/api/products` | GET | List creator's products |
| `/api/products/[id]` | GET | Get product details |
| `/api/products/[id]` | PATCH | Update metadata (title, price, access_type) |
| `/api/products/[id]/versions` | POST | Save new version (DSL + build packet) |
| `/api/products/[id]/publish` | POST | Set active version, status=published |
| `/api/products/[id]/rollback` | POST | Revert to previous version |

### 8.6 Payment APIs

| Route | Method | Description |
|---|---|---|
| `/api/stripe/connect/onboard` | POST | Create Stripe Connect account link |
| `/api/stripe/connect/status` | GET | Check Connect account status |
| `/api/stripe/checkout` | POST | Create Checkout Session `{ productId }` |
| `/api/stripe/webhook` | POST | Handle Stripe webhook events (idempotent) |

### 8.7 Buyer APIs

| Route | Method | Description |
|---|---|---|
| `/api/library` | GET | List buyer's entitled products |
| `/api/progress` | GET | Get progress for a product |
| `/api/progress` | POST | Update progress `{ productId, completedBlockIds }` |
| `/api/content/[productSlug]/download` | GET | Generate signed URL for PDF download |

### 8.8 Admin APIs

| Route | Method | Description |
|---|---|---|
| `/api/admin/creators` | GET | List all creators |
| `/api/admin/takedown` | POST | Takedown a product `{ productId, reason }` |
| `/api/admin/takedown/lift` | POST | Lift takedown |
| `/api/admin/refund` | POST | Trigger Stripe refund + revoke entitlement |

---

## 9. STRIPE IMPLEMENTATION

### 9.1 Connect Standard Flow

```
Creator clicks "Connect Stripe" → POST /api/stripe/connect/onboard
  → Server creates Stripe Connect account (type: standard)
  → Returns account link URL
  → Creator completes Stripe onboarding
  → Stripe sends account.updated webhook
  → Server updates creator.stripe_connect_status = 'connected'
```

### 9.2 Checkout Flow

```
Buyer clicks "Buy" → POST /api/stripe/checkout { productId }
  → Server verifies: product exists, published, creator connected
  → Creates Stripe Checkout Session:
      - payment_intent_data.application_fee_amount = price * 0.10 (10% platform fee)
      - stripe_account = creator's connected account ID
      - success_url = /checkout-success?session_id={CHECKOUT_SESSION_ID}
      - cancel_url = /p/{slug}
  → Returns checkout URL
  → Buyer completes payment on Stripe-hosted page
```

### 9.3 Webhook Handler (MUST be idempotent)

```typescript
// src/app/api/stripe/webhook/route.ts

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);

  // 1. Check idempotency
  const existing = await db.stripeEvents.findByEventId(event.id);
  if (existing?.processing_status === 'processed') return Response.json({ ok: true });

  // 2. Store event
  await db.stripeEvents.upsert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event,
    processing_status: 'received',
  });

  // 3. Process
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;
      case 'account.updated':
        await handleConnectAccountUpdate(event.data.object);
        break;
    }
    await db.stripeEvents.markProcessed(event.id);
  } catch (err) {
    await db.stripeEvents.markFailed(event.id, err.message);
    // Sentry.captureException(err);
    throw err; // Return 500 so Stripe retries
  }

  return Response.json({ ok: true });
}

async function handleCheckoutCompleted(session) {
  // Create order
  const order = await db.orders.create({
    buyer_profile_id: /* resolve from session.customer_email */,
    product_id: session.metadata.product_id,
    status: 'paid',
    amount_cents: session.amount_total,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent,
  });

  // Grant entitlement
  await db.entitlements.upsert({
    buyer_profile_id: order.buyer_profile_id,
    product_id: order.product_id,
    status: 'active',
    granted_via: 'purchase',
  });

  // Send "Access your purchase" email
  await sendAccessEmail(order.buyer_profile_id, order.product_id);
}

async function handleRefund(charge) {
  // Find order by payment intent
  const order = await db.orders.findByPaymentIntent(charge.payment_intent);
  if (!order) return;

  await db.orders.update(order.id, { status: 'refunded', refunded_at: new Date() });
  await db.entitlements.revoke(order.buyer_profile_id, order.product_id);
}
```

---

## 10. TRANSACTIONAL EMAILS

| Event | Template | Recipient |
|---|---|---|
| Purchase completed | "Access Your Purchase" with deep link to `/library` | Buyer |
| Magic link login | "Your login link" | Buyer |
| Import completed | "Your library is ready! {count} videos imported" | Creator |
| Import failed | "Import issue — {error}. Retry or upload CSV" | Creator |
| Product published | "Your product is live! Share: {hubUrl}" | Creator |
| Refund processed | "Your refund for {productTitle} has been processed" | Buyer |

**Provider:** Resend (Next.js SDK, react-email templates)

---

## 11. SECURITY & RATE LIMITING

### 11.1 RLS Policies (Supabase)

```sql
-- Creators can only access their own data
CREATE POLICY creators_own ON creators
  FOR ALL USING (profile_id = auth.uid());

CREATE POLICY videos_own ON videos
  FOR ALL USING (creator_id IN (SELECT id FROM creators WHERE profile_id = auth.uid()));

-- Buyers can only see their entitlements
CREATE POLICY entitlements_own ON entitlements
  FOR ALL USING (buyer_profile_id = auth.uid());

-- Products: public for published, owner for drafts
CREATE POLICY products_public ON products
  FOR SELECT USING (status = 'published');
CREATE POLICY products_own ON products
  FOR ALL USING (creator_id IN (SELECT id FROM creators WHERE profile_id = auth.uid()));
```

### 11.2 Rate Limits

| Endpoint | Limit |
|---|---|
| `/api/ai/*` | 20 requests/hour per creator |
| `/api/import/tiktok` | 3 imports/day per creator |
| `/api/stripe/checkout` | 30/hour per IP |
| Auth endpoints | Supabase defaults + 10/min per IP |

### 11.3 Content Security

- PDFs served via Supabase signed URLs (expire in 5 minutes)
- No permanent public file URLs
- All gating enforced server-side (middleware + RLS)
- Rich text sanitized (no HTML injection in DSL content)
- `DownloadButton.fileKey` validated against entitlements before generating signed URL

---

## 12. UX SCREENS

### Creator Screens

| Route | Screen | Key Elements |
|---|---|---|
| `/sign-in` | Auth | Email + password / magic link |
| `/onboard` | Onboarding | Handle, display name, avatar, brand colors, font, tone |
| `/dashboard` | Dashboard | Revenue chart, recent purchases, products list, import status |
| `/import` | Import Hub | TikTok handle input + consent checkbox + progress bar; CSV upload; manual add |
| `/products/new` | Product Wizard | Step 1: Type. Step 2: Prompt + audience + tone. Step 3: Review AI plan. Step 4: Build + preview |
| `/products/[id]/edit` | Builder | Left: outline tree. Center: live preview. Right: block editor + "AI Improve" |
| `/products/[id]/settings` | Settings | Price, access type, slug, publish/unpublish, rollback |
| `/connect-stripe` | Stripe Connect | Status indicator + connect/reconnect button |
| `/analytics` | Analytics | Revenue, purchases, top products, page views |

### Buyer Screens

| Route | Screen |
|---|---|
| `/c/[handle]` | Creator Hub (public catalog) |
| `/p/[slug]` | Product sales page |
| `/checkout-success` | "Access your purchase" + CTA to library |
| `/library` | My Purchases (grid of owned products) |
| `/content/[slug]` | Content viewer (PDF / course / challenge / checklist) |
| `/account` | Email, manage subscriptions, logout |

### Admin Screens

| Route | Screen |
|---|---|
| `/admin/creators` | Creator list with takedown/ban actions |
| `/admin/products` | Product list with takedown toggle |
| `/admin/jobs` | Job queue status (queued/running/failed counts) |

---

## 13. SEED DSL EXAMPLES

### 13.1 PDF Guide (Sales Page)

```json
{
  "product": { "title": "The 5AM Morning Protocol", "type": "pdf_guide", "version": 1 },
  "themeTokens": {
    "primaryColor": "#2563EB",
    "secondaryColor": "#DBEAFE",
    "backgroundColor": "#FFFFFF",
    "textColor": "#1F2937",
    "fontFamily": "inter",
    "borderRadius": "lg",
    "spacing": "relaxed",
    "shadow": "md",
    "mood": "premium"
  },
  "pages": [
    {
      "id": "pg_sales001",
      "type": "sales",
      "title": "Sales Page",
      "accessRule": "public",
      "blocks": [
        {
          "id": "blk_hero0001",
          "type": "Hero",
          "variant": "centered",
          "props": {
            "headline": "The 5AM Morning Protocol",
            "subhead": "The exact step-by-step system I use every morning — compiled from 47 of my most-watched videos into one actionable guide."
          }
        },
        {
          "id": "blk_bull0001",
          "type": "Bullets",
          "variant": "checkmark",
          "props": {
            "heading": "What You'll Get",
            "items": [
              "Complete morning sequence from wake-up to work (45 min)",
              "Hydration + supplement protocol with exact timing",
              "5-minute mobility routine (no equipment needed)",
              "Journaling prompts that actually stick",
              "Printable daily checklist"
            ]
          }
        },
        {
          "id": "blk_faq0001",
          "type": "FAQ",
          "variant": "accordion",
          "props": {
            "heading": "Common Questions",
            "items": [
              { "question": "Is this just a summary of your videos?", "answer": "No. It's a structured, step-by-step protocol organized in the order you should follow each morning. The videos gave you pieces — this gives you the complete system." },
              { "question": "What if I don't wake up at 5AM?", "answer": "The protocol works at any wake-up time. The sequence and timing between steps matters more than the exact hour." }
            ]
          }
        },
        {
          "id": "blk_cta0001",
          "type": "CTA",
          "variant": "hero",
          "props": {
            "headline": "Start Tomorrow Morning",
            "subtext": "One-time purchase. Instant access. Keep forever.",
            "buttonText": "Get the Protocol — $29",
            "priceText": "$29"
          }
        }
      ]
    },
    {
      "id": "pg_ch1",
      "type": "content",
      "title": "Chapter 1: The First 10 Minutes",
      "accessRule": "paid",
      "blocks": [
        {
          "id": "blk_text0001",
          "type": "TextSection",
          "variant": "standard",
          "props": {
            "heading": "Why the First 10 Minutes Matter",
            "body": "Your cortisol peaks within 30 minutes of waking. What you do in this window sets your energy, focus, and mood for the entire day."
          }
        },
        {
          "id": "blk_step0001",
          "type": "Steps",
          "variant": "numbered-card",
          "props": {
            "heading": "The Wake-Up Sequence",
            "steps": [
              { "title": "Feet on floor", "description": "No snooze. Place feet on ground within 3 seconds of alarm." },
              { "title": "16oz room-temp water", "description": "Pre-filled glass on nightstand. Add pinch of sea salt + squeeze of lemon." },
              { "title": "2 minutes of light", "description": "Open blinds or step outside. Direct light exposure starts your circadian clock." }
            ]
          }
        }
      ]
    }
  ]
}
```

---

## 14. ACCEPTANCE CRITERIA

### Payments & Entitlements
- [ ] Webhook is idempotent: replay same event 10× → only one order/entitlement created
- [ ] Refund event revokes entitlement within 60s
- [ ] Checkout blocked for creators without connected Stripe account
- [ ] Platform fee (10%) deducted correctly on each checkout

### Import
- [ ] TikTok import of 50 videos completes with transcripts stored
- [ ] Failed transcript fetches retry up to 3× then mark as failed
- [ ] Creator sees real-time import progress (X/Y videos, status)
- [ ] CSV import with 100 rows succeeds; clip cards generated

### AI Pipeline
- [ ] Retrieval returns relevant candidates for "morning routine" against a 100-video library
- [ ] Build Packet JSON validates against TypeScript schema
- [ ] Product DSL JSON validates against TypeScript schema
- [ ] If Kimi returns invalid DSL, retry once with error feedback; on second failure, return actionable error
- [ ] Generated product references source video IDs

### Builder UX
- [ ] Clicking a block in preview selects it in the editor
- [ ] Editing block props immediately updates preview
- [ ] "AI Improve this block" updates block text without breaking schema
- [ ] Product version saved as draft; publish creates new active version

### Security
- [ ] Paid content inaccessible without entitlement (server-enforced)
- [ ] PDF signed URLs expire after 5 minutes
- [ ] Rate limiting blocks >20 AI requests/hour per creator
- [ ] RLS prevents cross-creator data access

### Buyer Experience
- [ ] Buyer receives "Access your purchase" email within 30s of payment
- [ ] Magic link login works; session persists
- [ ] Course progress saves and restores across sessions
- [ ] Library shows all owned products with correct status

---

## 15. MILESTONES (GRANULAR)

### M0: Scaffold (Day 1)
- [ ] Next.js 15 app with App Router
- [ ] Tailwind + shadcn/ui setup
- [ ] Supabase project connected (Auth + DB + Storage)
- [ ] Environment variables configured
- [ ] Sentry initialized
- [ ] TypeScript strict mode
- [ ] All type definitions from Section 6 created

### M1: Auth + Roles (Days 2-3)
- [ ] Supabase Auth: email/password + magic link
- [ ] `profiles` table auto-created on signup (DB trigger)
- [ ] Creator onboarding flow: `/onboard` → creates `creators` row
- [ ] Middleware: route protection (creator routes, buyer routes, admin routes)
- [ ] Role-based redirects

### M2: Database + Migrations (Day 3)
- [ ] All tables from Section 7 created via Supabase migrations
- [ ] RLS policies applied
- [ ] pgvector extension enabled
- [ ] Indexes created
- [ ] Seed data script (1 test creator, 10 test videos with transcripts)

### M3: Import Pipeline (Days 4-6)
- [ ] ScrapeCreators adapter implementing `ImportProvider` interface
- [ ] CSV upload adapter
- [ ] Manual paste adapter
- [ ] `/api/import/tiktok` endpoint + job creation
- [ ] Job queue with status tracking (queued → running → succeeded/failed)
- [ ] Import progress UI at `/import`
- [ ] Consent checkbox
- [ ] Partial import handling (store what succeeded)

### M4: Indexing Pipeline (Days 6-8)
- [ ] Transcript chunking (250 tokens, 50 overlap)
- [ ] Clip card generation job (using Claude Haiku 4.5 for cost)
- [ ] Embedding generation job (OpenAI text-embedding-3-small)
- [ ] Full-text search index (tsvector auto-generated)
- [ ] Verify: search returns relevant results for test queries

### M5: Product CRUD + Hub Skeleton (Days 8-10)
- [ ] `products` + `product_versions` CRUD
- [ ] Product wizard UI: type selection → prompt input → review
- [ ] Creator hub page `/c/[handle]` rendering from DB
- [ ] Product sales page `/p/[slug]` rendering a seed DSL
- [ ] Featured product on hub
- [ ] Product status management (draft/published/archived)

### M6: Stripe Connect + Checkout (Days 10-13)
- [ ] Stripe Connect Standard: onboarding flow
- [ ] Connect status tracking + UI
- [ ] Checkout Session creation with application fee
- [ ] Webhook handler with idempotency (`stripe_events` table)
- [ ] `handleCheckoutCompleted` → order + entitlement
- [ ] `handleRefund` → revoke entitlement
- [ ] `/checkout-success` page
- [ ] Buyer account creation on first purchase

### M7: Buyer Library + Content Delivery (Days 13-16)
- [ ] Magic link / email OTP login for buyers
- [ ] `/library` page showing entitled products
- [ ] Entitlement checking middleware
- [ ] PDF viewer component + signed URL download
- [ ] Course/challenge content pages with progress tracking
- [ ] Checklist with interactive state (saved per user)
- [ ] Progress persistence (DB writes on completion)

### M8: AI Plan Endpoint (Days 16-19)
- [ ] Hybrid retrieval: vector search + FTS + metadata boost
- [ ] Merge + dedupe candidates
- [ ] Rerank via Claude Sonnet 4.5 (single call)
- [ ] Build Packet generation via Claude Sonnet 4.5
- [ ] JSON schema validation on Build Packet output
- [ ] `/api/ai/plan-product` endpoint
- [ ] Error handling: low-confidence results → prompt creator to add more content

### M9: AI Build Endpoint + Kimi Integration (Days 19-22)
- [ ] Kimi K2.5 client (OpenAI SDK, Moonshot base URL)
- [ ] System prompt from Section 4.3
- [ ] `/api/ai/build-product` endpoint
- [ ] JSON schema validation on Product DSL output
- [ ] Retry logic: if invalid, send error back to Kimi for one retry
- [ ] Fallback: if Kimi fails twice, return error to creator with "manual edit" option
- [ ] `/api/ai/improve-block` endpoint (Kimi Instant mode)

### M10: Vibe Builder UI (Days 22-27)
- [ ] Three-panel layout: outline tree | live preview | block editor
- [ ] DSL → React renderer (all block types from Section 6.2)
- [ ] Click-to-select: clicking rendered block highlights in outline + opens editor
- [ ] Block property form (per block type)
- [ ] "AI Improve" text input per block → calls `/api/ai/improve-block`
- [ ] Add/remove/reorder blocks
- [ ] Theme token editor (colors, font, mood, spacing)
- [ ] Version save (draft)
- [ ] Publish button → sets active version

### M11: Transactional Emails (Days 27-28)
- [ ] Resend integration
- [ ] 6 email templates (react-email)
- [ ] Email triggers wired to events (purchase, import, publish, refund, login)
- [ ] Branded from-domain (SPF/DKIM)

### M12: Admin + Rate Limiting + Legal (Days 28-30)
- [ ] Admin routes (creators list, products list, takedown, job queue)
- [ ] Rate limiting middleware (per-IP + per-user)
- [ ] Legal pages: ToS, Privacy Policy, Refund Policy, DMCA
- [ ] Footer links on all public pages
- [ ] Takedown enforcement (product page returns "Unavailable")

### M13: Analytics + Polish (Days 30-32)
- [ ] Page view tracking (server-side, `page_views` table)
- [ ] Creator dashboard: revenue total, purchase count, top products, page views
- [ ] Error tracking verified (Sentry captures webhook failures, AI errors)
- [ ] Structured logging for: webhook processing, job processing, AI calls (cost + latency)
- [ ] Mobile-responsive check on all screens
- [ ] Deploy to Vercel (or your preferred platform)

---

## 16. ENVIRONMENT VARIABLES

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# AI Models
ANTHROPIC_API_KEY=          # Claude Sonnet 4.5 (Planner + Clip Cards)
KIMI_API_KEY=               # Moonshot/Kimi K2.5 (Builder)
KIMI_BASE_URL=https://api.moonshot.ai/v1
OPENAI_API_KEY=             # text-embedding-3-small (embeddings only)

# ScrapeCreators
SCRAPECREATORS_API_KEY=

# Email
RESEND_API_KEY=
EMAIL_FROM=hello@owny.store

# Sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# App
NEXT_PUBLIC_APP_URL=https://owny.store
PLATFORM_FEE_PERCENT=10
```

---

## 17. CODEX BUILD RULES

Paste these as instructions when handing this PRD to Codex:

```
You are building Owny.store MVP v1.0. Follow this PRD exactly.

RULES:
1. Build EXACTLY what's in scope. No marketplace, no community, no mobile app.
2. Use the TypeScript interfaces from Section 6 as source of truth for all JSON contracts.
3. All AI outputs MUST pass JSON schema validation before being stored or rendered.
4. Implement webhook idempotency using the stripe_events table. Every webhook handler checks for duplicate event IDs first.
5. Implement the ImportProvider adapter interface. ScrapeCreators is the primary implementation; do not hardcode ScrapeCreators calls outside the adapter.
6. Kimi K2.5 is the primary builder model, accessed via OpenAI SDK pointed at api.moonshot.ai/v1. Keep it behind the AIModelAdapter interface so it can be swapped.
7. Claude Sonnet 4.5 is the planner model (clip cards, rerank, build packet). Keep it behind a similar adapter.
8. All content gating is enforced SERVER-SIDE with RLS + entitlement checks. Never trust client-side checks alone.
9. PDF files served ONLY via Supabase signed URLs that expire in 5 minutes.
10. Add rate limiting on /api/ai/* and /api/import/* endpoints.
11. Add Sentry error tracking from M0. Log all webhook processing and AI calls with structured logs.
12. Implement jobs with retries (max 5 attempts, exponential backoff).
13. Follow the milestone order (M0 → M13). Each milestone should be a working, testable increment.
14. Write basic tests for: webhook idempotency, entitlement checking, DSL schema validation.
15. Use the seed DSL example from Section 13 to verify the renderer works before building the AI pipeline.
```

---

## 18. ERROR STATES & EDGE CASES

| Scenario | Handling |
|---|---|
| Creator has 3 videos, asks for 30-chapter ebook | Planner returns `confidence: "low"` + `coverageGaps` array. UI shows: "You need more content about X, Y, Z to build this product. Import more videos or try a simpler product type." |
| Retrieval returns 0 relevant videos | UI shows: "No matching content found. Try a different topic or import more videos." |
| Kimi returns invalid DSL (first attempt) | Retry with error message appended to prompt. Log to Sentry. |
| Kimi returns invalid DSL (second attempt) | Return error to creator: "We couldn't generate this product automatically. Try editing the outline manually or changing your prompt." |
| ScrapeCreators returns 429/503 | Retry with exponential backoff (3 attempts). After 3 failures, mark job as failed and notify creator. |
| Transcript not available (no captions, no AI fallback) | Store video without transcript. Mark as `transcript_status: 'unavailable'`. Exclude from retrieval. |
| Creator disconnects Stripe mid-use | Products remain published but checkout disabled. Show: "Creator is not accepting payments right now." |
| Buyer tries to access paid content without entitlement | Server returns 403. UI redirects to sales page with "Purchase to access" CTA. |
| Creator publishes then edits (new version) | Previous version remains active until new version is explicitly published. Buyers always see active version. |
| Import of 500 videos takes too long | Job runs async. Creator sees progress bar. Timeout per-transcript: 30s. Overall import can take 20-40 minutes for 500 videos. |

---

## 19. CREATOR BILLING (HOW YOU MAKE MONEY)

### Pricing Model: Platform Fee + Optional SaaS Tiers

**V1 (Launch):**
- 10% platform fee on every transaction (via Stripe Connect application_fee_amount)
- Free tier: 50 imported videos, 2 published products, 5 AI generations/month
- Pro tier ($29/mo): 500 imported videos, unlimited products, 50 AI generations/month
- Business tier ($79/mo): unlimited everything, priority support

**Cost to serve per product generation:** ~$0.09–0.17 (see Section 5.7)
**Cost to import 500 videos:** ~$5–10 in ScrapeCreators credits (platform absorbs on Pro/Business)

---

## 20. LEGAL PAGES (MUST SHIP)

| Page | Route | Key Content |
|---|---|---|
| Terms of Service | `/legal/terms` | Platform rules, creator responsibilities, content ownership, prohibited content |
| Privacy Policy | `/legal/privacy` | Data collection (transcripts, analytics), third-party services (Stripe, ScrapeCreators), deletion rights |
| Refund Policy | `/legal/refunds` | 14-day refund window for digital products, process for requesting refund |
| DMCA / Takedown | `/legal/dmca` | Email-based takedown process, response timeline |

Link all four in the footer of every public page.

---

*END OF PRD — Hand this entire document to Codex.*
