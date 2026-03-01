import OpenAI from 'openai';
import type { ProductType } from '@/types/build-packet';
import { DEFAULT_KIMI_MODEL, type MoonshotChatCompletionRequest } from '@/lib/ai/kimi';
import { log } from '@/lib/logger';
import { postProcessHTML } from '@/lib/ai/post-process-html';
import { ensureChecklistDocumentInteractivity } from '@/lib/ai/checklist-interactivity';
import {
    buildQualityFeedbackForPrompt,
    evaluateProductQuality,
    type ProductQualityEvaluation,
    type QualityGateKey,
} from '@/lib/ai/quality-gates';

interface CriticLoopInput {
    html: string;
    productType: ProductType;
    sourceVideoIds: string[];
    catalogHtml: string[];
    brandTokens: Record<string, unknown> | null;
    creatorHandle: string;
    creatorDisplayName: string;
    topicQuery: string;
    originalRequest: string;
    creatorDnaContext: string;
    designCanonContext: string;
    directionId: string;
    contentContext: string;
    maxIterations?: number;
    qualityWeights?: Partial<Record<QualityGateKey, number>>;
    preferredModel?: 'kimi';
}

interface CriticLoopResult {
    html: string;
    evaluation: ProductQualityEvaluation;
    iterationsRun: number;
    modelTrail: string[];
}

async function reviseHtmlWithCritic(input: {
    currentHtml: string;
    qualityFeedback: string;
    creatorDnaContext: string;
    designCanonContext: string;
    directionId: string;
    productType: ProductType;
    topicQuery: string;
    originalRequest: string;
    creatorHandle: string;
    creatorDisplayName: string;
    contentContext: string;
    preferredModel: 'kimi';
}): Promise<{ html: string; model: string }> {
    const systemPrompt = `You are the Owny Evergreen Quality Critic and Editor.

Goal:
- Improve an existing digital product HTML file until it passes strict quality gates.

Rules:
- Output ONLY complete HTML. No markdown fences or commentary.
- Keep this as a real product (guide/course/challenge/toolkit), never a landing page.
- Apply targeted edits based on failing gates. Preserve good sections.
- Keep or add source attribution comments with this exact syntax:
  <!-- sources: video-id-1,video-id-2 -->
- Preserve Tailwind + Alpine compatibility.
- Preserve creator voice and creator brand tokens.
- Avoid generic AI wording and repeated boilerplate patterns.`;

    const userPrompt = `QUALITY ISSUES TO FIX:
${input.qualityFeedback}

PRODUCT CONTEXT:
- Product type: ${input.productType}
- Topic: ${input.topicQuery}
- Creator: ${input.creatorDisplayName} (@${input.creatorHandle})
- Direction ID: ${input.directionId}
- Original request: ${input.originalRequest}

${input.creatorDnaContext}

${input.designCanonContext}

SOURCE EVIDENCE (for grounding):
${input.contentContext.slice(0, 18000)}

CURRENT HTML:
${input.currentHtml}

Return the full improved HTML now.`;

    const runKimi = async (): Promise<{ html: string; model: string }> => {
        const kimi = new OpenAI({
            apiKey: process.env.KIMI_API_KEY || '',
            baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
        });
        const result = await kimi.chat.completions.create(
            {
                model: DEFAULT_KIMI_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                thinking: { type: 'disabled' },
                temperature: 0.6,
                max_tokens: 16000,
            } as MoonshotChatCompletionRequest
        );
        return { html: result.choices[0]?.message?.content ?? '', model: DEFAULT_KIMI_MODEL };
    };

    try {
        return await runKimi();
    } catch (error) {
        log.warn('Kimi critic pass failed', {
            error: error instanceof Error ? error.message : 'Unknown Kimi critic error',
        });
        throw error;
    }
}

function isEvaluationBetter(
    candidate: ProductQualityEvaluation,
    current: ProductQualityEvaluation
): boolean {
    if (candidate.overallPassed && !current.overallPassed) return true;
    if (candidate.failingGates.length < current.failingGates.length) return true;
    if (candidate.failingGates.length > current.failingGates.length) return false;
    return candidate.overallScore > current.overallScore;
}

export async function runEvergreenCriticLoop(input: CriticLoopInput): Promise<CriticLoopResult> {
    const maxIterations = Math.max(0, Math.min(input.maxIterations ?? 2, 3));
    const modelTrail: string[] = [];

    let bestHtml = postProcessHTML(input.html);
    if (input.productType === 'checklist_toolkit') {
        bestHtml = ensureChecklistDocumentInteractivity(bestHtml);
    }
    let bestEvaluation = evaluateProductQuality({
        html: bestHtml,
        productType: input.productType,
        sourceVideoIds: input.sourceVideoIds,
        catalogHtml: input.catalogHtml,
        brandTokens: input.brandTokens,
        creatorHandle: input.creatorHandle,
        qualityWeights: input.qualityWeights,
    });

    if (maxIterations === 0 || bestEvaluation.overallPassed) {
        return {
            html: bestHtml,
            evaluation: bestEvaluation,
            iterationsRun: 0,
            modelTrail,
        };
    }

    let currentHtml = bestHtml;
    let currentEvaluation = bestEvaluation;
    let iterationsRun = 0;

    while (iterationsRun < maxIterations && !currentEvaluation.overallPassed) {
        const feedback = buildQualityFeedbackForPrompt(currentEvaluation);
        const revised = await reviseHtmlWithCritic({
            currentHtml,
            qualityFeedback: feedback,
            creatorDnaContext: input.creatorDnaContext,
            designCanonContext: input.designCanonContext,
            directionId: input.directionId,
            productType: input.productType,
            topicQuery: input.topicQuery,
            originalRequest: input.originalRequest,
            creatorHandle: input.creatorHandle,
            creatorDisplayName: input.creatorDisplayName,
            contentContext: input.contentContext,
            preferredModel: input.preferredModel ?? 'kimi',
        });

        let revisedHtml = postProcessHTML(revised.html || currentHtml);
        if (input.productType === 'checklist_toolkit') {
            revisedHtml = ensureChecklistDocumentInteractivity(revisedHtml);
        }
        const revisedEvaluation = evaluateProductQuality({
            html: revisedHtml,
            productType: input.productType,
            sourceVideoIds: input.sourceVideoIds,
            catalogHtml: input.catalogHtml,
            brandTokens: input.brandTokens,
            creatorHandle: input.creatorHandle,
            qualityWeights: input.qualityWeights,
        });

        modelTrail.push(revised.model);
        iterationsRun += 1;

        if (isEvaluationBetter(revisedEvaluation, bestEvaluation)) {
            bestEvaluation = revisedEvaluation;
            bestHtml = revisedHtml;
        }

        if (!isEvaluationBetter(revisedEvaluation, currentEvaluation)) {
            log.warn('Critic loop made no quality improvement; stopping early', {
                iteration: iterationsRun,
                currentScore: currentEvaluation.overallScore,
                revisedScore: revisedEvaluation.overallScore,
            });
            break;
        }

        currentHtml = revisedHtml;
        currentEvaluation = revisedEvaluation;
    }

    return {
        html: bestHtml,
        evaluation: bestEvaluation,
        iterationsRun,
        modelTrail,
    };
}
