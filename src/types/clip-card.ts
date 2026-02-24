// src/types/clip-card.ts
// PRD §6.3 — Structured card generated from video transcript

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
