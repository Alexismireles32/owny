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

export type PipelineStatus =
    | 'pending'
    | 'scraping'
    | 'transcribing'
    | 'indexing'
    | 'cleaning'
    | 'clustering'
    | 'extracting'
    | 'ready'
    | 'error'
    | 'insufficient_content';

export type PipelineRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'superseded';
export type PipelineDeadLetterStatus = 'open' | 'replayed' | 'resolved' | 'ignored';
export type PipelineJobStatus =
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'dead_letter'
    | 'cancelled';
export type PipelineJobTrigger =
    | 'onboarding'
    | 'manual_retry'
    | 'auto_recovery'
    | 'dlq_replay'
    | 'unknown';

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
    // Pipeline fields
    pipeline_status: PipelineStatus;
    pipeline_error: string | null;
    follower_count: number | null;
    following_count: number | null;
    video_count: number | null;
    is_verified: boolean;
    is_claimed: boolean;
    tiktok_url: string | null;
    pipeline_run_id: string | null;
    visual_dna: Record<string, unknown> | null;
    voice_profile: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface PipelineRun {
    id: string;
    run_id: string;
    creator_id: string;
    handle: string;
    event_id: string | null;
    status: PipelineRunStatus;
    current_step: string | null;
    attempt_count: number;
    metrics: Record<string, unknown>;
    error_message: string | null;
    started_at: string;
    last_heartbeat_at: string;
    finished_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PipelineDeadLetter {
    id: string;
    run_id: string;
    creator_id: string;
    handle: string;
    event_id: string | null;
    failed_step: string | null;
    error_message: string;
    payload: Record<string, unknown>;
    status: PipelineDeadLetterStatus;
    replay_count: number;
    replayed_at: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PipelineJob {
    id: string;
    creator_id: string;
    handle: string;
    run_id: string;
    trigger: PipelineJobTrigger;
    status: PipelineJobStatus;
    attempts: number;
    max_attempts: number;
    next_attempt_at: string;
    worker_id: string | null;
    locked_at: string | null;
    lock_expires_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    last_error: string | null;
    payload: Record<string, unknown>;
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
    creator_id: string | null;
    platform: string;
    transcript_text: string;
    language: string;
    source: TranscriptSource;
    title: string | null;
    description: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    thumbnail_url: string | null;
    webvtt_url: string | null;
    duration_seconds: number | null;
    posted_at: string | null;
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

// ---- CONTENT CLUSTERS ----

export interface ContentCluster {
    id: string;
    creator_id: string;
    label: string;
    topic_summary: string | null;
    video_ids: string[];
    total_views: number;
    video_count: number;
    extracted_content: Record<string, unknown> | null;
    recommended_product_type: string | null;
    confidence_score: number;
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
    | 'product_build'
    | 'scrape_pipeline';

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
