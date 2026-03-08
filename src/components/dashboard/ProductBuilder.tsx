'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
    ArrowRight,
    Bot,
    Eye,
    Layers3,
    MessageSquareText,
    RefreshCcw,
    Rocket,
    SendHorizonal,
    Sparkles,
    Square,
    Wand2,
} from 'lucide-react';
import LivePreview from './LivePreview';
import { cn, getApiErrorMessage, readJsonSafe } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface ProductBuilderProps {
    creatorId: string;
    displayName: string;
    onProductCreated: () => void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    topicSuggestions?: { topic: string; videoCount: number; problem?: string; promise?: string; supportingVideoIds?: string[] }[];
    productType?: string;
}

interface BuildState {
    productId: string | null;
    versionId: string | null;
    html: string;
    isBuilding: boolean;
    phase: string;
}

interface VersionSnapshot {
    html: string;
    versionId: string | null;
    label: string;
}

interface SourceVideo {
    title: string;
    views: number;
}

interface LiveStatusState {
    phase: string;
    headline: string;
    detail?: string;
    tone: 'working' | 'success' | 'error';
}

type BuilderPane = 'assistant' | 'preview';

const SUGGESTIONS = [
    {
        label: 'Create a PDF guide',
        description: 'Package your strongest lessons into a clean, premium lead magnet or paid guide.',
        accent: 'from-amber-100 via-orange-50 to-white',
    },
    {
        label: 'Build a mini course',
        description: 'Turn recurring teaching moments into a concise course with a clear transformation.',
        accent: 'from-sky-100 via-cyan-50 to-white',
    },
    {
        label: 'Make a 7-day challenge',
        description: 'Create a fast, high-accountability offer with daily steps and momentum hooks.',
        accent: 'from-emerald-100 via-teal-50 to-white',
    },
    {
        label: 'Create a checklist toolkit',
        description: 'Bundle templates, checklists, and operating systems buyers can use immediately.',
        accent: 'from-fuchsia-100 via-rose-50 to-white',
    },
];

const TOPIC_STOPWORDS = new Set([
    'your',
    'you',
    'create',
    'make',
    'guide',
    'video',
    'videos',
    'content',
    'library',
    'topic',
    'topics',
    'best',
    'real',
    'the',
    'and',
    'for',
    'from',
    'owny',
    'official',
]);

function normalizePhase(phase: string): string {
    if (phase === 'init') return 'analyzing';
    if (phase === 'reranking' || phase === 'extracting') return 'retrieving';
    if (phase === 'fallback') return 'building';
    if (phase === 'complete') return 'saving';
    return phase;
}

function sanitizeMessageText(content: string): string {
    return content.replace(/\*\*(.*?)\*\*/g, '$1').trim();
}

function normalizeTextToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function filterTopicSuggestions(
    rawTopics: { topic: string; videoCount: number; problem?: string; promise?: string; supportingVideoIds?: string[] }[],
    displayName: string
): { topic: string; videoCount: number; problem?: string; promise?: string; supportingVideoIds?: string[] }[] {
    const displayNameTokens = normalizeTextToken(displayName)
        .split(/\s+/)
        .filter((token) => token.length >= 3);

    const filtered = rawTopics
        .filter((item) => {
            const topic = normalizeTextToken(item.topic);
            if (!topic || topic.length < 4) return false;
            if (TOPIC_STOPWORDS.has(topic)) return false;
            if (displayNameTokens.includes(topic)) return false;
            if (item.videoCount < 2) return false;
            return true;
        })
        .slice(0, 6);

    if (filtered.length > 0) return filtered;

    return rawTopics
        .filter((item) => {
            const topic = normalizeTextToken(item.topic);
            if (!topic || topic.length < 4) return false;
            if (TOPIC_STOPWORDS.has(topic)) return false;
            if (displayNameTokens.includes(topic)) return false;
            return true;
        })
        .slice(0, 4);
}

function loadPersistedMessages(creatorId: string): ChatMessage[] {
    if (typeof window === 'undefined') return [];

    try {
        const saved = window.localStorage.getItem(`owny-builder-${creatorId}`);
        if (!saved) return [];

        const parsed = JSON.parse(saved) as { messages?: ChatMessage[] };
        if (!Array.isArray(parsed.messages)) return [];

        return parsed.messages
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
            .map((m) => ({
                ...m,
                timestamp: new Date(m.timestamp),
            }));
    } catch {
        return [];
    }
}

function getFriendlyPhaseLabel(phase: string): string {
    switch (normalizePhase(phase)) {
        case 'analyzing':
            return 'Analyzing';
        case 'retrieving':
            return 'Selecting';
        case 'planning':
            return 'Planning';
        case 'building':
            return 'Designing';
        case 'saving':
            return 'Saving';
        default:
            return 'Working';
    }
}

function buildFriendlyStatus(message: string, phase: string, isImprove: boolean): LiveStatusState {
    const normalizedPhase = normalizePhase(phase);
    const lower = message.toLowerCase();

    if (lower.includes('critic')) {
        return {
            phase: normalizedPhase,
            headline: isImprove ? 'Polishing the updated draft' : 'Polishing the draft',
            detail: 'Checking clarity, structure, and finish before saving.',
            tone: 'working',
        };
    }

    switch (normalizedPhase) {
        case 'analyzing':
            return {
                phase: normalizedPhase,
                headline: 'Reviewing your content library',
                detail: 'Looking for the strongest source material for this product.',
                tone: 'working',
            };
        case 'retrieving':
            return {
                phase: normalizedPhase,
                headline: 'Picking the strongest source clips',
                detail: 'Prioritizing the most useful videos and transcript moments.',
                tone: 'working',
            };
        case 'planning':
            return {
                phase: normalizedPhase,
                headline: isImprove ? 'Planning the revision' : 'Planning the product structure',
                detail: 'Shaping the angle, flow, and content structure before writing.',
                tone: 'working',
            };
        case 'building':
            return {
                phase: normalizedPhase,
                headline: isImprove ? 'Applying your changes' : 'Designing the draft',
                detail: 'Building the product and refining the visual structure.',
                tone: 'working',
            };
        case 'saving':
            return {
                phase: normalizedPhase,
                headline: isImprove ? 'Saving your changes' : 'Saving your draft',
                detail: 'Wrapping up the latest version.',
                tone: 'working',
            };
        default:
            return {
                phase: normalizedPhase,
                headline: isImprove ? 'Updating the product' : 'Working on the product',
                detail: message,
                tone: 'working',
            };
    }
}

export function ProductBuilder({ creatorId, displayName, onProductCreated }: ProductBuilderProps) {
    const shouldReduceMotion = useReducedMotion();
    const [messages, setMessages] = useState<ChatMessage[]>(() => loadPersistedMessages(creatorId));
    const [input, setInput] = useState('');
    const [buildState, setBuildState] = useState<BuildState>({
        productId: null,
        versionId: null,
        html: '',
        isBuilding: false,
        phase: '',
    });
    const [pendingProductType, setPendingProductType] = useState<string | null>(null);
    const [composerError, setComposerError] = useState<string | null>(null);
    const [versionHistory, setVersionHistory] = useState<VersionSnapshot[]>([]);
    const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published'>('idle');
    const [liveStatus, setLiveStatus] = useState<LiveStatusState | null>(null);
    const [activePane, setActivePane] = useState<BuilderPane>('assistant');

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messageCounterRef = useRef(messages.length);
    const sectionCountRef = useRef(0);
    const shouldAutoScrollRef = useRef(true);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container || !shouldAutoScrollRef.current) return;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (messages.length > 0) {
            try {
                localStorage.setItem(`owny-builder-${creatorId}`, JSON.stringify({ messages: messages.slice(-50) }));
            } catch { /* quota exceeded */ }
        }
    }, [messages, creatorId]);

    const nextMessageId = () => {
        messageCounterRef.current += 1;
        return `msg-${messageCounterRef.current}`;
    };

    const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
        const payload: ChatMessage = {
            ...msg,
            id: nextMessageId(),
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, payload]);
    }, []);

    const stopActiveBuild = useCallback(() => {
        abortRef.current?.abort();
        setBuildState((s) => ({ ...s, isBuilding: false }));
        setLiveStatus({
            phase: 'idle',
            headline: 'Generation stopped',
            detail: 'You can adjust the prompt and run it again.',
            tone: 'error',
        });
    }, []);

    const handleStream = useCallback(
        async (url: string, body: Record<string, unknown>, isImprove = false) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setBuildState((s) => ({ ...s, isBuilding: true, phase: 'init', ...(isImprove ? {} : { html: '' }) }));
            setComposerError(null);
            setLiveStatus(buildFriendlyStatus('Working...', 'init', isImprove));
            sectionCountRef.current = 0;

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    const errPayload = await readJsonSafe<{ error?: string }>(res);
                    const message = getApiErrorMessage(errPayload, 'Unable to start generation.');
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                    setLiveStatus({
                        phase: 'error',
                        headline: 'Could not start the request',
                        detail: message,
                        tone: 'error',
                    });
                    return;
                }

                const reader = res.body?.getReader();
                if (!reader) {
                    const message = 'No stream returned by the build endpoint.';
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                    setLiveStatus({
                        phase: 'error',
                        headline: 'Could not start the request',
                        detail: message,
                        tone: 'error',
                    });
                    return;
                }

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;

                        try {
                            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
                            const eventType = String(event.type || '');

                            if (eventType === 'status') {
                                const statusMessage = typeof event.message === 'string' ? event.message : 'Working...';
                                const nextPhase = typeof event.phase === 'string' ? event.phase : '';
                                setBuildState((s) => ({ ...s, phase: nextPhase || s.phase }));
                                setLiveStatus(buildFriendlyStatus(statusMessage, nextPhase || buildState.phase || 'init', isImprove));
                                continue;
                            }

                            if (eventType === 'topic_suggestions') {
                                const content = typeof event.message === 'string'
                                    ? event.message
                                    : 'Choose one topic to focus your product.';
                                const rawTopics = Array.isArray(event.topics)
                                    ? (event.topics as { topic: string; videoCount: number; problem?: string; promise?: string; supportingVideoIds?: string[] }[])
                                    : [];
                                const topicSuggestions = filterTopicSuggestions(rawTopics, displayName);
                                addMessage({
                                    role: 'assistant',
                                    content,
                                    topicSuggestions,
                                    productType: typeof event.productType === 'string' ? event.productType : undefined,
                                });
                                setBuildState((s) => ({ ...s, isBuilding: false }));
                                setPendingProductType(typeof event.productType === 'string' ? event.productType : null);
                                setActivePane('assistant');
                                setLiveStatus({
                                    phase: 'analyzing',
                                    headline: 'Choose the topic to focus',
                                    detail: 'Pick one direction and the draft will be built from that part of the library.',
                                    tone: 'working',
                                });
                                continue;
                            }

                            if (eventType === 'source_videos') {
                                const videos = Array.isArray(event.videos) ? event.videos as SourceVideo[] : [];
                                if (videos.length > 0) {
                                    setLiveStatus((current) => ({
                                        phase: 'retrieving',
                                        headline: current?.headline || 'Selecting the strongest source videos',
                                        detail: `Using ${videos.length} source videos to ground the draft.`,
                                        tone: 'working',
                                    }));
                                }
                                continue;
                            }

                            if (eventType === 'html_chunk' || eventType === 'html_complete') {
                                const htmlStr = typeof event.html === 'string' ? event.html : '';
                                setActivePane('preview');
                                // Detect sections being written for progress
                                const sectionMatches = htmlStr.match(/<(?:h2|section\s+id=)[^>]*>/gi);
                                const currentSections = sectionMatches ? sectionMatches.length : 0;
                                if (currentSections > sectionCountRef.current) {
                                    sectionCountRef.current = currentSections;
                                    const lastH2 = htmlStr.match(/<h2[^>]*>([^<]{3,60})/gi);
                                    if (lastH2 && lastH2.length > 0) {
                                        const titleText = lastH2[lastH2.length - 1].replace(/<[^>]*>/g, '').trim();
                                        if (titleText) {
                                            setLiveStatus({
                                                phase: 'building',
                                                headline: isImprove ? 'Updating the draft layout and content' : 'Designing the draft',
                                                detail: `Working on section ${currentSections}: ${titleText}`,
                                                tone: 'working',
                                            });
                                        }
                                    }
                                }
                                setBuildState((s) => ({
                                    ...s,
                                    html: htmlStr,
                                }));
                                continue;
                            }

                            if (eventType === 'complete') {
                                const videosUsed = typeof event.videosUsed === 'number' ? event.videosUsed : null;
                                const title = typeof event.title === 'string' ? event.title : 'Your product';
                                setActivePane('preview');
                                setBuildState((s) => {
                                    // Save version for undo
                                    if (s.html) {
                                        setVersionHistory((prev) => [...prev, {
                                            html: s.html,
                                            versionId: s.versionId,
                                            label: isImprove ? `Before: ${title}` : `v${prev.length + 1}`,
                                        }]);
                                    }
                                    return {
                                        ...s,
                                        productId: typeof event.productId === 'string' ? event.productId : s.productId,
                                        versionId: typeof event.versionId === 'string' ? event.versionId : s.versionId,
                                        isBuilding: false,
                                        phase: 'complete',
                                    };
                                });

                                if (isImprove) {
                                    addMessage({ role: 'assistant', content: 'Updated. The latest changes are now in the draft.' });
                                    setLiveStatus({
                                        phase: 'complete',
                                        headline: 'Changes saved',
                                        detail: 'Keep refining the draft or publish when it feels ready.',
                                        tone: 'success',
                                    });
                                } else {
                                    addMessage({
                                        role: 'assistant',
                                        content: `"${title}" is ready.${videosUsed ? ` Built from ${videosUsed} source videos.` : ''} You can now refine the draft or publish it when it feels right.`,
                                    });
                                    setLiveStatus({
                                        phase: 'complete',
                                        headline: 'Draft ready',
                                        detail: 'The product is saved and ready for another round of edits or publishing.',
                                        tone: 'success',
                                    });
                                    onProductCreated();
                                }
                                continue;
                            }

                            if (eventType === 'error') {
                                const message = typeof event.message === 'string' ? event.message : 'Generation failed.';
                                addMessage({ role: 'assistant', content: `Error: ${message}` });
                                setComposerError(message);
                                setActivePane('assistant');
                                setBuildState((s) => ({ ...s, isBuilding: false }));
                                setLiveStatus({
                                    phase: 'error',
                                    headline: 'Could not finish this request',
                                    detail: message,
                                    tone: 'error',
                                });
                            }
                        } catch {
                            // Ignore malformed stream chunks.
                        }
                    }
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    const message = 'Connection lost while generating. Please retry.';
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setActivePane('assistant');
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                    setLiveStatus({
                        phase: 'error',
                        headline: 'Connection lost',
                        detail: message,
                        tone: 'error',
                    });
                }
            }
        },
        [addMessage, buildState.phase, displayName, onProductCreated]
    );

    const handleTopicSelect = useCallback(
        (topic: { topic: string; videoCount: number; problem?: string; promise?: string; supportingVideoIds?: string[] }) => {
            addMessage({ role: 'user', content: topic.topic });
            handleStream('/api/products/build', {
                creatorId,
                message: topic.topic,
                productType: pendingProductType || 'pdf_guide',
                confirmedTopic: topic.topic,
                confirmedTopicProblem: topic.problem,
                confirmedTopicPromise: topic.promise,
                confirmedTopicSupportingVideoIds: topic.supportingVideoIds || [],
            });
        },
        [creatorId, pendingProductType, addMessage, handleStream]
    );

    const handleSubmit = useCallback(
        async (prompt?: string) => {
            const text = (prompt || input).trim();
            if (!text || buildState.isBuilding) return;

            addMessage({ role: 'user', content: text });
            setInput('');
            setLiveStatus(null);

            if (buildState.productId && buildState.html) {
                handleStream(
                    '/api/products/improve',
                    {
                        productId: buildState.productId,
                        instruction: text,
                        currentHtml: buildState.html,
                    },
                    true
                );
                return;
            }

            handleStream('/api/products/build', {
                creatorId,
                message: text,
            });
        },
        [input, buildState, creatorId, addMessage, handleStream]
    );

    const hasProduct = buildState.html.length > 0;
    const showWelcome = !hasProduct && !buildState.isBuilding && messages.length === 0;
    const headerPhaseLabel = buildState.phase
        ? buildState.phase === 'complete'
            ? 'Ready'
            : getFriendlyPhaseLabel(buildState.phase)
        : 'Ready';
    const entryTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.36, ease: 'easeOut' as const };
    const springTransition = shouldReduceMotion
        ? { duration: 0 }
        : { type: 'spring' as const, stiffness: 240, damping: 24, mass: 0.9 };

    const handleUndo = useCallback(() => {
        if (versionHistory.length === 0) return;
        const prev = versionHistory[versionHistory.length - 1];
        setBuildState((s) => ({ ...s, html: prev.html, versionId: prev.versionId }));
        setVersionHistory((h) => h.slice(0, -1));
        setActivePane('preview');
        setLiveStatus({
            phase: 'complete',
            headline: 'Draft reverted',
            detail: `Restored ${prev.label}.`,
            tone: 'success',
        });
    }, [versionHistory]);

    const handlePublish = useCallback(async () => {
        if (!buildState.productId) return;
        setPublishStatus('publishing');
        try {
            const res = await fetch(`/api/products/${buildState.productId}/publish`, { method: 'POST' });
            if (res.ok) {
                setPublishStatus('published');
                addMessage({ role: 'assistant', content: 'Product published. It is now live on your storefront.' });
                setLiveStatus({
                    phase: 'complete',
                    headline: 'Published',
                    detail: 'The product is now live on your storefront.',
                    tone: 'success',
                });
                onProductCreated();
            } else {
                setPublishStatus('idle');
                addMessage({ role: 'assistant', content: 'Could not publish. Please try again.' });
                setLiveStatus({
                    phase: 'error',
                    headline: 'Publish failed',
                    detail: 'Please retry after reviewing the draft.',
                    tone: 'error',
                });
            }
        } catch {
            setPublishStatus('idle');
        }
    }, [buildState.productId, addMessage, onProductCreated]);

    const handleClearChat = useCallback(() => {
        setMessages([]);
        setBuildState({ productId: null, versionId: null, html: '', isBuilding: false, phase: '' });
        setVersionHistory([]);
        setPublishStatus('idle');
        setLiveStatus(null);
        setActivePane('assistant');
        localStorage.removeItem(`owny-builder-${creatorId}`);
    }, [creatorId]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 bg-white/80 px-4 py-3.5 backdrop-blur sm:px-5">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Creator Product Studio
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                        Building with {displayName}&apos;s videos, transcripts, and brand DNA
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge
                        variant="outline"
                        className="border-slate-300 bg-white text-[10px] uppercase tracking-[0.12em] text-slate-600"
                    >
                        {headerPhaseLabel}
                    </Badge>
                    <Badge
                        variant="outline"
                        className="hidden border-sky-200 bg-sky-50 text-[10px] uppercase tracking-[0.12em] text-sky-700 sm:inline-flex"
                    >
                        Evidence-grounded
                    </Badge>
                    {buildState.isBuilding && (
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            onClick={stopActiveBuild}
                        >
                            <Square />
                            Stop
                        </Button>
                    )}
                </div>
            </div>

            {showWelcome ? (
                <>
                    <div className="relative flex min-h-0 flex-1 overflow-hidden">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.20),transparent_42%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_38%)]" />
                        <div className="relative flex min-h-0 w-full items-center p-4 sm:p-6">
                            <div className="grid w-full gap-5 xl:grid-cols-[1.08fr_0.92fr]">
                                <motion.div
                                    initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={entryTransition}
                                >
                                    <Card className="overflow-hidden border-slate-200/80 bg-white/90 py-0 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)] backdrop-blur">
                                        <CardContent className="space-y-7 px-6 py-7 sm:px-8">
                                        <Badge
                                            variant="outline"
                                            className="border-amber-200 bg-amber-50 text-[10px] uppercase tracking-[0.14em] text-amber-800"
                                        >
                                            Build mode
                                        </Badge>
                                        <div className="space-y-3">
                                            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                                                Turn your content archive into a product worth buying.
                                            </h2>
                                            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                                                Owny should feel like a sharp creative operator: it pulls from your real source
                                                material, shapes the offer, and gives you a draft you can actually ship.
                                            </p>
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-5">
                                                <Bot className="size-4 text-slate-900" />
                                                <p className="mt-3 text-sm font-medium text-slate-900">Source-grounded</p>
                                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                                    Uses transcripts, clip cards, and creator voice as the foundation.
                                                </p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-5">
                                                <Sparkles className="size-4 text-amber-700" />
                                                <p className="mt-3 text-sm font-medium text-slate-900">Offer-aware</p>
                                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                                    Shapes the promise, positioning, and packaging before writing.
                                                </p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-5">
                                                <Rocket className="size-4 text-sky-700" />
                                                <p className="mt-3 text-sm font-medium text-slate-900">Ship-ready</p>
                                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                                    Drafts stream live so you can refine, publish, and sell faster.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.94))] p-5 text-white shadow-[0_32px_80px_-48px_rgba(15,23,42,0.85)]">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                <Wand2 className="size-3.5" />
                                                How it works
                                            </div>
                                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                <div>
                                                    <p className="text-sm font-medium">1. Pick the format</p>
                                                    <p className="mt-1 text-xs leading-5 text-slate-300">
                                                        Start from a guide, challenge, toolkit, or course.
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium">2. Build from evidence</p>
                                                    <p className="mt-1 text-xs leading-5 text-slate-300">
                                                        Owny pulls the strongest source clips and sections.
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium">3. Refine and publish</p>
                                                    <p className="mt-1 text-xs leading-5 text-slate-300">
                                                        Tighten the draft with short prompts, then push it live.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>

                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                    {SUGGESTIONS.map((suggestion, index) => (
                                        <motion.button
                                            key={suggestion.label}
                                            type="button"
                                            initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={
                                                shouldReduceMotion
                                                    ? { duration: 0 }
                                                    : { duration: 0.34, delay: 0.08 * index, ease: 'easeOut' }
                                            }
                                            whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.01 }}
                                            whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
                                            className={cn(
                                                'group rounded-[28px] border border-slate-200/80 bg-gradient-to-br p-5 text-left shadow-[0_24px_60px_-40px_rgba(15,23,42,0.3)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_32px_72px_-42px_rgba(15,23,42,0.35)]',
                                                suggestion.accent
                                            )}
                                            onClick={() => handleSubmit(suggestion.label)}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                        Starter format
                                                    </p>
                                                    <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                                                        {suggestion.label}
                                                    </p>
                                                </div>
                                                <span className="rounded-full border border-white/80 bg-white/70 p-2 text-slate-600 shadow-sm transition-transform duration-200 group-hover:translate-x-0.5">
                                                    <ArrowRight className="size-4" />
                                                </span>
                                            </div>
                                            <p className="mt-3 text-sm leading-6 text-slate-600">{suggestion.description}</p>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <form
                        className="border-t border-slate-200/60 bg-white/85 px-4 py-4 backdrop-blur sm:px-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_10px_35px_-24px_rgba(15,23,42,0.25)]">
                            <MessageSquareText className="ml-2 hidden size-4 text-slate-400 sm:block" />
                            <Input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Describe the product you want to build from your content..."
                                className="h-10 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                            />
                            <Button type="submit" size="sm" className="h-10 rounded-xl px-5" disabled={!input.trim()}>
                                <SendHorizonal />
                                Send
                            </Button>
                        </div>
                    </form>
                    {composerError && <p className="px-4 pb-2 text-xs text-red-700">{composerError}</p>}
                </>
            ) : (
                <>
                    <div className="border-b border-slate-200/80 bg-white/90 px-3 py-2.5 backdrop-blur lg:hidden">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors',
                                    activePane === 'assistant'
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_18px_34px_-24px_rgba(15,23,42,0.5)]'
                                        : 'border-slate-200 bg-white text-slate-600'
                                )}
                                onClick={() => setActivePane('assistant')}
                            >
                                <MessageSquareText className="size-4" />
                                Assistant
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors',
                                    activePane === 'preview'
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_18px_34px_-24px_rgba(15,23,42,0.5)]'
                                        : 'border-slate-200 bg-white text-slate-600'
                                )}
                                onClick={() => setActivePane('preview')}
                            >
                                <Eye className="size-4" />
                                Preview
                            </button>
                        </div>
                    </div>

                    <div className="border-b border-slate-200/80 bg-white/85 px-3 py-2.5 backdrop-blur lg:hidden">
                        <div className="flex flex-wrap items-center gap-2">
                            {versionHistory.length > 0 && (
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                    onClick={handleUndo}
                                    disabled={buildState.isBuilding}
                                >
                                    <RefreshCcw />
                                    Undo
                                </Button>
                            )}

                            {buildState.productId && publishStatus !== 'published' && (
                                <Button
                                    type="button"
                                    size="xs"
                                    onClick={() => void handlePublish()}
                                    disabled={buildState.isBuilding || publishStatus === 'publishing'}
                                >
                                    <Rocket />
                                    {publishStatus === 'publishing' ? 'Publishing...' : 'Publish'}
                                </Button>
                            )}

                            {publishStatus === 'published' && (
                                <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.08em]">
                                    Live
                                </Badge>
                            )}

                            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em] text-slate-600">
                                {buildState.isBuilding ? 'Syncing' : hasProduct ? 'Ready' : 'Idle'}
                            </Badge>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                        <section
                            className={cn(
                                'min-h-[42vh] min-w-0 flex-col border-b border-slate-200/60 bg-[linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.65))] lg:flex lg:min-h-0 lg:w-[38%] lg:max-w-[440px] lg:border-b-0 lg:border-r',
                                activePane === 'assistant' ? 'flex' : 'hidden'
                            )}
                        >
                            <div className="flex items-center justify-between border-b border-slate-200 bg-white/85 px-3 py-3 backdrop-blur sm:px-3.5">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={cn(
                                                'inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 text-slate-700',
                                                buildState.isBuilding && 'border-sky-200 bg-sky-100 text-sky-700'
                                            )}
                                        >
                                            <Bot className="size-3.5" />
                                        </span>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                            {buildState.isBuilding ? 'Builder running' : buildState.productId ? 'Refine the draft' : 'Assistant'}
                                        </p>
                                    </div>
                                    <p className="mt-1 text-sm font-medium text-slate-900">
                                        Tell Owny what to improve and it will update the live draft.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            'h-2 w-2 rounded-full bg-slate-400',
                                            buildState.isBuilding && 'animate-pulse bg-sky-500'
                                        )}
                                    />
                                    <Button type="button" size="xs" variant="ghost" onClick={handleClearChat}>
                                        <RefreshCcw />
                                        Clear
                                    </Button>
                                </div>
                            </div>

                            <AnimatePresence initial={false}>
                                {liveStatus && (
                                    <motion.div
                                        key={`${liveStatus.phase}-${liveStatus.headline}`}
                                        initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                                        transition={entryTransition}
                                        className="border-b border-slate-200 bg-white/70 px-3 py-3 backdrop-blur"
                                    >
                                        <div
                                        className={cn(
                                            'rounded-[24px] border px-4 py-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.28)]',
                                            liveStatus.tone === 'working' && 'border-sky-200 bg-sky-50/80',
                                            liveStatus.tone === 'success' && 'border-emerald-200 bg-emerald-50/80',
                                            liveStatus.tone === 'error' && 'border-rose-200 bg-rose-50/80'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                    {getFriendlyPhaseLabel(liveStatus.phase)}
                                                </p>
                                                <p className="mt-1 text-sm font-medium text-slate-900">{liveStatus.headline}</p>
                                                {liveStatus.detail && (
                                                    <p className="mt-1 text-xs leading-5 text-slate-600">{liveStatus.detail}</p>
                                                )}
                                            </div>
                                            {liveStatus.tone === 'working' && (
                                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-500 animate-pulse" />
                                            )}
                                        </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <motion.div
                                ref={messagesContainerRef}
                                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
                                layout
                                onScroll={(event) => {
                                    const container = event.currentTarget;
                                    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
                                    shouldAutoScrollRef.current = distanceFromBottom < 72;
                                }}
                            >
                                {messages.map((msg) => {
                                    const cleanContent = sanitizeMessageText(msg.content);
                                    const lines = cleanContent.split('\n').filter((line) => line.trim().length > 0);
                                    return (
                                        <motion.div
                                            key={msg.id}
                                            layout
                                            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={springTransition}
                                            className="space-y-1"
                                        >
                                            <div
                                                className={cn(
                                                    'max-w-[92%] rounded-[22px] border px-3.5 py-3 text-[13px] leading-5 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.28)]',
                                                    msg.role === 'user' && 'ml-auto rounded-br-md border-slate-900 bg-slate-900 text-white',
                                                    msg.role === 'assistant' && 'mr-auto rounded-bl-md border-white bg-white/95 text-slate-900'
                                                )}
                                            >
                                                {lines.length === 0
                                                    ? cleanContent
                                                    : lines.map((line, idx) => (
                                                        <p key={`${msg.id}-${idx}`} className={idx === lines.length - 1 ? '' : 'mb-1.5'}>
                                                            {line}
                                                        </p>
                                                    ))}
                                            </div>

                                            {msg.topicSuggestions && msg.topicSuggestions.length > 0 && (
                                                <div className="grid grid-cols-1 gap-2">
                                                    {msg.topicSuggestions.map((topic, index) => (
                                                        <motion.div
                                                            key={topic.topic}
                                                            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={
                                                                shouldReduceMotion
                                                                    ? { duration: 0 }
                                                                    : { duration: 0.24, delay: 0.03 * index, ease: 'easeOut' }
                                                            }
                                                        >
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="h-auto w-full items-start justify-between rounded-[22px] border-slate-200 bg-white px-3 py-3 text-left text-slate-700 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.28)]"
                                                                onClick={() => handleTopicSelect(topic)}
                                                                disabled={buildState.isBuilding}
                                                            >
                                                                <div className="min-w-0 pr-3">
                                                                    <p className="text-sm font-medium text-slate-900">{topic.topic}</p>
                                                                    {topic.problem && (
                                                                        <p className="mt-1 text-xs leading-5 text-slate-600">
                                                                            {topic.problem}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                                                                    {topic.videoCount}
                                                                </Badge>
                                                            </Button>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        </section>

                        <section
                            className={cn(
                                'min-h-[38vh] min-w-0 flex-1 flex-col bg-white lg:flex lg:min-h-0',
                                activePane === 'preview' ? 'flex' : 'hidden'
                            )}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-3 py-3 backdrop-blur sm:px-3.5">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 text-slate-700">
                                            <Eye className="size-3.5" />
                                        </span>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Preview</p>
                                    </div>
                                    <p className="mt-1 text-sm font-medium text-slate-900">
                                        Watch the product update live as sections stream in.
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {versionHistory.length > 0 && (
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                            onClick={handleUndo}
                                            disabled={buildState.isBuilding}
                                        >
                                            <RefreshCcw />
                                            Undo
                                        </Button>
                                    )}

                                    {buildState.productId && publishStatus !== 'published' && (
                                        <Button
                                            type="button"
                                            size="xs"
                                            onClick={() => void handlePublish()}
                                            disabled={buildState.isBuilding || publishStatus === 'publishing'}
                                        >
                                            <Rocket />
                                            {publishStatus === 'publishing' ? 'Publishing...' : 'Publish'}
                                        </Button>
                                    )}

                                    {publishStatus === 'published' && (
                                        <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.08em]">
                                            Live
                                        </Badge>
                                    )}

                                    <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em] text-slate-600">
                                        {buildState.isBuilding ? 'Syncing' : hasProduct ? 'Ready' : 'Idle'}
                                    </Badge>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.10),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-3 sm:p-4">
                                <LivePreview html={buildState.html} isLoading={buildState.isBuilding} />
                            </div>
                        </section>
                    </div>

                    <form
                        className="sticky bottom-0 z-20 border-t border-slate-200/60 bg-white/92 px-4 py-3.5 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_10px_35px_-24px_rgba(15,23,42,0.25)]">
                            <Layers3 className="ml-2 hidden size-4 text-slate-400 sm:block" />
                            <Input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={
                                    buildState.isBuilding
                                        ? 'Generation in progress...'
                                        : buildState.productId
                                            ? 'Refine the opening, CTA, pricing, layout, or structure...'
                                            : 'Tell the assistant what to build...'
                                }
                                className="h-10 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                                disabled={buildState.isBuilding}
                            />
                            <Button type="submit" size="sm" className="h-10 rounded-xl px-5" disabled={!input.trim() || buildState.isBuilding}>
                                <SendHorizonal />
                                Send
                            </Button>
                        </div>
                    </form>
                    {composerError && <p className="px-4 pb-2 text-xs text-red-700">{composerError}</p>}
                </>
            )}
        </div>
    );
}
