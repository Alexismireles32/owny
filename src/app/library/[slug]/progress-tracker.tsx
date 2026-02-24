'use client';

// Interactive progress tracker for courses, challenges, and checklists
// PRD M7: Checklist with interactive state, progress persistence

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
    productId: string;
    dslJson: Record<string, unknown>;
    initialProgress: Record<string, unknown>;
    primaryColor: string;
}

interface BlockItem {
    id: string;
    title: string;
    description?: string;
}

export function ContentProgressTracker({
    productId,
    dslJson,
    initialProgress,
    primaryColor,
}: Props) {
    const blocks = extractBlocks(dslJson);
    const initialCompleted = (initialProgress.completedBlockIds as string[]) || [];
    const [completedIds, setCompletedIds] = useState<string[]>(initialCompleted);
    const [saving, setSaving] = useState(false);

    const percentComplete = blocks.length > 0
        ? Math.round((completedIds.length / blocks.length) * 100)
        : 0;

    async function toggleBlock(blockId: string) {
        const updated = completedIds.includes(blockId)
            ? completedIds.filter((id) => id !== blockId)
            : [...completedIds, blockId];

        setCompletedIds(updated);

        const newPercent = blocks.length > 0
            ? Math.round((updated.length / blocks.length) * 100)
            : 0;

        // Persist to DB
        setSaving(true);
        try {
            await fetch('/api/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    completedBlockIds: updated,
                    percentComplete: newPercent,
                }),
            });
        } catch { /* ignore */ }
        setSaving(false);
    }

    return (
        <div className="space-y-4">
            {/* Progress header */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                    {completedIds.length} of {blocks.length} completed
                </span>
                <span className="text-sm font-bold" style={{ color: primaryColor }}>
                    {percentComplete}%
                </span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 mb-6">
                <div
                    className="h-3 rounded-full transition-all duration-300"
                    style={{
                        width: `${percentComplete}%`,
                        backgroundColor: primaryColor,
                    }}
                />
            </div>

            {/* Blocks */}
            {blocks.map((block, index) => {
                const isComplete = completedIds.includes(block.id);
                return (
                    <Card
                        key={block.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${isComplete ? 'opacity-75' : ''
                            }`}
                        onClick={() => toggleBlock(block.id)}
                    >
                        <CardContent className="flex items-start gap-3 py-4">
                            <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${isComplete
                                        ? 'border-transparent text-white'
                                        : 'border-muted-foreground/30'
                                    }`}
                                style={isComplete ? { backgroundColor: primaryColor } : {}}
                            >
                                {isComplete && (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <h3 className={`font-medium ${isComplete ? 'line-through text-muted-foreground' : ''}`}>
                                        {block.title}
                                    </h3>
                                </div>
                                {block.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {block.description}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}

            {saving && (
                <p className="text-xs text-muted-foreground text-center">Saving…</p>
            )}

            {blocks.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                    Content blocks will appear here once the product is built.
                </p>
            )}
        </div>
    );
}

/**
 * Extract block items from DSL JSON for progress tracking.
 * Falls back to placeholder blocks if DSL structure is unrecognized.
 */
function extractBlocks(dslJson: Record<string, unknown>): BlockItem[] {
    // Try to extract from DSL pages → blocks
    const pages = dslJson.pages as Array<Record<string, unknown>> | undefined;
    if (pages) {
        const blocks: BlockItem[] = [];
        for (const page of pages) {
            const pageBlocks = page.blocks as Array<Record<string, unknown>> | undefined;
            if (pageBlocks) {
                for (const block of pageBlocks) {
                    blocks.push({
                        id: (block.id as string) || `block-${blocks.length}`,
                        title: (block.heading as string) || (block.title as string) || `Block ${blocks.length + 1}`,
                        description: (block.body as string) || (block.description as string) || undefined,
                    });
                }
            }
        }
        if (blocks.length > 0) return blocks;
    }

    // Fallback: try top-level blocks array
    const topBlocks = dslJson.blocks as Array<Record<string, unknown>> | undefined;
    if (topBlocks) {
        return topBlocks.map((b, i) => ({
            id: (b.id as string) || `block-${i}`,
            title: (b.heading as string) || (b.title as string) || `Block ${i + 1}`,
            description: (b.body as string) || undefined,
        }));
    }

    return [];
}
