import { describe, expect, it } from 'vitest';
import {
    buildDeterministicLibrarianPack,
    extractGeneratedSectionBlocks,
    type KimiPipelineContext,
} from '@/lib/ai/kimi-product-pipeline';

const contexts: KimiPipelineContext[] = [
    {
        videoId: 'video-generic',
        title: 'Creator motivation thoughts',
        views: 240000,
        topicTags: ['mindset', 'motivation'],
        keySteps: ['Show up consistently'],
        transcriptContext: 'This is a general motivation talk for creators.',
    },
    {
        videoId: 'video-batching',
        title: 'Batch a week of TikTok videos in one afternoon',
        views: 140000,
        topicTags: ['content batching', 'weekly planning'],
        keySteps: ['Build a weekly content map', 'Batch by energy'],
        transcriptContext: 'Start with a weekly content map, then batch your hooks and filming by energy.',
    },
    {
        videoId: 'video-hooks',
        title: 'My hook library for faster filming',
        views: 130000,
        topicTags: ['hook library', 'batch filming'],
        keySteps: ['Write ten hooks in one sitting'],
        transcriptContext: 'A reusable hook library makes batch filming faster.',
    },
    {
        videoId: 'video-editing',
        title: 'Editing checklist for shipping a week of content',
        views: 120000,
        topicTags: ['editing checklist', 'content batching'],
        keySteps: ['Trim dead air', 'Set the posting sequence'],
        transcriptContext: 'Batching is only done when the week of content is ready to ship.',
    },
];

describe('buildDeterministicLibrarianPack', () => {
    it('prioritizes contexts that match the requested topic over generic high-view videos', () => {
        const pack = buildDeterministicLibrarianPack({
            productType: 'mini_course',
            productTitle: 'Batching Course',
            topicQuery: 'Create a mini course about batching a week of TikTok videos in one afternoon',
            selectedContexts: contexts,
        });

        expect(pack.selectedVideoIds[0]).toBe('video-batching');
        expect(pack.selectedVideoIds).toContain('video-hooks');
        expect(pack.selectedVideoIds).toContain('video-editing');
        expect(pack.evidenceRows[0]?.videoId).toBe('video-batching');
    });

    it('extracts batched section html and preserves the expected ids and source comments', () => {
        const blocks = extractGeneratedSectionBlocks({
            rawHtml: `
<!-- sources: video-batching -->
<section id="module-1"><h2>Module 1</h2></section>

<section id="wrong-id"><h2>Module 2</h2></section>
            `.trim(),
            sections: [
                {
                    id: 'module-1',
                    title: 'Module 1',
                    objective: 'Teach the map',
                    sourceVideoIds: ['video-batching'],
                    layoutHint: 'Premium card',
                    requiredElements: ['map'],
                    wordTarget: 180,
                },
                {
                    id: 'module-2',
                    title: 'Module 2',
                    objective: 'Teach hooks',
                    sourceVideoIds: ['video-hooks'],
                    layoutHint: 'Premium card',
                    requiredElements: ['hooks'],
                    wordTarget: 180,
                },
            ],
        });

        expect(blocks).toHaveLength(2);
        expect(blocks[0]?.id).toBe('module-1');
        expect(blocks[0]?.html).toContain('<!-- sources: video-batching -->');
        expect(blocks[1]?.id).toBe('module-2');
        expect(blocks[1]?.html).toContain('id="module-2"');
        expect(blocks[1]?.html).toContain('<!-- sources: video-hooks -->');
    });
});
