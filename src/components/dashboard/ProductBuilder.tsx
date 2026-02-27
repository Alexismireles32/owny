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
    { label: 'Create a PDF guide' },
    { label: 'Build a mini course' },
    { label: 'Make a 7-day challenge' },
    { label: 'Create a checklist toolkit' },
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
    rawTopics: { topic: string; videoCount: number }[],
    displayName: string
): { topic: string; videoCount: number }[] {
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
                                const rawTopics = Array.isArray(event.topics)
                                    ? (event.topics as { topic: string; videoCount: number }[])
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
                                continue;
                            }

                            if (eventType === 'source_videos') {
                                const videos = Array.isArray(event.videos) ? event.videos as SourceVideo[] : [];
                                if (videos.length > 0) {
                                    addMessage({
                                        role: 'status',
                                        content: `Using ${videos.length} videos: ${videos.slice(0, 3).map((v) => `"${v.title}"`).join(', ')}${videos.length > 3 ? ` +${videos.length - 3} more` : ''}`,
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
                                                content: `Writing section ${currentSections}: ${titleText}...`,
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
                                const qualityScore = typeof event.qualityScore === 'number' ? event.qualityScore : null;
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
                                        content: `"${title}" is ready.${videosUsed ? ` Built from ${videosUsed} top videos.` : ''}${qualityScore !== null ? ` Quality score: ${qualityScore}/100.` : ''} Keep iterating in the chat to sharpen the final version.`,
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
        [addMessage, displayName, onProductCreated]
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

    const handleUndo = useCallback(() => {
        if (versionHistory.length === 0) return;
        const prev = versionHistory[versionHistory.length - 1];
        setBuildState((s) => ({ ...s, html: prev.html, versionId: prev.versionId }));
        setVersionHistory((h) => h.slice(0, -1));
        addMessage({ role: 'status', content: `Reverted to ${prev.label}` });
    }, [versionHistory, addMessage]);

    const handlePublish = useCallback(async () => {
        if (!buildState.productId) return;
        setPublishStatus('publishing');
        try {
            const res = await fetch(`/api/products/${buildState.productId}/publish`, { method: 'POST' });
            if (res.ok) {
                setPublishStatus('published');
                addMessage({ role: 'assistant', content: 'Product published. It is now live on your storefront.' });
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
                    --line: #e2e8f0;
                    --text: #0f172a;
                    --muted: #64748b;
                    position: relative;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    color: var(--text);
                    background: #ffffff;
                }
                .builder-content {
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
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid var(--line);
                    background: #ffffff;
                }
                .builder-title {
                    font-size: 0.82rem;
                    font-weight: 600;
                    color: #334155;
                }
                .builder-top-right {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .builder-phase-badge {
                    border: 1px solid #cbd5e1;
                    background: #f8fafc;
                    color: #475569;
                    border-radius: 999px;
                    padding: 0.2rem 0.5rem;
                    font-size: 0.58rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    font-weight: 600;
                }
                .builder-stop {
                    border: 1px solid #fca5a5;
                    background: #fef2f2;
                    color: #b91c1c;
                    border-radius: 999px;
                    padding: 0.3rem 0.7rem;
                    font-size: 0.66rem;
                    font-weight: 600;
                    cursor: pointer;
                }
                .builder-welcome {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 1.6rem 1rem 1rem;
                    gap: 1rem;
                }
                .builder-welcome-card {
                    width: min(820px, 100%);
                    border-radius: 1rem;
                    border: 1px solid var(--line);
                    background: #ffffff;
                    box-shadow: none;
                    padding: 1.2rem;
                }
                .builder-welcome-headline {
                    font-size: clamp(1.15rem, 1.9vw, 1.55rem);
                    line-height: 1.2;
                    letter-spacing: -0.01em;
                    margin: 0;
                    color: #0f172a;
                }
                .builder-welcome-copy {
                    margin: 0.55rem 0 0;
                    color: var(--muted);
                    max-width: 52ch;
                    line-height: 1.5;
                    font-size: 0.86rem;
                }
                .builder-suggestion-grid {
                    margin-top: 1rem;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.5rem;
                }
                .builder-suggestion {
                    border: 1px solid var(--line);
                    border-radius: 0.75rem;
                    background: #ffffff;
                    color: #334155;
                    text-align: center;
                    display: block;
                    padding: 0.65rem 0.75rem;
                    font-size: 0.76rem;
                    cursor: pointer;
                    transition: border-color 0.2s ease, background 0.2s ease;
                    font-family: inherit;
                }
                .builder-suggestion:hover {
                    border-color: #94a3b8;
                    background: #f8fafc;
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
                    background: #fafafa;
                }
                .builder-chat-header {
                    padding: 0.7rem 0.85rem;
                    border-bottom: 1px solid var(--line);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 0.6rem;
                    background: #ffffff;
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
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #94a3b8;
                }
                .builder-chat-dot.live {
                    background: #0f172a;
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
                    padding: 0.75rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .builder-msg-wrap {
                    display: flex;
                }
                .builder-msg {
                    border-radius: 0.75rem;
                    border: 1px solid transparent;
                    padding: 0.52rem 0.66rem;
                    font-size: 0.78rem;
                    line-height: 1.5;
                    max-width: 95%;
                }
                .builder-msg.user {
                    align-self: flex-end;
                    background: #0f172a;
                    color: #ffffff;
                    border-bottom-right-radius: 0.25rem;
                    border-color: #0f172a;
                }
                .builder-msg.assistant {
                    align-self: flex-start;
                    background: #ffffff;
                    border-color: #e2e8f0;
                    color: #0f172a;
                    border-bottom-left-radius: 0.25rem;
                }
                .builder-msg.status {
                    align-self: center;
                    background: #f8fafc;
                    border-color: #cbd5e1;
                    color: #475569;
                    max-width: 100%;
                    font-size: 0.7rem;
                    letter-spacing: 0.02em;
                }
                .builder-topic-chips {
                    margin-top: 0.35rem;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.35rem;
                }
                .builder-topic-chip {
                    border: 1px solid #cbd5e1;
                    background: #f8fafc;
                    color: #334155;
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
                    background: #f1f5f9;
                    border-color: #94a3b8;
                }
                .builder-topic-chip:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .builder-topic-count {
                    border-radius: 999px;
                    padding: 0.1rem 0.4rem;
                    font-size: 0.58rem;
                    background: #e2e8f0;
                    color: #475569;
                }
                .builder-preview {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    background: #ffffff;
                }
                .builder-preview-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.7rem 0.85rem;
                    border-bottom: 1px solid var(--line);
                    background: #ffffff;
                }
                .builder-preview-label {
                    font-size: 0.68rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--muted);
                    font-weight: 600;
                }
                .builder-preview-badge {
                    border: 1px solid #cbd5e1;
                    background: #f8fafc;
                    color: #475569;
                    border-radius: 999px;
                    padding: 0.22rem 0.5rem;
                    font-size: 0.58rem;
                    letter-spacing: 0.09em;
                    text-transform: uppercase;
                }
                .builder-preview-body {
                    flex: 1;
                    min-height: 0;
                    padding: 0.6rem;
                }
                .builder-composer {
                    display: flex;
                    gap: 0.6rem;
                    align-items: center;
                    padding: 0.7rem 0.85rem;
                    border-top: 1px solid var(--line);
                    background: #ffffff;
                }
                .builder-input {
                    flex: 1;
                    min-width: 0;
                    border: 1px solid #cbd5e1;
                    background: #ffffff;
                    color: #0f172a;
                    border-radius: 999px;
                    padding: 0.65rem 0.9rem;
                    font-size: 0.82rem;
                    outline: none;
                    font-family: inherit;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .builder-input:focus {
                    border-color: #0f172a;
                    box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
                }
                .builder-input::placeholder {
                    color: #94a3b8;
                }
                .builder-send {
                    border: 1px solid #0f172a;
                    height: 38px;
                    border-radius: 999px;
                    padding: 0 0.9rem;
                    font-size: 0.76rem;
                    font-weight: 600;
                    color: #ffffff;
                    background: #0f172a;
                    cursor: pointer;
                    transition: background 0.2s ease;
                    flex-shrink: 0;
                }
                .builder-send:hover {
                    background: #1e293b;
                }
                .builder-send:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .builder-error {
                    margin: 0 0.85rem;
                    margin-top: 0.3rem;
                    color: #b91c1c;
                    font-size: 0.7rem;
                }
                .builder-preview-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .builder-action-btn {
                    border: 1px solid #cbd5e1;
                    background: #ffffff;
                    color: #334155;
                    border-radius: 999px;
                    padding: 0.3rem 0.7rem;
                    font-size: 0.66rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s ease;
                    font-family: inherit;
                }
                .builder-action-btn:hover {
                    background: #f8fafc;
                }
                .builder-action-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .builder-action-btn.publish {
                    border-color: #86efac;
                    background: #f0fdf4;
                    color: #15803d;
                }
                .builder-action-btn.publish:hover {
                    background: #dcfce7;
                }
                .builder-action-btn.published {
                    border-color: #86efac;
                    background: #f0fdf4;
                    color: #15803d;
                    cursor: default;
                }
                .builder-action-btn.undo {
                    border-color: #fcd34d;
                    background: #fffbeb;
                    color: #92400e;
                }
                .builder-action-btn.undo:hover {
                    background: #fef3c7;
                }
                .builder-clear-btn {
                    border: 1px solid #cbd5e1;
                    background: transparent;
                    color: #64748b;
                    border-radius: 999px;
                    padding: 0.3rem 0.6rem;
                    font-size: 0.6rem;
                    cursor: pointer;
                    transition: background 0.2s ease;
                    font-family: inherit;
                }
                .builder-clear-btn:hover {
                    background: #f8fafc;
                    color: #334155;
                }
                .builder-preview-iframe-wrap {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
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
                }
            `}</style>

            <div className="builder-content">
                <div className="builder-top">
                    <span className="builder-title">Building with {displayName}&apos;s content</span>
                    <div className="builder-top-right">
                        {buildState.phase && <span className="builder-phase-badge">{normalizePhase(buildState.phase)}</span>}
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
                                    Pick a format to start, then refine it with simple instructions.
                                </p>
                                <div className="builder-suggestion-grid">
                                    {SUGGESTIONS.map((suggestion) => (
                                        <button
                                            key={suggestion.label}
                                            type="button"
                                            className="builder-suggestion"
                                            onClick={() => handleSubmit(suggestion.label)}
                                        >
                                            {suggestion.label}
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
                                placeholder="Describe what you want to create..."
                                className="builder-input"
                            />
                            <button type="submit" className="builder-send" disabled={!input.trim()}>
                                Send
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
                                    <span className="builder-preview-label">Preview</span>
                                    <div className="builder-preview-actions">
                                        {versionHistory.length > 0 && (
                                            <button
                                                type="button"
                                                className="builder-action-btn undo"
                                                onClick={handleUndo}
                                                disabled={buildState.isBuilding}
                                            >
                                                Undo
                                            </button>
                                        )}
                                        {buildState.productId && publishStatus !== 'published' && (
                                            <button
                                                type="button"
                                                className="builder-action-btn publish"
                                                onClick={() => void handlePublish()}
                                                disabled={buildState.isBuilding || publishStatus === 'publishing'}
                                            >
                                                {publishStatus === 'publishing' ? 'Publishing...' : 'Publish'}
                                            </button>
                                        )}
                                        {publishStatus === 'published' && (
                                            <span className="builder-action-btn published">Live</span>
                                        )}
                                        <span className="builder-preview-badge">
                                            {buildState.isBuilding ? 'Syncing' : hasProduct ? 'Ready' : 'Idle'}
                                        </span>
                                    </div>
                                </div>
                                <div className="builder-preview-body">
                                    <div className="builder-preview-iframe-wrap">
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
                                            ? 'Refine your draft...'
                                            : 'Tell the assistant what to build...'
                                }
                                className="builder-input"
                                disabled={buildState.isBuilding}
                            />
                            <button type="submit" className="builder-send" disabled={!input.trim() || buildState.isBuilding}>
                                Send
                            </button>
                        </form>
                        {composerError && <div className="builder-error">{composerError}</div>}
                    </>
                )}
            </div>
        </div>
    );
}
