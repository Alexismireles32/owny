'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import LivePreview from './LivePreview';
import { getApiErrorMessage, readJsonSafe } from '@/lib/utils';

interface ProductBuilderProps {
    creatorId: string;
    displayName: string;
    onProductCreated: () => void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'status';
    content: string;
    timestamp: Date;
    topicSuggestions?: { topic: string; videoCount: number }[];
    productType?: string;
}

interface BuildState {
    productId: string | null;
    versionId: string | null;
    html: string;
    isBuilding: boolean;
    phase: string;
}

type PreviewMode = 'desktop' | 'tablet' | 'mobile';

interface VersionSnapshot {
    html: string;
    versionId: string | null;
    label: string;
}

interface SourceVideo {
    title: string;
    views: number;
}

const SUGGESTIONS = [
    { icon: 'DOC', label: 'Create a PDF guide', type: 'pdf_guide' as const },
    { icon: 'CRS', label: 'Build a mini course', type: 'mini_course' as const },
    { icon: '7DY', label: 'Make a 7-day challenge', type: 'challenge_7day' as const },
    { icon: 'KIT', label: 'Create a checklist toolkit', type: 'checklist_toolkit' as const },
];

const BUILD_PHASES = [
    { key: 'analyzing', label: 'Analyze' },
    { key: 'retrieving', label: 'Retrieve' },
    { key: 'planning', label: 'Plan' },
    { key: 'building', label: 'Build' },
    { key: 'saving', label: 'Save' },
] as const;

function normalizePhase(phase: string): string {
    if (phase === 'init') return 'analyzing';
    if (phase === 'reranking' || phase === 'extracting') return 'retrieving';
    if (phase === 'fallback') return 'building';
    if (phase === 'complete') return 'saving';
    return phase;
}

function phaseIndex(phase: string): number {
    const normalized = normalizePhase(phase);
    const idx = BUILD_PHASES.findIndex((item) => item.key === normalized);
    return idx >= 0 ? idx : 0;
}

function sanitizeMessageText(content: string): string {
    return content.replace(/\*\*(.*?)\*\*/g, '$1').trim();
}

function formatMessageTime(value: Date): string {
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function loadPersistedMessages(creatorId: string): ChatMessage[] {
    if (typeof window === 'undefined') return [];

    try {
        const saved = window.localStorage.getItem(`owny-builder-${creatorId}`);
        if (!saved) return [];

        const parsed = JSON.parse(saved) as { messages?: ChatMessage[] };
        if (!Array.isArray(parsed.messages)) return [];

        return parsed.messages.map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
        }));
    } catch {
        return [];
    }
}

export function ProductBuilder({ creatorId, displayName, onProductCreated }: ProductBuilderProps) {
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
    const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
    const [versionHistory, setVersionHistory] = useState<VersionSnapshot[]>([]);
    const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published'>('idle');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messageCounterRef = useRef(messages.length);
    const sectionCountRef = useRef(0);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        addMessage({ role: 'status', content: 'Build canceled. You can edit your prompt and run again.' });
    }, [addMessage]);

    const handleStream = useCallback(
        async (url: string, body: Record<string, unknown>, isImprove = false) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setBuildState((s) => ({ ...s, isBuilding: true, phase: 'init', ...(isImprove ? {} : { html: '' }) }));
            setComposerError(null);

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
                    return;
                }

                const reader = res.body?.getReader();
                if (!reader) {
                    const message = 'No stream returned by the build endpoint.';
                    addMessage({ role: 'assistant', content: `Error: ${message}` });
                    setComposerError(message);
                    setBuildState((s) => ({ ...s, isBuilding: false }));
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
                                addMessage({ role: 'status', content: statusMessage });
                                setBuildState((s) => ({ ...s, phase: typeof event.phase === 'string' ? event.phase : s.phase }));
                                continue;
                            }

                            if (eventType === 'topic_suggestions') {
                                const content = typeof event.message === 'string'
                                    ? event.message
                                    : 'Choose one topic to focus your product.';
                                addMessage({
                                    role: 'assistant',
                                    content,
                                    topicSuggestions: Array.isArray(event.topics)
                                        ? (event.topics as { topic: string; videoCount: number }[])
                                        : [],
                                    productType: typeof event.productType === 'string' ? event.productType : undefined,
                                });
                                setBuildState((s) => ({ ...s, isBuilding: false }));
                                setPendingProductType(typeof event.productType === 'string' ? event.productType : null);
                                continue;
                            }

                            if (eventType === 'source_videos') {
                                const videos = Array.isArray(event.videos) ? event.videos as SourceVideo[] : [];
                                if (videos.length > 0) {
                                    addMessage({
                                        role: 'status',
                                        content: `📹 Using ${videos.length} videos: ${videos.slice(0, 3).map(v => `"${v.title}"`).join(', ')}${videos.length > 3 ? ` +${videos.length - 3} more` : ''}`,
                                    });
                                }
                                continue;
                            }

                            if (eventType === 'html_chunk' || eventType === 'html_complete') {
                                const htmlStr = typeof event.html === 'string' ? event.html : '';
                                // Detect sections being written for progress
                                const sectionMatches = htmlStr.match(/<(?:h2|section\s+id=)[^>]*>/gi);
                                const currentSections = sectionMatches ? sectionMatches.length : 0;
                                if (currentSections > sectionCountRef.current) {
                                    sectionCountRef.current = currentSections;
                                    // Extract the latest section title
                                    const lastH2 = htmlStr.match(/<h2[^>]*>([^<]{3,60})/gi);
                                    if (lastH2 && lastH2.length > 0) {
                                        const titleText = lastH2[lastH2.length - 1].replace(/<[^>]*>/g, '').trim();
                                        if (titleText) {
                                            addMessage({
                                                role: 'status',
                                                content: `✏️ Writing section ${currentSections}: ${titleText}...`,
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
                                    addMessage({ role: 'assistant', content: 'Changes applied. Continue refining with another instruction.' });
                                } else {
                                    addMessage({
                                        role: 'assistant',
                                        content: `"${title}" is ready.${videosUsed ? ` Built from ${videosUsed} top videos.` : ''} Keep iterating in the chat to sharpen the final version.`,
                                    });
                                    onProductCreated();
                                }
                                continue;
                            }

                            if (eventType === 'error') {
                                const message = typeof event.message === 'string' ? event.message : 'Generation failed.';
                                addMessage({ role: 'assistant', content: `Error: ${message}` });
                                setComposerError(message);
                                setBuildState((s) => ({ ...s, isBuilding: false }));
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
                    setBuildState((s) => ({ ...s, isBuilding: false }));
                }
            }
        },
        [addMessage, onProductCreated]
    );

    const handleTopicSelect = useCallback(
        (topic: string) => {
            addMessage({ role: 'user', content: topic });
            handleStream('/api/products/build', {
                creatorId,
                message: topic,
                productType: pendingProductType || 'pdf_guide',
                confirmedTopic: topic,
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
    const activeStep = phaseIndex(buildState.phase);

    const handleUndo = useCallback(() => {
        if (versionHistory.length === 0) return;
        const prev = versionHistory[versionHistory.length - 1];
        setBuildState((s) => ({ ...s, html: prev.html, versionId: prev.versionId }));
        setVersionHistory((h) => h.slice(0, -1));
        addMessage({ role: 'status', content: `↩️ Reverted to ${prev.label}` });
    }, [versionHistory, addMessage]);

    const handlePublish = useCallback(async () => {
        if (!buildState.productId) return;
        setPublishStatus('publishing');
        try {
            const res = await fetch(`/api/products/${buildState.productId}/publish`, { method: 'POST' });
            if (res.ok) {
                setPublishStatus('published');
                addMessage({ role: 'assistant', content: '🎉 Product published! It\'s now live on your storefront.' });
                onProductCreated();
            } else {
                setPublishStatus('idle');
                addMessage({ role: 'assistant', content: 'Could not publish. Please try again.' });
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
        localStorage.removeItem(`owny-builder-${creatorId}`);
    }, [creatorId]);

    return (
        <div className="builder-root">
            <style>{`
                .builder-root {
                    --bg-a: #091320;
                    --bg-b: #101d2e;
                    --bg-c: #16263b;
                    --surface: rgba(255, 255, 255, 0.06);
                    --surface-strong: rgba(255, 255, 255, 0.1);
                    --line: rgba(255, 255, 255, 0.14);
                    --text: #e2e8f0;
                    --muted: rgba(226, 232, 240, 0.62);
                    --accent: #22d3ee;
                    --accent-strong: #0891b2;
                    --highlight: #f59e0b;
                    position: relative;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    color: var(--text);
                    background:
                        radial-gradient(700px 260px at 18% -5%, rgba(34, 211, 238, 0.16), transparent 60%),
                        radial-gradient(800px 260px at 92% -4%, rgba(245, 158, 11, 0.15), transparent 62%),
                        linear-gradient(145deg, var(--bg-a), var(--bg-b) 52%, var(--bg-c));
                    overflow: hidden;
                }
                .builder-root::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    opacity: 0.26;
                    background-image:
                        linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
                    background-size: 30px 30px;
                    mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent 92%);
                }
                .builder-content {
                    position: relative;
                    z-index: 1;
                    display: flex;
                    flex: 1;
                    min-height: 0;
                    flex-direction: column;
                }
                .builder-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.9rem 1rem;
                    border-bottom: 1px solid var(--line);
                    background: rgba(5, 12, 22, 0.42);
                    backdrop-filter: blur(12px);
                }
                .builder-top-left {
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                }
                .builder-pill {
                    padding: 0.3rem 0.55rem;
                    border-radius: 999px;
                    font-size: 0.62rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    font-weight: 700;
                    border: 1px solid rgba(34, 211, 238, 0.38);
                    color: #67e8f9;
                    background: rgba(34, 211, 238, 0.12);
                }
                .builder-title {
                    font-size: 0.86rem;
                    font-weight: 600;
                    color: rgba(226, 232, 240, 0.92);
                }
                .builder-top-right {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .builder-phase {
                    display: flex;
                    gap: 0.45rem;
                    align-items: center;
                }
                .builder-phase-item {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    color: var(--muted);
                    font-size: 0.65rem;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                .builder-phase-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    border: 1px solid rgba(148, 163, 184, 0.4);
                    background: transparent;
                    transition: all 0.25s ease;
                }
                .builder-phase-item.done .builder-phase-dot,
                .builder-phase-item.active .builder-phase-dot {
                    border-color: rgba(34, 211, 238, 0.8);
                    background: linear-gradient(140deg, var(--accent), var(--highlight));
                    box-shadow: 0 0 10px rgba(34, 211, 238, 0.45);
                }
                .builder-phase-item.active {
                    color: rgba(226, 232, 240, 0.92);
                }
                .builder-stop {
                    border: 1px solid rgba(248, 113, 113, 0.45);
                    background: rgba(248, 113, 113, 0.14);
                    color: #fecaca;
                    border-radius: 999px;
                    padding: 0.3rem 0.7rem;
                    font-size: 0.66rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .builder-stop:hover {
                    background: rgba(248, 113, 113, 0.2);
                }
                .builder-welcome {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 2rem 1.5rem 1.4rem;
                    gap: 1.4rem;
                }
                .builder-welcome-card {
                    width: min(820px, 100%);
                    border-radius: 1.25rem;
                    border: 1px solid var(--line);
                    background: rgba(7, 15, 28, 0.62);
                    box-shadow: 0 24px 40px rgba(0, 0, 0, 0.2);
                    padding: 1.7rem;
                }
                .builder-welcome-headline {
                    font-size: clamp(1.3rem, 2.4vw, 2rem);
                    line-height: 1.1;
                    letter-spacing: -0.02em;
                    margin: 0;
                    color: #f8fafc;
                }
                .builder-welcome-copy {
                    margin: 0.75rem 0 0;
                    color: var(--muted);
                    max-width: 56ch;
                    line-height: 1.55;
                    font-size: 0.92rem;
                }
                .builder-suggestion-grid {
                    margin-top: 1.2rem;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.65rem;
                }
                .builder-suggestion {
                    border: 1px solid var(--line);
                    border-radius: 0.95rem;
                    background: linear-gradient(145deg, rgba(14, 27, 45, 0.84), rgba(18, 37, 58, 0.78));
                    color: rgba(226, 232, 240, 0.9);
                    text-align: left;
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                    padding: 0.75rem 0.85rem;
                    font-size: 0.78rem;
                    cursor: pointer;
                    transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
                    font-family: inherit;
                }
                .builder-suggestion:hover {
                    transform: translateY(-2px);
                    border-color: rgba(34, 211, 238, 0.4);
                    box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.22), 0 12px 24px rgba(0, 0, 0, 0.2);
                }
                .builder-suggestion-tag {
                    min-width: 2.4rem;
                    text-align: center;
                    font-weight: 700;
                    font-size: 0.62rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    border-radius: 0.5rem;
                    border: 1px solid rgba(34, 211, 238, 0.35);
                    background: rgba(34, 211, 238, 0.11);
                    color: #67e8f9;
                    padding: 0.28rem 0.35rem;
                    flex-shrink: 0;
                }
                .builder-layout {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    gap: 0;
                }
                .builder-chat {
                    width: min(360px, 44%);
                    border-right: 1px solid var(--line);
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    background: rgba(5, 12, 24, 0.45);
                }
                .builder-chat-header {
                    padding: 0.8rem 0.95rem;
                    border-bottom: 1px solid var(--line);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 0.6rem;
                    background: rgba(5, 12, 24, 0.68);
                }
                .builder-chat-status {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.68rem;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--muted);
                }
                .builder-chat-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #94a3b8;
                    opacity: 0.8;
                }
                .builder-chat-dot.live {
                    background: linear-gradient(145deg, var(--accent), var(--highlight));
                    box-shadow: 0 0 10px rgba(34, 211, 238, 0.45);
                    animation: pulseDot 1.3s ease-in-out infinite;
                }
                @keyframes pulseDot {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(0.8); opacity: 0.55; }
                }
                .builder-chat-messages {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    padding: 0.9rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.62rem;
                }
                .builder-msg-wrap {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .builder-msg {
                    border-radius: 0.9rem;
                    border: 1px solid transparent;
                    padding: 0.56rem 0.7rem;
                    font-size: 0.78rem;
                    line-height: 1.55;
                    max-width: 95%;
                    animation: fadeUp 0.2s ease;
                }
                @keyframes fadeUp {
                    from { transform: translateY(4px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .builder-msg.user {
                    align-self: flex-end;
                    background: linear-gradient(140deg, rgba(34, 211, 238, 0.9), rgba(14, 116, 144, 0.95));
                    color: #082f49;
                    border-bottom-right-radius: 0.25rem;
                    border-color: rgba(34, 211, 238, 0.35);
                }
                .builder-msg.assistant {
                    align-self: flex-start;
                    background: rgba(226, 232, 240, 0.07);
                    border-color: rgba(226, 232, 240, 0.12);
                    color: rgba(241, 245, 249, 0.94);
                    border-bottom-left-radius: 0.25rem;
                }
                .builder-msg.status {
                    align-self: center;
                    background: rgba(245, 158, 11, 0.12);
                    border-color: rgba(245, 158, 11, 0.28);
                    color: #fde68a;
                    max-width: 100%;
                    font-size: 0.7rem;
                    letter-spacing: 0.02em;
                }
                .builder-msg-time {
                    font-size: 0.62rem;
                    color: rgba(226, 232, 240, 0.35);
                    align-self: flex-start;
                }
                .builder-msg-wrap.user .builder-msg-time {
                    align-self: flex-end;
                }
                .builder-topic-chips {
                    margin-top: 0.35rem;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.35rem;
                }
                .builder-topic-chip {
                    border: 1px solid rgba(34, 211, 238, 0.28);
                    background: rgba(34, 211, 238, 0.13);
                    color: #a5f3fc;
                    border-radius: 999px;
                    padding: 0.3rem 0.58rem;
                    font-size: 0.66rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3rem;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s ease;
                }
                .builder-topic-chip:hover {
                    background: rgba(34, 211, 238, 0.22);
                    border-color: rgba(34, 211, 238, 0.46);
                    transform: translateY(-1px);
                }
                .builder-topic-chip:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                    transform: none;
                }
                .builder-topic-count {
                    border-radius: 999px;
                    padding: 0.1rem 0.4rem;
                    font-size: 0.58rem;
                    background: rgba(7, 20, 35, 0.55);
                    color: rgba(226, 232, 240, 0.7);
                }
                .builder-preview {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    background: rgba(4, 10, 20, 0.48);
                }
                .builder-preview-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid var(--line);
                    background: rgba(4, 10, 20, 0.78);
                }
                .builder-preview-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    font-size: 0.68rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--muted);
                    font-weight: 600;
                }
                .builder-preview-badge {
                    border: 1px solid rgba(245, 158, 11, 0.4);
                    background: rgba(245, 158, 11, 0.15);
                    color: #fcd34d;
                    border-radius: 999px;
                    padding: 0.22rem 0.5rem;
                    font-size: 0.58rem;
                    letter-spacing: 0.09em;
                    text-transform: uppercase;
                }
                .builder-preview-body {
                    flex: 1;
                    min-height: 0;
                    padding: 0.85rem;
                }
                .builder-composer {
                    display: flex;
                    gap: 0.6rem;
                    align-items: center;
                    padding: 0.8rem 1rem;
                    border-top: 1px solid var(--line);
                    background: rgba(4, 10, 20, 0.68);
                }
                .builder-input {
                    flex: 1;
                    min-width: 0;
                    border: 1px solid rgba(226, 232, 240, 0.16);
                    background: rgba(226, 232, 240, 0.07);
                    color: #f8fafc;
                    border-radius: 999px;
                    padding: 0.65rem 0.9rem;
                    font-size: 0.82rem;
                    outline: none;
                    font-family: inherit;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .builder-input:focus {
                    border-color: rgba(34, 211, 238, 0.55);
                    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.16);
                }
                .builder-input::placeholder {
                    color: rgba(226, 232, 240, 0.45);
                }
                .builder-send {
                    border: none;
                    width: 42px;
                    height: 42px;
                    border-radius: 50%;
                    font-size: 0.82rem;
                    font-weight: 700;
                    color: #082f49;
                    background: linear-gradient(145deg, var(--accent), var(--highlight));
                    cursor: pointer;
                    transition: transform 0.2s ease, filter 0.2s ease;
                    flex-shrink: 0;
                }
                .builder-send:hover {
                    transform: translateY(-1px) scale(1.03);
                    filter: brightness(1.04);
                }
                .builder-send:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                    transform: none;
                    filter: none;
                }
                .builder-error {
                    margin: 0 1rem;
                    margin-top: 0.3rem;
                    color: #fca5a5;
                    font-size: 0.7rem;
                }
                .builder-preview-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .builder-device-btn {
                    border: 1px solid rgba(226,232,240,0.12);
                    background: rgba(226,232,240,0.06);
                    color: var(--muted);
                    border-radius: 0.5rem;
                    padding: 0.28rem 0.5rem;
                    font-size: 0.6rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                    font-weight: 600;
                }
                .builder-device-btn:hover {
                    border-color: rgba(34,211,238,0.35);
                    color: rgba(226,232,240,0.9);
                }
                .builder-device-btn.active {
                    border-color: rgba(34,211,238,0.5);
                    background: rgba(34,211,238,0.15);
                    color: #67e8f9;
                }
                .builder-action-btn {
                    border: 1px solid rgba(34,211,238,0.35);
                    background: rgba(34,211,238,0.12);
                    color: #67e8f9;
                    border-radius: 999px;
                    padding: 0.3rem 0.7rem;
                    font-size: 0.66rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .builder-action-btn:hover {
                    background: rgba(34,211,238,0.2);
                }
                .builder-action-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .builder-action-btn.publish {
                    border-color: rgba(74,222,128,0.45);
                    background: rgba(74,222,128,0.15);
                    color: #86efac;
                }
                .builder-action-btn.publish:hover {
                    background: rgba(74,222,128,0.25);
                }
                .builder-action-btn.published {
                    border-color: rgba(74,222,128,0.35);
                    background: rgba(74,222,128,0.08);
                    color: #86efac;
                    cursor: default;
                }
                .builder-action-btn.undo {
                    border-color: rgba(245,158,11,0.35);
                    background: rgba(245,158,11,0.1);
                    color: #fcd34d;
                }
                .builder-action-btn.undo:hover {
                    background: rgba(245,158,11,0.18);
                }
                .builder-clear-btn {
                    border: 1px solid rgba(248,113,113,0.25);
                    background: transparent;
                    color: rgba(248,113,113,0.7);
                    border-radius: 999px;
                    padding: 0.3rem 0.6rem;
                    font-size: 0.6rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .builder-clear-btn:hover {
                    background: rgba(248,113,113,0.1);
                    color: #fca5a5;
                }
                .builder-preview-iframe-wrap {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
                    transition: all 0.3s ease;
                }
                .builder-preview-iframe-wrap.tablet {
                    padding: 0 10%;
                }
                .builder-preview-iframe-wrap.mobile {
                    padding: 0 25%;
                }
                @media (max-width: 1024px) {
                    .builder-chat {
                        width: min(330px, 48%);
                    }
                }
                @media (max-width: 860px) {
                    .builder-layout {
                        flex-direction: column;
                    }
                    .builder-chat {
                        width: 100%;
                        border-right: none;
                        border-bottom: 1px solid var(--line);
                        min-height: 44vh;
                    }
                    .builder-preview {
                        min-height: 38vh;
                    }
                    .builder-suggestion-grid {
                        grid-template-columns: 1fr;
                    }
                    .builder-phase {
                        display: none;
                    }
                }
            `}</style>

            <div className="builder-content">
                <div className="builder-top">
                    <div className="builder-top-left">
                        <span className="builder-pill">Owny Studio</span>
                        <span className="builder-title">Building with {displayName}&apos;s real content</span>
                    </div>
                    <div className="builder-top-right">
                        <div className="builder-phase">
                            {BUILD_PHASES.map((item, i) => {
                                const done = i < activeStep;
                                const active = i === activeStep && buildState.isBuilding;
                                return (
                                    <div
                                        key={item.key}
                                        className={`builder-phase-item ${done ? 'done' : ''} ${active ? 'active' : ''}`}
                                    >
                                        <span className="builder-phase-dot" />
                                        <span>{item.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                        {buildState.isBuilding && (
                            <button type="button" className="builder-stop" onClick={stopActiveBuild}>
                                Stop
                            </button>
                        )}
                    </div>
                </div>

                {showWelcome ? (
                    <>
                        <div className="builder-welcome">
                            <div className="builder-welcome-card">
                                <h2 className="builder-welcome-headline">Design a sellable product from your creator voice</h2>
                                <p className="builder-welcome-copy">
                                    Pick a format and I&apos;ll transform your best TikTok ideas into a polished digital product draft.
                                    Everything is built from your real transcript library so the result sounds like you, not generic AI copy.
                                </p>
                                <div className="builder-suggestion-grid">
                                    {SUGGESTIONS.map((suggestion) => (
                                        <button
                                            key={suggestion.label}
                                            type="button"
                                            className="builder-suggestion"
                                            onClick={() => handleSubmit(suggestion.label)}
                                        >
                                            <span className="builder-suggestion-tag">{suggestion.icon}</span>
                                            <span>{suggestion.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <form
                            className="builder-composer"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void handleSubmit();
                            }}
                        >
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Or describe the exact product angle you want to launch..."
                                className="builder-input"
                            />
                            <button type="submit" className="builder-send" disabled={!input.trim()}>
                                Go
                            </button>
                        </form>
                        {composerError && <div className="builder-error">{composerError}</div>}
                    </>
                ) : (
                    <>
                        <div className="builder-layout">
                            <div className="builder-chat">
                                <div className="builder-chat-header">
                                    <div className="builder-chat-status">
                                        <span className={`builder-chat-dot ${buildState.isBuilding ? 'live' : ''}`} />
                                        <span>
                                            {buildState.isBuilding
                                                ? 'Generating'
                                                : buildState.productId
                                                    ? 'Draft ready'
                                                    : 'Assistant'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {buildState.phase && (
                                            <span className="builder-preview-badge">{normalizePhase(buildState.phase)}</span>
                                        )}
                                        {messages.length > 0 && (
                                            <button type="button" className="builder-clear-btn" onClick={handleClearChat}>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="builder-chat-messages">
                                    {messages.map((msg) => {
                                        const cleanContent = sanitizeMessageText(msg.content);
                                        const lines = cleanContent.split('\n').filter((line) => line.trim().length > 0);
                                        return (
                                            <div key={msg.id} className={`builder-msg-wrap ${msg.role === 'user' ? 'user' : ''}`}>
                                                <div className={`builder-msg ${msg.role}`}>
                                                    {lines.length === 0 ? cleanContent : lines.map((line, idx) => (
                                                        <p key={`${msg.id}-${idx}`} style={{ margin: idx === lines.length - 1 ? 0 : '0 0 0.35rem 0' }}>
                                                            {line}
                                                        </p>
                                                    ))}
                                                </div>
                                                <span className="builder-msg-time">{formatMessageTime(msg.timestamp)}</span>
                                                {msg.topicSuggestions && msg.topicSuggestions.length > 0 && (
                                                    <div className="builder-topic-chips">
                                                        {msg.topicSuggestions.map((topic) => (
                                                            <button
                                                                key={topic.topic}
                                                                type="button"
                                                                className="builder-topic-chip"
                                                                onClick={() => handleTopicSelect(topic.topic)}
                                                                disabled={buildState.isBuilding}
                                                            >
                                                                <span>{topic.topic}</span>
                                                                <span className="builder-topic-count">{topic.videoCount}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>

                            <div className="builder-preview">
                                <div className="builder-preview-header">
                                    <div className="builder-preview-meta">
                                        <span>Live Preview</span>
                                        <div className="builder-preview-actions">
                                            {(['desktop', 'tablet', 'mobile'] as PreviewMode[]).map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    className={`builder-device-btn ${previewMode === mode ? 'active' : ''}`}
                                                    onClick={() => setPreviewMode(mode)}
                                                    title={mode.charAt(0).toUpperCase() + mode.slice(1)}
                                                >
                                                    {mode === 'desktop' ? '🖥' : mode === 'tablet' ? '📱' : '📱'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="builder-preview-actions">
                                        {versionHistory.length > 0 && (
                                            <button
                                                type="button"
                                                className="builder-action-btn undo"
                                                onClick={handleUndo}
                                                disabled={buildState.isBuilding}
                                            >
                                                ↩ Undo
                                            </button>
                                        )}
                                        {buildState.productId && publishStatus !== 'published' && (
                                            <button
                                                type="button"
                                                className="builder-action-btn publish"
                                                onClick={() => void handlePublish()}
                                                disabled={buildState.isBuilding || publishStatus === 'publishing'}
                                            >
                                                {publishStatus === 'publishing' ? 'Publishing...' : '🚀 Publish'}
                                            </button>
                                        )}
                                        {publishStatus === 'published' && (
                                            <span className="builder-action-btn published">✓ Live</span>
                                        )}
                                        <span className="builder-preview-badge">
                                            {buildState.isBuilding ? 'Syncing' : hasProduct ? 'Ready' : 'Idle'}
                                        </span>
                                    </div>
                                </div>
                                <div className="builder-preview-body">
                                    <div className={`builder-preview-iframe-wrap ${previewMode}`}>
                                        <LivePreview html={buildState.html} isLoading={buildState.isBuilding} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <form
                            className="builder-composer"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void handleSubmit();
                            }}
                        >
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={
                                    buildState.isBuilding
                                        ? 'Generation in progress...'
                                        : buildState.productId
                                            ? 'Refine your draft: update structure, tone, or sections...'
                                            : 'Tell the assistant what to build...'
                                }
                                className="builder-input"
                                disabled={buildState.isBuilding}
                            />
                            <button type="submit" className="builder-send" disabled={!input.trim() || buildState.isBuilding}>
                                Go
                            </button>
                        </form>
                        {composerError && <div className="builder-error">{composerError}</div>}
                    </>
                )}
            </div>
        </div>
    );
}
