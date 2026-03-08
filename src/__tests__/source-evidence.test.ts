import { describe, expect, it } from 'vitest';
import { loadSourceEvidenceBundle } from '@/lib/ai/source-evidence';

class FakeQueryBuilder<T> {
    constructor(private readonly rows: T[]) {}

    select(...args: unknown[]) {
        void args;
        return this;
    }

    async in(...args: unknown[]) {
        void args;
        return { data: this.rows };
    }
}

class FakeSupabase {
    constructor(
        private readonly tables: Record<string, unknown[]>
    ) {}

    from(table: string) {
        return new FakeQueryBuilder(this.tables[table] || []);
    }
}

describe('source evidence bundle', () => {
    it('builds per-video evidence blocks and a combined context', async () => {
        const supabase = new FakeSupabase({
            videos: [
                { id: 'video-1', title: 'Creator Workflow', views: 12000 },
            ],
            clip_cards: [
                {
                    video_id: 'video-1',
                    card_json: {
                        topicTags: ['workflow', 'systems'],
                        keySteps: ['Capture ideas', 'Batch your edits'],
                        whoItsFor: 'Creators who want a calmer production process',
                        outcome: 'A more reliable weekly publishing rhythm',
                        bestHook: 'Stop creating from chaos.',
                    },
                },
            ],
            video_transcripts: [
                {
                    video_id: 'video-1',
                    transcript_text: 'I batch all my edits on Monday so the rest of the week stays focused.',
                },
            ],
        });

        const bundle = await loadSourceEvidenceBundle(
            supabase as never,
            ['video-1']
        );

        expect(bundle.byVideoId['video-1']).toContain('VIDEO ID: video-1');
        expect(bundle.byVideoId['video-1']).toContain('Creator Workflow');
        expect(bundle.byVideoId['video-1']).toContain('Capture ideas');
        expect(bundle.byVideoId['video-1']).toContain('Stop creating from chaos.');
        expect(bundle.combinedContext).toContain('TRANSCRIPT EVIDENCE');
    });
});
