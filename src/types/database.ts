// =============================================
// Database row types — mirrors supabase/migrations/00001_complete_schema.sql
// =============================================

// ---- IDENTITY ----

export interface Profile {
    id: string;
    email: string;
    role: 'creator' | 'buyer' | 'admin';
    created_at: string;
    updated_at: string;
}

export interface BrandTokensDB {
    primaryColor?: string;
    secondaryColor?: string;
    mood?: string;
    [key: string]: unknown;
}

export interface Creator {
    id: string;
    profile_id: string;
    handle: string;
    display_name: string;
    bio: string | null;
    avatar_url: string | null;
    brand_tokens: BrandTokensDB;
    featured_product_id: string | null;
    stripe_connect_account_id: string | null;
    stripe_connect_status: 'unconnected' | 'pending' | 'connected';
    created_at: string;
    updated_at: string;
}

// ---- VIDEO LIBRARY ----

export type VideoSource = 'scrapecreators' | 'csv' | 'manual' | 'youtube';

export interface Video {
    id: string;
    creator_id: string;
    source: VideoSource;
    external_video_id: string | null;
    url: string | null;
    title: string | null;
    description: string | null;
    views: number | null;
    likes: number | null;
    comments_count: number | null;
    shares: number | null;
    duration: number | null; // seconds
    thumbnail_url: string | null;
    created_at_source: string | null;
    created_at: string;
    updated_at: string;
}

export type TranscriptSource = 'caption' | 'ai_fallback' | 'manual';

export interface VideoTranscript {
    id: string;
    video_id: string;
    transcript_text: string;
    language: string;
    source: TranscriptSource;
    created_at: string;
}

export interface TranscriptChunk {
    id: string;
    video_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding: number[] | null; // vector(1536)
    created_at: string;
}

export interface ClipCardRow {
    id: string;
    video_id: string;
    card_json: Record<string, unknown>; // ClipCard shape
    embedding: number[] | null;
    created_at: string;
}

// ---- PRODUCTS ----

export type ProductKind = 'pdf_guide' | 'mini_course' | 'challenge_7day' | 'checklist_toolkit';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type AccessType = 'public' | 'email_gated' | 'paid' | 'subscription';

export interface Product {
    id: string;
    creator_id: string;
    slug: string;
    type: ProductKind;
    title: string;
    description: string | null;
    status: ProductStatus;
    active_version_id: string | null;
    access_type: AccessType;
    price_cents: number | null;
    currency: string;
    stripe_price_id: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProductVersion {
    id: string;
    product_id: string;
    version_number: number;
    build_packet: Record<string, unknown>;
    dsl_json: Record<string, unknown>;
    source_video_ids: string[];
    published_at: string | null;
    created_at: string;
}

// ---- ORDERS & ENTITLEMENTS ----

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'failed';

export interface Order {
    id: string;
    buyer_profile_id: string;
    product_id: string;
    status: OrderStatus;
    amount_cents: number;
    currency: string;
    stripe_checkout_session_id: string | null;
    stripe_payment_intent_id: string | null;
    refunded_at: string | null;
    created_at: string;
    updated_at: string;
}

export type EntitlementStatus = 'active' | 'revoked';
export type GrantedVia = 'purchase' | 'admin' | 'promo';

export interface Entitlement {
    id: string;
    buyer_profile_id: string;
    product_id: string;
    status: EntitlementStatus;
    granted_via: GrantedVia;
    created_at: string;
    updated_at: string;
}

// ---- PROGRESS ----

export interface ProgressData {
    completedBlockIds: string[];
    lastAccessedAt: string;
    percentComplete: number;
}

export interface CourseProgress {
    id: string;
    buyer_profile_id: string;
    product_id: string;
    progress_data: ProgressData;
    created_at: string;
    updated_at: string;
}

// ---- STRIPE EVENTS ----

export type ProcessingStatus = 'received' | 'processed' | 'failed';

export interface StripeEvent {
    id: string;
    stripe_event_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    processing_status: ProcessingStatus;
    error_message: string | null;
    processed_at: string | null;
    created_at: string;
}

// ---- JOBS ----

export type JobType =
    | 'tiktok_import'
    | 'transcript_fetch'
    | 'clip_card_gen'
    | 'embedding_gen'
    | 'csv_parse'
    | 'product_build';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
    id: string;
    type: JobType;
    creator_id: string | null;
    status: JobStatus;
    attempts: number;
    max_attempts: number;
    payload: Record<string, unknown>;
    result: Record<string, unknown> | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

// ---- ANALYTICS ----

export interface PageView {
    id: string;
    path: string;
    creator_id: string | null;
    product_id: string | null;
    referrer: string | null;
    created_at: string;
}

// ---- ADMIN ----

export type TakedownStatus = 'active' | 'lifted';

export interface Takedown {
    id: string;
    product_id: string;
    reason: string;
    status: TakedownStatus;
    admin_profile_id: string | null;
    created_at: string;
}
