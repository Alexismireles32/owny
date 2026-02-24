// src/types/index.ts
// Barrel export for all type definitions

export type {
    ProductType,
    BuildPacket,
    SourceVideo,
    BrandTokens,
    PDFContent,
    CourseContent,
    ChallengeContent,
    ChecklistContent,
} from './build-packet';

export type {
    ProductDSL,
    DSLPage,
    DSLBlock,
    BaseBlock,
    HeroBlock,
    TextSectionBlock,
    BulletsBlock,
    StepsBlock,
    ChecklistBlock,
    ImageBlock,
    TestimonialBlock,
    FAQBlock,
    CTABlock,
    PricingBlock,
    DividerBlock,
    ModuleHeaderBlock,
    LessonContentBlock,
    DayHeaderBlock,
    DownloadButtonBlock,
} from './product-dsl';

export type { ClipCard } from './clip-card';

export type {
    VideoMeta,
    ProfileMeta,
    TranscriptResult,
    ImportProvider,
} from './import';

export type {
    Profile,
    Creator,
    BrandTokensDB,
    Video,
    VideoSource,
    VideoTranscript,
    TranscriptSource,
    TranscriptChunk,
    ClipCardRow,
    Product,
    ProductKind,
    ProductStatus,
    AccessType,
    ProductVersion,
    Order,
    OrderStatus,
    Entitlement,
    EntitlementStatus,
    GrantedVia,
    CourseProgress,
    ProgressData,
    StripeEvent,
    ProcessingStatus,
    Job,
    JobType,
    JobStatus,
    PageView,
    Takedown,
    TakedownStatus,
} from './database';
