'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
    ArrowLeft,
    ArrowRight,
    Layers3,
    RefreshCcw,
    Rocket,
    SendHorizonal,
    Sparkles,
    Square,
    User,
} from 'lucide-react';
import LivePreview from './LivePreview';
import { cn, getApiErrorMessage, readJsonSafe } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/* ──────────────────────── Types ──────────────────────── */

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
    topicSuggestions?: TopicSuggestion[];
    productType?: string;
    refineSuggestions?: string[];
}

interface TopicSuggestion {
    topic: string;
    videoCount: number;
    problem?: string;
    promise?: string;
    supportingVideoIds?: string[];
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

/* ──────────────────── Constants ──────────────────────── */

const SUGGESTIONS = [
    { label: 'Create a PDF guide', description: 'Package your strongest lessons into a clean, premium lead magnet or paid guide.', icon: '📄', accent: 'border-amber-200/80 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50' },
    { label: 'Build a mini course', description: 'Turn recurring teaching moments into a concise course with a clear transformation.', icon: '🎓', accent: 'border-sky-200/80 bg-sky-50/50 hover:border-sky-300 hover:bg-sky-50' },
    { label: 'Make a 7-day challenge', description: 'Create a fast, high-accountability offer with daily steps and momentum hooks.', icon: '🔥', accent: 'border-emerald-200/80 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50' },
    { label: 'Create a checklist toolkit', description: 'Bundle templates, checklists, and operating systems buyers can use immediately.', icon: '✅', accent: 'border-fuchsia-200/80 bg-fuchsia-50/50 hover:border-fuchsia-300 hover:bg-fuchsia-50' },
];

const REFINE_SUGGESTIONS = [
    'Sharpen the opening hook',
    'Add a pricing section',
    'Make the CTA more urgent',
    'Shorten the intro',
];

const PROGRESS_STEPS = ['analyzing', 'retrieving', 'planning', 'building', 'saving'] as const;
const STEP_LABELS: Record<string, string> = {
    analyzing: 'Analyzing', retrieving: 'Selecting', planning: 'Planning',
    building: 'Designing', saving: 'Saving',
};

const MIN_PANEL_WIDTH = 300;
const DEFAULT_PANEL_WIDTH = 380;

const TOPIC_STOPWORDS = new Set([
    'your', 'you', 'create', 'make', 'guide', 'video', 'videos', 'content',
    'library', 'topic', 'topics', 'best', 'real', 'the', 'and', 'for', 'from',
    'owny', 'official', 'people', 'person', 'interested', 'anyone', 'someone',
    'understanding', 'thinking', 'things', 'thing', 'really', 'just', 'like',
    'know', 'think', 'going', 'want', 'need', 'look', 'feel', 'way', 'time',
    'life', 'work', 'working', 'talk', 'talking', 'try', 'trying', 'stuff',
    'question', 'questions', 'important', 'common', 'biggest', 'good', 'great',
    'number', 'why', 'how', 'what', 'who', 'when', 'where', 'which',
]);

/* ──────────────────── Helpers ──────────────────────── */

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

function filterTopicSuggestions(rawTopics: TopicSuggestion[], displayName: string): TopicSuggestion[] {
    const displayNameTokens = normalizeTextToken(displayName).split(/\s+/).filter((t) => t.length >= 3);
    const filter = (minCount: number) => rawTopics.filter((item) => {
        const topic = normalizeTextToken(item.topic);
        if (!topic || topic.length < 4) return false;
        if (TOPIC_STOPWORDS.has(topic)) return false;
        if (displayNameTokens.includes(topic)) return false;
        if (item.videoCount < minCount) return false;
        return true;
    });
    const strict = filter(2).slice(0, 6);
    return strict.length > 0 ? strict : filter(0).slice(0, 4);
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
            .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
    } catch { return []; }
}

function buildFriendlyStatus(message: string, phase: string, isImprove: boolean): LiveStatusState {
    const np = normalizePhase(phase);
    const lower = message.toLowerCase();
    if (lower.includes('critic')) return { phase: np, headline: isImprove ? 'Polishing the updated draft' : 'Polishing the draft', detail: 'Checking clarity, structure, and finish before saving.', tone: 'working' };
    const map: Record<string, LiveStatusState> = {
        analyzing: { phase: np, headline: 'Reviewing your content library', detail: 'Looking for the strongest source material.', tone: 'working' },
        retrieving: { phase: np, headline: 'Picking the strongest source clips', detail: 'Prioritizing useful videos and transcript moments.', tone: 'working' },
        planning: { phase: np, headline: isImprove ? 'Planning the revision' : 'Planning product structure', detail: 'Shaping angle, flow, and content structure.', tone: 'working' },
        building: { phase: np, headline: isImprove ? 'Applying your changes' : 'Designing the draft', detail: 'Building the product and refining visual structure.', tone: 'working' },
        saving: { phase: np, headline: isImprove ? 'Saving your changes' : 'Saving your draft', detail: 'Wrapping up the latest version.', tone: 'working' },
    };
    return map[np] || { phase: np, headline: isImprove ? 'Updating the product' : 'Working on the product', detail: message, tone: 'working' };
}

function relativeTime(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

/** Simple markdown-ish rendering for assistant messages */
function renderMarkdown(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
        if (listItems.length === 0) return;
        const Tag = listType === 'ol' ? 'ol' : 'ul';
        const cls = listType === 'ol' ? 'list-decimal' : 'list-disc';
        nodes.push(
            <Tag key={`list-${nodes.length}`} className={`${cls} pl-4 space-y-0.5 text-[13px] leading-5`}>
                {listItems.map((li, i) => <li key={i}>{inlineMarkdown(li)}</li>)}
            </Tag>
        );
        listItems = [];
        listType = null;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { flushList(); continue; }

        const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
        const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);

        if (ulMatch) {
            if (listType === 'ol') flushList();
            listType = 'ul';
            listItems.push(ulMatch[1]);
        } else if (olMatch) {
            if (listType === 'ul') flushList();
            listType = 'ol';
            listItems.push(olMatch[1]);
        } else {
            flushList();
            nodes.push(<p key={`p-${nodes.length}`} className="text-[13px] leading-5">{inlineMarkdown(trimmed)}</p>);
        }
    }
    flushList();
    return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
    // Bold **text**, inline `code`
    const parts: React.ReactNode[] = [];
    let last = 0;
    const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        if (match[2]) parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
        else if (match[3]) parts.push(<code key={key++} className="rounded bg-slate-100 px-1 py-0.5 text-[12px] font-mono text-slate-700">{match[3]}</code>);
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/* ──────────────── Progress Stepper ──────────────────── */

function ProgressStepper({ currentPhase }: { currentPhase: string }) {
    const normalized = normalizePhase(currentPhase);
    const currentIdx = PROGRESS_STEPS.indexOf(normalized as typeof PROGRESS_STEPS[number]);

    return (
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-100">
            {PROGRESS_STEPS.map((step, i) => {
                const isComplete = currentIdx > i;
                const isActive = currentIdx === i;
                const isPending = currentIdx < i;
                return (
                    <div key={step} className="flex items-center gap-1">
                        {i > 0 && (
                            <div className={cn('h-px w-3 sm:w-5 transition-colors duration-300', isComplete ? 'bg-emerald-400' : 'bg-slate-200')} />
                        )}
                        <div className="flex items-center gap-1.5">
                            <span className={cn(
                                'relative flex h-2 w-2 rounded-full transition-colors duration-300',
                                isComplete && 'bg-emerald-400',
                                isActive && 'bg-sky-500',
                                isPending && 'bg-slate-200',
                            )}>
                                {isActive && <span className="absolute inset-0 animate-ping rounded-full bg-sky-400 opacity-75" />}
                            </span>
                            <span className={cn(
                                'hidden text-[10px] font-medium uppercase tracking-[0.06em] sm:inline transition-colors duration-300',
                                isComplete && 'text-emerald-600',
                                isActive && 'text-sky-600',
                                isPending && 'text-slate-400',
                            )}>
                                {STEP_LABELS[step]}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ─────────────── Resizable Divider ──────────────────── */

function PanelDivider({ onResize, onDoubleClick }: { onResize: (deltaX: number) => void; onDoubleClick: () => void }) {
    const isDragging = useRef(false);
    const lastX = useRef(0);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        isDragging.current = true;
        lastX.current = e.clientX;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current) return;
        const delta = e.clientX - lastX.current;
        lastX.current = e.clientX;
        onResize(delta);
    }, [onResize]);

    const onPointerUp = useCallback(() => {
        isDragging.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    }, []);

    return (
        <div
            className="group relative z-10 flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
        >
            <div className="h-8 w-1 rounded-full bg-slate-200 transition-all group-hover:h-12 group-hover:bg-slate-400 group-active:bg-slate-500" />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   ProductBuilder
   ═══════════════════════════════════════════════════════ */

export function ProductBuilder({ creatorId, displayName, onProductCreated }: ProductBuilderProps) {
    const shouldReduceMotion = useReducedMotion();
    const [messages, setMessages] = useState<ChatMessage[]>(() => loadPersistedMessages(creatorId));
    const [input, setInput] = useState('');
    const [buildState, setBuildState] = useState<BuildState>({ productId: null, versionId: null, html: '', isBuilding: false, phase: '' });
    const [pendingProductType, setPendingProductType] = useState<string | null>(null);
    const [composerError, setComposerError] = useState<string | null>(null);
    const [versionHistory, setVersionHistory] = useState<VersionSnapshot[]>([]);
    const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published'>('idle');
    const [liveStatus, setLiveStatus] = useState<LiveStatusState | null>(null);
    const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
    const [isMounted, setIsMounted] = useState(false);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messageCounterRef = useRef(messages.length);
    const sectionCountRef = useRef(0);
    const shouldAutoScrollRef = useRef(true);

    // Track mount for portal
    useEffect(() => { setIsMounted(true); }, []); // eslint-disable-line react-hooks/set-state-in-effect

    // Auto-scroll chat
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container || !shouldAutoScrollRef.current) return;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    // Persist messages
    useEffect(() => {
        if (messages.length > 0) {
            try { localStorage.setItem(`owny-builder-${creatorId}`, JSON.stringify({ messages: messages.slice(-50) })); } catch { /* quota */ }
        }
    }, [messages, creatorId]);

    const maxPanelWidth = useMemo(() => {
        if (typeof window === 'undefined') return 600;
        return Math.floor(window.innerWidth * 0.5);
    }, []);

    const handlePanelResize = useCallback((delta: number) => {
        setPanelWidth((w) => Math.min(maxPanelWidth, Math.max(MIN_PANEL_WIDTH, w + delta)));
    }, [maxPanelWidth]);

    const resetPanelWidth = useCallback(() => setPanelWidth(DEFAULT_PANEL_WIDTH), []);

    const nextMessageId = () => { messageCounterRef.current += 1; return `msg-${messageCounterRef.current}`; };

    const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
        setMessages((prev) => [...prev, { ...msg, id: nextMessageId(), timestamp: new Date() }]);
    }, []);

    const stopActiveBuild = useCallback(() => {
        abortRef.current?.abort();
        setBuildState((s) => ({ ...s, isBuilding: false }));
        setLiveStatus({ phase: 'idle', headline: 'Generation stopped', detail: 'Adjust the prompt and run again.', tone: 'error' });
    }, []);

    // Keyboard shortcuts — declared after stopActiveBuild
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && buildState.isBuilding) {
                e.preventDefault();
                stopActiveBuild();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [buildState.isBuilding, stopActiveBuild]);

    /* ── SSE Stream Handler ── */
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
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });

                if (!res.ok) {
                    const errPayload = await readJsonSafe<{ error?: string }>(res);
                    const message = getApiErrorMessage(errPayload, 'Unable to start generation.');
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                    setLiveStatus({ phase: 'error', headline: 'Could not start the request', detail: message, tone: 'error' });
                    return;
                }

                const reader = res.body?.getReader();
                if (!reader) {
                    const message = 'No stream returned by the build endpoint.';
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                    setLiveStatus({ phase: 'error', headline: 'Could not start the request', detail: message, tone: 'error' });
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
                                const content = typeof event.message === 'string' ? event.message : 'Choose one topic to focus your product.';
                                const rawTopics = Array.isArray(event.topics) ? (event.topics as TopicSuggestion[]) : [];
                                const topicSuggestions = filterTopicSuggestions(rawTopics, displayName);
                                addMessage({
                                    role: 'assistant', content, topicSuggestions,
                                    productType: typeof event.productType === 'string' ? event.productType : undefined,
                                });
                                setBuildState((s) => ({ ...s, isBuilding: false }));
                                setPendingProductType(typeof event.productType === 'string' ? event.productType : null);
                                setLiveStatus({ phase: 'analyzing', headline: 'Choose the topic to focus', detail: 'Pick one direction and the draft will be built.', tone: 'working' });
                                continue;
                            }

                            if (eventType === 'source_videos') {
                                const videos = Array.isArray(event.videos) ? event.videos as SourceVideo[] : [];
                                if (videos.length > 0) {
                                    setLiveStatus((c) => ({ phase: 'retrieving', headline: c?.headline || 'Selecting source videos', detail: `Using ${videos.length} source videos.`, tone: 'working' }));
                                }
                                continue;
                            }

                            if (eventType === 'html_chunk' || eventType === 'html_complete') {
                                const htmlStr = typeof event.html === 'string' ? event.html : '';
                                const sectionMatches = htmlStr.match(/<(?:h2|section\s+id=)[^>]*>/gi);
                                const currentSections = sectionMatches ? sectionMatches.length : 0;
                                if (currentSections > sectionCountRef.current) {
                                    sectionCountRef.current = currentSections;
                                    const lastH2 = htmlStr.match(/<h2[^>]*>([^<]{3,60})/gi);
                                    if (lastH2 && lastH2.length > 0) {
                                        const titleText = lastH2[lastH2.length - 1].replace(/<[^>]*>/g, '').trim();
                                        if (titleText) {
                                            setLiveStatus({ phase: 'building', headline: isImprove ? 'Updating the draft' : 'Designing the draft', detail: `Section ${currentSections}: ${titleText}`, tone: 'working' });
                                        }
                                    }
                                }
                                setBuildState((s) => ({ ...s, html: htmlStr }));
                                continue;
                            }

                            if (eventType === 'complete') {
                                const videosUsed = typeof event.videosUsed === 'number' ? event.videosUsed : null;
                                const title = typeof event.title === 'string' ? event.title : 'Your product';
                                setBuildState((s) => {
                                    if (s.html) {
                                        setVersionHistory((prev) => [...prev, { html: s.html, versionId: s.versionId, label: isImprove ? `Before: ${title}` : `v${prev.length + 1}` }]);
                                    }
                                    return { ...s, productId: typeof event.productId === 'string' ? event.productId : s.productId, versionId: typeof event.versionId === 'string' ? event.versionId : s.versionId, isBuilding: false, phase: 'complete' };
                                });
                                if (isImprove) {
                                    addMessage({ role: 'assistant', content: 'Updated. The latest changes are now in the draft.', refineSuggestions: REFINE_SUGGESTIONS });
                                    setLiveStatus({ phase: 'complete', headline: 'Changes saved', detail: 'Keep refining or publish when ready.', tone: 'success' });
                                } else {
                                    addMessage({
                                        role: 'assistant',
                                        content: `"${title}" is ready.${videosUsed ? ` Built from ${videosUsed} source videos.` : ''} Refine the draft or publish when it feels right.`,
                                        refineSuggestions: REFINE_SUGGESTIONS,
                                    });
                                    setLiveStatus({ phase: 'complete', headline: 'Draft ready', detail: 'Ready for edits or publishing.', tone: 'success' });
                                    onProductCreated();
                                }
                                continue;
                            }

                            if (eventType === 'error') {
                                const message = typeof event.message === 'string' ? event.message : 'Generation failed.';
                                addMessage({ role: 'assistant', content: `Error: ${message}` });
                                setComposerError(message);
                                setBuildState((s) => ({ ...s, isBuilding: false }));
                                setLiveStatus({ phase: 'error', headline: 'Could not finish this request', detail: message, tone: 'error' });
                            }
                        } catch { /* malformed chunk */ }
                    }
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    const message = 'Connection lost while generating. Please retry.';
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                    setLiveStatus({ phase: 'error', headline: 'Connection lost', detail: message, tone: 'error' });
                }
            }
        },
        [addMessage, buildState.phase, displayName, onProductCreated]
    );

    const handleTopicSelect = useCallback((topic: TopicSuggestion) => {
        addMessage({ role: 'user', content: topic.topic });
        handleStream('/api/products/build', {
            creatorId, message: topic.topic, productType: pendingProductType || 'pdf_guide',
            confirmedTopic: topic.topic, confirmedTopicProblem: topic.problem,
            confirmedTopicPromise: topic.promise, confirmedTopicSupportingVideoIds: topic.supportingVideoIds || [],
        });
    }, [creatorId, pendingProductType, addMessage, handleStream]);

    const handleSubmit = useCallback(async (prompt?: string) => {
        const text = (prompt || input).trim();
        if (!text || buildState.isBuilding) return;
        addMessage({ role: 'user', content: text });
        setInput('');
        setLiveStatus(null);
        if (buildState.productId && buildState.html) {
            handleStream('/api/products/improve', { productId: buildState.productId, instruction: text, currentHtml: buildState.html }, true);
            return;
        }
        handleStream('/api/products/build', { creatorId, message: text });
    }, [input, buildState, creatorId, addMessage, handleStream]);

    const handleUndo = useCallback(() => {
        if (versionHistory.length === 0) return;
        const prev = versionHistory[versionHistory.length - 1];
        setBuildState((s) => ({ ...s, html: prev.html, versionId: prev.versionId }));
        setVersionHistory((h) => h.slice(0, -1));
        setLiveStatus({ phase: 'complete', headline: 'Draft reverted', detail: `Restored ${prev.label}.`, tone: 'success' });
    }, [versionHistory]);

    const handlePublish = useCallback(async () => {
        if (!buildState.productId) return;
        setPublishStatus('publishing');
        try {
            const res = await fetch(`/api/products/${buildState.productId}/publish`, { method: 'POST' });
            if (res.ok) {
                setPublishStatus('published');
                addMessage({ role: 'assistant', content: 'Product published. It is now live on your storefront.' });
                setLiveStatus({ phase: 'complete', headline: 'Published', detail: 'Live on your storefront.', tone: 'success' });
                onProductCreated();
            } else {
                setPublishStatus('idle');
                addMessage({ role: 'assistant', content: 'Could not publish. Please try again.' });
                setLiveStatus({ phase: 'error', headline: 'Publish failed', detail: 'Please retry.', tone: 'error' });
            }
        } catch { setPublishStatus('idle'); }
    }, [buildState.productId, addMessage, onProductCreated]);

    const handleClearChat = useCallback(() => {
        setMessages([]);
        setBuildState({ productId: null, versionId: null, html: '', isBuilding: false, phase: '' });
        setVersionHistory([]);
        setPublishStatus('idle');
        setLiveStatus(null);
        localStorage.removeItem(`owny-builder-${creatorId}`);
    }, [creatorId]);

    const hasProduct = buildState.html.length > 0;
    const showWelcome = !hasProduct && !buildState.isBuilding && messages.length === 0;
    const isActive = !showWelcome;
    const entryTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.36, ease: 'easeOut' as const };
    const springTransition = shouldReduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 240, damping: 24, mass: 0.9 };

    /* ── Input bar (shared between welcome and active) ── */
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleSubmit();
        }
    }, [handleSubmit]);

    /* ── Chat panel content (reusable) ── */
    const chatPanel = (
        <div className="flex h-full flex-col bg-white" style={{ width: isActive && isMounted ? panelWidth : undefined }}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 px-4 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleClearChat}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
                        title="Exit builder"
                    >
                        <ArrowLeft className="size-3.5" />
                        <span className="hidden sm:inline font-medium">Exit</span>
                    </button>
                    <span className="h-4 w-px bg-slate-200" />
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                        <Sparkles className="size-3.5 text-amber-600" />
                        <span>Builder</span>
                        <span className={cn('h-1.5 w-1.5 rounded-full', buildState.isBuilding ? 'animate-pulse bg-sky-400' : 'bg-emerald-400')} />
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {buildState.isBuilding && (
                        <Button type="button" size="xs" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={stopActiveBuild} title="Stop (Esc)">
                            <Square className="size-3" />
                        </Button>
                    )}
                    {versionHistory.length > 0 && (
                        <Button type="button" size="xs" variant="outline" onClick={handleUndo} disabled={buildState.isBuilding} title="Undo">
                            <RefreshCcw className="size-3" />
                        </Button>
                    )}
                    {buildState.productId && publishStatus !== 'published' && (
                        <Button type="button" size="xs" onClick={() => void handlePublish()} disabled={buildState.isBuilding || publishStatus === 'publishing'}>
                            <Rocket className="size-3" />
                            <span className="hidden sm:inline">{publishStatus === 'publishing' ? 'Publishing...' : 'Publish'}</span>
                        </Button>
                    )}
                    {publishStatus === 'published' && (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.08em]">Live</Badge>
                    )}
                </div>
            </div>

            {/* Progress stepper — only while building */}
            <AnimatePresence initial={false}>
                {buildState.isBuilding && buildState.phase && (
                    <motion.div
                        key="stepper"
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden flex-shrink-0"
                    >
                        <ProgressStepper currentPhase={buildState.phase} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Live status — slim inline */}
            <AnimatePresence initial={false}>
                {liveStatus && (
                    <motion.div
                        key={`${liveStatus.phase}-${liveStatus.headline}`}
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-b border-slate-100 flex-shrink-0"
                    >
                        <div className={cn(
                            'flex items-center gap-2.5 px-4 py-2',
                            liveStatus.tone === 'working' && 'bg-sky-50/50',
                            liveStatus.tone === 'success' && 'bg-emerald-50/50',
                            liveStatus.tone === 'error' && 'bg-rose-50/50',
                        )}>
                            {liveStatus.tone === 'working' && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500 animate-pulse" />}
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-900 truncate">{liveStatus.headline}</p>
                                {liveStatus.detail && <p className="text-[11px] text-slate-500 truncate">{liveStatus.detail}</p>}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chat messages */}
            <div
                ref={messagesContainerRef}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 builder-scrollbar"
                onScroll={(e) => {
                    const c = e.currentTarget;
                    shouldAutoScrollRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 72;
                }}
            >
                {messages.map((msg) => {
                    const cleanContent = sanitizeMessageText(msg.content);
                    return (
                        <motion.div
                            key={msg.id}
                            layout
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={springTransition}
                            className={cn('flex items-start gap-2', msg.role === 'user' ? 'flex-row-reverse' : '')}
                        >
                            <span className={cn(
                                'mt-0.5 flex-shrink-0 rounded-full p-1.5',
                                msg.role === 'assistant' ? 'bg-gradient-to-br from-amber-100 to-sky-100 text-slate-700' : 'bg-slate-900 text-white'
                            )}>
                                {msg.role === 'assistant' ? <Sparkles className="size-2.5" /> : <User className="size-2.5" />}
                            </span>

                            <div className={cn('max-w-[85%]', msg.role === 'user' && 'text-right')}>
                                <div className={cn(
                                    'rounded-xl border px-3 py-2',
                                    msg.role === 'user' && 'border-slate-900 bg-slate-900 text-white text-[13px] leading-5',
                                    msg.role === 'assistant' && 'border-slate-200 bg-white text-slate-900 space-y-1'
                                )}>
                                    {msg.role === 'assistant' ? renderMarkdown(cleanContent) : (
                                        cleanContent.split('\n').filter((l) => l.trim()).map((line, idx) => (
                                            <p key={`${msg.id}-${idx}`} className="text-[13px] leading-5">{line}</p>
                                        ))
                                    )}
                                </div>
                                <span className="mt-0.5 block text-[10px] text-slate-400">{relativeTime(msg.timestamp)}</span>

                                {/* Topic suggestion cards */}
                                {msg.topicSuggestions && msg.topicSuggestions.length > 0 && (
                                    <div className="mt-2 flex flex-col gap-1.5">
                                        {msg.topicSuggestions.map((topic, index) => (
                                            <motion.div
                                                key={topic.topic}
                                                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, delay: 0.04 * index, ease: 'easeOut' as const }}
                                            >
                                                <button
                                                    type="button"
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm disabled:opacity-40"
                                                    onClick={() => handleTopicSelect(topic)}
                                                    disabled={buildState.isBuilding}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-medium text-slate-900">{topic.topic}</span>
                                                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] flex-shrink-0">{topic.videoCount} videos</Badge>
                                                    </div>
                                                    {topic.problem && <p className="mt-1 text-[11px] text-slate-500 line-clamp-1">{topic.problem}</p>}
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {/* Post-build refine suggestions */}
                                {msg.refineSuggestions && msg.refineSuggestions.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {msg.refineSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm disabled:opacity-40"
                                                onClick={() => void handleSubmit(suggestion)}
                                                disabled={buildState.isBuilding}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}

                {/* Typing indicator */}
                {buildState.isBuilding && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2">
                        <span className="mt-0.5 flex-shrink-0 rounded-full p-1.5 bg-gradient-to-br from-amber-100 to-sky-100 text-slate-700">
                            <Sparkles className="size-2.5" />
                        </span>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-1.5">
                            <span className="flex gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                            </span>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Input bar */}
            <form
                className="border-t border-slate-200/60 bg-white px-3 py-3 flex-shrink-0"
                onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
            >
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-1.5">
                    <Layers3 className="hidden size-3.5 text-slate-400 sm:block" />
                    <Input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            buildState.isBuilding ? 'Generation in progress...'
                                : buildState.productId ? 'Refine the draft...' : 'Describe the product...'
                        }
                        className="h-9 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                        disabled={buildState.isBuilding}
                    />
                    <div className="flex items-center gap-1.5">
                        <kbd className="hidden rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium text-slate-400 sm:inline">⌘↵</kbd>
                        <Button type="submit" size="sm" className="h-8 rounded-lg px-3" disabled={!input.trim() || buildState.isBuilding}>
                            <SendHorizonal className="size-3.5" />
                        </Button>
                    </div>
                </div>
                {composerError && <p className="mt-1.5 text-xs text-red-700">{composerError}</p>}
            </form>
        </div>
    );

    /* ── WELCOME STATE ── */
    if (showWelcome) {
        return (
            <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))]">
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
                    <motion.div
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={entryTransition}
                        className="w-full max-w-2xl text-center"
                    >
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800 mb-5">
                            <Sparkles className="size-3" />
                            Build mode
                        </div>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">What do you want to build?</h2>
                        <p className="mt-3 text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                            Pick a format below or describe the product you want. Owny will pull from your real source material and shape the offer for you.
                        </p>
                    </motion.div>

                    <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                        {SUGGESTIONS.map((s, i) => (
                            <motion.button
                                key={s.label}
                                type="button"
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.06 * i, ease: 'easeOut' as const }}
                                whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.01 }}
                                whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
                                className={cn('group rounded-2xl border p-5 text-left transition-all duration-200 shadow-sm hover:shadow-md', s.accent)}
                                onClick={() => handleSubmit(s.label)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <span className="text-2xl">{s.icon}</span>
                                        <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">{s.label}</p>
                                    </div>
                                    <span className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm transition group-hover:translate-x-0.5 group-hover:text-slate-700">
                                        <ArrowRight className="size-3.5" />
                                    </span>
                                </div>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
                            </motion.button>
                        ))}
                    </div>
                </div>

                <form
                    className="border-t border-slate-200/60 bg-white/85 px-4 py-4 backdrop-blur sm:px-5"
                    onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
                >
                    <div className="mx-auto flex max-w-2xl items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_10px_35px_-24px_rgba(15,23,42,0.25)]">
                        <Sparkles className="ml-2 hidden size-4 text-slate-400 sm:block" />
                        <Input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Or describe the product you want to build..."
                            className="h-10 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                        />
                        <div className="flex items-center gap-1.5">
                            <kbd className="hidden rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium text-slate-400 sm:inline">⌘↵</kbd>
                            <Button type="submit" size="sm" className="h-10 rounded-xl px-5" disabled={!input.trim()}>
                                <SendHorizonal />
                                Build
                            </Button>
                        </div>
                    </div>
                </form>
                {composerError && <p className="px-4 pb-2 text-xs text-red-700">{composerError}</p>}
            </div>
        );
    }

    /* ── ACTIVE STATE — Full-screen portal ── */
    const activeContent = (
        <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex bg-white"
        >
            {/* Chat sidebar */}
            <div className="flex-shrink-0 border-r border-slate-200/60" style={{ width: panelWidth }}>
                {chatPanel}
            </div>

            {/* Resizable divider */}
            <PanelDivider onResize={handlePanelResize} onDoubleClick={resetPanelWidth} />

            {/* Preview */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.05),transparent_28%),linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-2 sm:p-3">
                    <LivePreview html={buildState.html} isLoading={buildState.isBuilding} />
                </div>
            </section>
        </motion.div>
    );

    // Render the active state inside a portal to cover the full viewport
    if (isMounted && typeof document !== 'undefined') {
        return createPortal(activeContent, document.body);
    }

    // SSR fallback — render inline
    return activeContent;
}
