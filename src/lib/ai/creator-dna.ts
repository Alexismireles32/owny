interface CreatorDNAInput {
    handle: string;
    displayName: string | null;
    bio: string | null;
    voiceProfile: Record<string, unknown> | null;
    brandTokens: Record<string, unknown> | null;
}

interface VoiceDNA {
    tone: string;
    vocabulary: string;
    speakingStyle: string;
    catchphrases: string[];
    personality: string;
    contentFocus: string;
}

interface VisualDNA {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    mood: string;
}

export interface CreatorDNA {
    handle: string;
    displayName: string;
    bio: string;
    voice: VoiceDNA;
    visual: VisualDNA;
    audienceHypothesis: string[];
    immutableRules: string[];
}

function readString(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || fallback;
}

function readStringArray(value: unknown, limit = 6): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => readString(entry))
        .filter(Boolean)
        .slice(0, limit);
}

function inferAudienceFromBio(bio: string): string[] {
    const lower = bio.toLowerCase();
    const signals: string[] = [];

    if (lower.includes('founder') || lower.includes('business') || lower.includes('startup')) {
        signals.push('Ambitious operators looking for practical business systems.');
    }
    if (lower.includes('fitness') || lower.includes('health') || lower.includes('wellness')) {
        signals.push('Results-driven audience seeking repeatable routines and accountability.');
    }
    if (lower.includes('creator') || lower.includes('content')) {
        signals.push('Creator audience focused on growth, workflow, and monetization.');
    }
    if (lower.includes('design') || lower.includes('brand')) {
        signals.push('Visual-first audience expecting intentional taste and polish.');
    }

    if (signals.length === 0) {
        signals.push('Audience expects clear, practical guidance and creator-authentic delivery.');
    }

    return signals.slice(0, 3);
}

export function buildCreatorDNA(input: CreatorDNAInput): CreatorDNA {
    const voiceSource = input.voiceProfile || {};
    const brandSource = input.brandTokens || {};

    const displayName = readString(input.displayName, input.handle);
    const bio = readString(input.bio, '');
    const voice: VoiceDNA = {
        tone: readString(voiceSource.tone, 'confident and practical'),
        vocabulary: readString(voiceSource.vocabulary, 'clear and direct'),
        speakingStyle: readString(voiceSource.speakingStyle, 'structured and conversational'),
        catchphrases: readStringArray(voiceSource.catchphrases, 8),
        personality: readString(voiceSource.personality, 'trusted coach'),
        contentFocus: readString(voiceSource.contentFocus, 'actionable outcomes'),
    };

    const visual: VisualDNA = {
        primaryColor: readString(brandSource.primaryColor, '#6366f1'),
        secondaryColor: readString(brandSource.secondaryColor, '#8b5cf6'),
        backgroundColor: readString(brandSource.backgroundColor, '#ffffff'),
        textColor: readString(brandSource.textColor, '#1f2937'),
        fontFamily: readString(brandSource.fontFamily, 'inter'),
        mood: readString(brandSource.mood, 'clean'),
    };

    return {
        handle: input.handle,
        displayName,
        bio,
        voice,
        visual,
        audienceHypothesis: inferAudienceFromBio(bio),
        immutableRules: [
            'Do not write in a neutral brand voice. The creator voice DNA is mandatory.',
            'Do not override creator token palette unless contrast/accessibility requires safe adjustment.',
            'Do not use generic placeholder claims or motivational fluff.',
            'Every major section must stay grounded in creator source evidence.',
        ],
    };
}

export function buildCreatorDNAContext(dna: CreatorDNA): string {
    return `CREATOR DNA PROFILE
- Handle: @${dna.handle}
- Display name: ${dna.displayName}
- Bio: ${dna.bio || '(not provided)'}

VOICE DNA
- Tone: ${dna.voice.tone}
- Vocabulary: ${dna.voice.vocabulary}
- Speaking style: ${dna.voice.speakingStyle}
- Personality: ${dna.voice.personality}
- Content focus: ${dna.voice.contentFocus}
- Catchphrases: ${dna.voice.catchphrases.length > 0 ? dna.voice.catchphrases.join(', ') : '(none)'}

VISUAL DNA
- Primary color: ${dna.visual.primaryColor}
- Secondary color: ${dna.visual.secondaryColor}
- Background color: ${dna.visual.backgroundColor}
- Text color: ${dna.visual.textColor}
- Font family: ${dna.visual.fontFamily}
- Brand mood: ${dna.visual.mood}

AUDIENCE HYPOTHESIS
${dna.audienceHypothesis.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

IMMUTABLE RULES
${dna.immutableRules.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`;
}
