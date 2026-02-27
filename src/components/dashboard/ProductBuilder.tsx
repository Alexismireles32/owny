'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 sm:px-4">
                <p className="text-xs font-medium text-slate-600">Building with {displayName}&apos;s content</p>
                <div className="flex items-center gap-2">
                    {buildState.phase && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em] text-slate-600">
                            {normalizePhase(buildState.phase)}
                        </Badge>
                    )}
                    {buildState.isBuilding && (
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            onClick={stopActiveBuild}
                        >
                            Stop
                        </Button>
                    )}
                </div>
            </div>

            {showWelcome ? (
                <>
                    <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-4">
                        <Card className="w-full max-w-3xl border-slate-200 bg-white py-0 shadow-none">
                            <CardContent className="space-y-4 px-4 py-5 sm:px-6">
                                <div>
                                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                                        Design a sellable product from your creator voice
                                    </h2>
                                    <p className="mt-2 text-sm text-slate-600">
                                        Pick a format to start, then refine it with simple instructions.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {SUGGESTIONS.map((suggestion) => (
                                        <Button
                                            key={suggestion.label}
                                            type="button"
                                            variant="outline"
                                            className="h-10 justify-center text-xs text-slate-700"
                                            onClick={() => handleSubmit(suggestion.label)}
                                        >
                                            {suggestion.label}
                                        </Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <form
                        className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <Input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Describe what you want to create..."
                            className="h-9 text-sm"
                        />
                        <Button type="submit" size="sm" className="h-9 px-4" disabled={!input.trim()}>
                            Send
                        </Button>
                    </form>
                    {composerError && <p className="px-4 pb-2 text-xs text-red-700">{composerError}</p>}
                </>
            ) : (
                <>
                    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                        <section className="flex min-h-[42vh] min-w-0 flex-col border-b border-slate-200 bg-slate-50/70 lg:min-h-0 lg:w-[38%] lg:max-w-[380px] lg:border-b-0 lg:border-r">
                            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 sm:px-3.5">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            'h-1.5 w-1.5 rounded-full bg-slate-400',
                                            buildState.isBuilding && 'animate-pulse bg-slate-900'
                                        )}
                                    />
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                                        {buildState.isBuilding ? 'Generating' : buildState.productId ? 'Draft ready' : 'Assistant'}
                                    </p>
                                </div>
                                {messages.length > 0 && (
                                    <Button type="button" size="xs" variant="ghost" onClick={handleClearChat}>
                                        Clear
                                    </Button>
                                )}
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                                {messages.map((msg) => {
                                    const cleanContent = sanitizeMessageText(msg.content);
                                    const lines = cleanContent.split('\n').filter((line) => line.trim().length > 0);
                                    return (
                                        <div key={msg.id} className="space-y-1">
                                            <div
                                                className={cn(
                                                    'max-w-[92%] rounded-lg border px-3 py-2 text-[13px] leading-5',
                                                    msg.role === 'user' && 'ml-auto rounded-br-sm border-slate-900 bg-slate-900 text-white',
                                                    msg.role === 'assistant' && 'mr-auto rounded-bl-sm border-slate-200 bg-white text-slate-900',
                                                    msg.role === 'status' && 'mx-auto border-slate-300 bg-slate-100 text-slate-600'
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
                                                <div className="flex flex-wrap gap-1.5">
                                                    {msg.topicSuggestions.map((topic) => (
                                                        <Button
                                                            key={topic.topic}
                                                            type="button"
                                                            size="xs"
                                                            variant="outline"
                                                            className="h-6 rounded-full border-slate-300 bg-white px-2.5 text-[11px] text-slate-700"
                                                            onClick={() => handleTopicSelect(topic.topic)}
                                                            disabled={buildState.isBuilding}
                                                        >
                                                            {topic.topic}
                                                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                                                {topic.videoCount}
                                                            </Badge>
                                                        </Button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                        </section>

                        <section className="flex min-h-[38vh] min-w-0 flex-1 flex-col bg-white lg:min-h-0">
                            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 sm:px-3.5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">Preview</p>
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

                            <div className="min-h-0 flex-1 p-2.5">
                                <LivePreview html={buildState.html} isLoading={buildState.isBuilding} />
                            </div>
                        </section>
                    </div>

                    <form
                        className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <Input
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
                            className="h-9 text-sm"
                            disabled={buildState.isBuilding}
                        />
                        <Button type="submit" size="sm" className="h-9 px-4" disabled={!input.trim() || buildState.isBuilding}>
                            Send
                        </Button>
                    </form>
                    {composerError && <p className="px-4 pb-2 text-xs text-red-700">{composerError}</p>}
                </>
            )}
        </div>
    );
}
