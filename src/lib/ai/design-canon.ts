import type { ProductType } from '@/types/build-packet';

export interface EvergreenDesignCanon {
    version: string;
    name: string;
    principles: string[];
    antiPatterns: string[];
    qualityWeights: {
        brandFidelity: number;
        distinctiveness: number;
        accessibility: number;
        contentDepth: number;
        evidenceLock: number;
    };
}

export interface CreativeDirection {
    id: string;
    name: string;
    narrativeAngle: string;
    layoutDNA: string;
    typographyDNA: string;
    colorDNA: string;
    interactionDNA: string;
    signatureMoves: string[];
    supports: ProductType[];
}

const CANON: EvergreenDesignCanon = {
    version: 'evergreen-canon-2026-02-27',
    name: 'Owny Evergreen Product Design Canon',
    principles: [
        'Creator identity is mandatory: voice, structure, and visual direction must read as creator-native.',
        'Every product must feel art-directed, not template-generated.',
        'Content value must be specific, structured, and immediately actionable.',
        'Interaction should clarify learning flow, not add novelty for novelty.',
        'Each version must be meaningfully distinct from prior creator releases.',
    ],
    antiPatterns: [
        'Generic hero-marketing pages pretending to be digital products.',
        'Repeating the same section rhythm across every build.',
        'Over-polished but content-thin copy.',
        'Color/font usage that ignores creator brand tokens.',
        'Unattributed claims not grounded in creator source videos.',
    ],
    qualityWeights: {
        brandFidelity: 0.24,
        distinctiveness: 0.2,
        accessibility: 0.18,
        contentDepth: 0.24,
        evidenceLock: 0.14,
    },
};

const CREATIVE_DIRECTIONS: CreativeDirection[] = [
    {
        id: 'editorial-playbook',
        name: 'Editorial Playbook',
        narrativeAngle: 'Authority through clarity and practical playbook sequencing.',
        layoutDNA: 'Section-led longform with explicit chapter cadence and progressive reveals.',
        typographyDNA: 'Strong heading hierarchy with disciplined body rhythm.',
        colorDNA: 'Neutral base with creator-primary accents used intentionally.',
        interactionDNA: 'Anchor navigation, sticky context controls, and clear section wayfinding.',
        signatureMoves: [
            'Chapter openers with concrete outcomes',
            'Callout rails for creator-specific tactical notes',
            'End-of-section implementation checklist',
        ],
        supports: ['pdf_guide', 'mini_course', 'checklist_toolkit'],
    },
    {
        id: 'studio-workshop',
        name: 'Studio Workshop',
        narrativeAngle: 'Hands-on coaching format focused on practice and execution.',
        layoutDNA: 'Module or day blocks with repeatable lesson mechanics and progress state.',
        typographyDNA: 'High-contrast labels and instruction-first body copy.',
        colorDNA: 'Creator palette with subtle module-state color coding.',
        interactionDNA: 'Task toggles, module/day navigation, and clear next-step controls.',
        signatureMoves: [
            'Action lab sections with timed exercises',
            'Checkpoint summaries every module/day',
            'Reflection prompts tied to real creator language',
        ],
        supports: ['mini_course', 'challenge_7day'],
    },
    {
        id: 'signal-checklist',
        name: 'Signal Checklist',
        narrativeAngle: 'Fast tactical execution with strict prioritization logic.',
        layoutDNA: 'Category-first checklist architecture with required/optional segmentation.',
        typographyDNA: 'Compact, scannable labeling with strong visual grouping.',
        colorDNA: 'Minimal surfaces with accent color reserved for completion/progress.',
        interactionDNA: 'Persistent progress and quick-jump category navigation.',
        signatureMoves: [
            'Required vs optional markers with rationale',
            'Category summaries with pitfalls',
            'Completion confidence scoring language',
        ],
        supports: ['checklist_toolkit', 'challenge_7day', 'pdf_guide'],
    },
    {
        id: 'premium-briefing',
        name: 'Premium Briefing',
        narrativeAngle: 'Executive-style transformation narrative with premium polish.',
        layoutDNA: 'Narrative arcs framed as strategic briefings with evidence blocks.',
        typographyDNA: 'Sharper display headings balanced by readable body width.',
        colorDNA: 'Creator primary/secondary on restrained elevated backgrounds.',
        interactionDNA: 'Minimal interactions, deliberate pacing, and strong visual anchors.',
        signatureMoves: [
            'Outcome framing before each major section',
            'Evidence-backed decision points',
            'Polished recap cards for implementation',
        ],
        supports: ['pdf_guide', 'mini_course'],
    },
];

function stableHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function normalizeMood(value: string | null | undefined): string {
    if (!value) return 'clean';
    return value.toString().trim().toLowerCase();
}

function preferredDirectionIdsByMood(mood: string): string[] {
    switch (mood) {
        case 'premium':
            return ['premium-briefing', 'editorial-playbook'];
        case 'bold':
        case 'energetic':
            return ['studio-workshop', 'signal-checklist'];
        case 'fresh':
            return ['studio-workshop', 'editorial-playbook'];
        case 'clean':
        default:
            return ['editorial-playbook', 'signal-checklist'];
    }
}

export function getEvergreenDesignCanon(): EvergreenDesignCanon {
    return CANON;
}

export function chooseCreativeDirection(input: {
    productType: ProductType;
    creatorId: string;
    topicQuery: string;
    creatorMood?: string | null;
    priorProductCount: number;
}): CreativeDirection {
    const allowed = CREATIVE_DIRECTIONS.filter((direction) => direction.supports.includes(input.productType));
    const preferredIds = preferredDirectionIdsByMood(normalizeMood(input.creatorMood));
    const preferred = allowed.filter((direction) => preferredIds.includes(direction.id));
    const pool = preferred.length > 0 ? preferred : allowed;

    const seed = [
        input.creatorId,
        input.productType,
        input.topicQuery.toLowerCase(),
        String(input.priorProductCount),
        CANON.version,
    ].join('|');

    const idx = stableHash(seed) % pool.length;
    return pool[idx];
}

export function buildDesignCanonContext(canon: EvergreenDesignCanon, direction: CreativeDirection): string {
    return `EVERGREEN DESIGN CANON (${canon.version})
Name: ${canon.name}

Non-negotiable principles:
${canon.principles.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

Forbidden anti-patterns:
${canon.antiPatterns.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

Chosen creative direction:
- Direction ID: ${direction.id}
- Name: ${direction.name}
- Narrative angle: ${direction.narrativeAngle}
- Layout DNA: ${direction.layoutDNA}
- Typography DNA: ${direction.typographyDNA}
- Color DNA: ${direction.colorDNA}
- Interaction DNA: ${direction.interactionDNA}
- Signature moves: ${direction.signatureMoves.join('; ')}`;
}
