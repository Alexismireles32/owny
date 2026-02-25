'use client';

// ProductBuilder — Lovable-style chat interface for creating digital products
// Users type prompts → AI generates products from their content

import { useState, useRef, useEffect, useCallback } from 'react';

interface ProductBuilderProps {
    creatorId: string;
    displayName: string;
    onProductCreated: () => void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    productId?: string;
}

const SUGGESTIONS = [
    { icon: '📄', label: 'Create a PDF guide' },
    { icon: '🎓', label: 'Build a mini course' },
    { icon: '🔥', label: 'Make a 7-day challenge' },
    { icon: '✅', label: 'Create a checklist toolkit' },
];

export function ProductBuilder({ creatorId, displayName, onProductCreated }: ProductBuilderProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: `Hey ${displayName}! 👋 I can turn your TikTok content into digital products. What would you like to create?`,
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = (role: ChatMessage['role'], content: string, productId?: string) => {
        const msg: ChatMessage = {
            id: Date.now().toString(),
            role,
            content,
            timestamp: new Date(),
            productId,
        };
        setMessages((prev) => [...prev, msg]);
        return msg;
    };

    const handleSubmit = useCallback(async (prompt?: string) => {
        const text = prompt || input.trim();
        if (!text || isGenerating) return;

        addMessage('user', text);
        setInput('');
        setIsGenerating(true);

        try {
            const res = await fetch('/api/products/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    creatorId,
                    message: text,
                    history: messages.filter(m => m.role !== 'system').map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                addMessage('assistant', errData.error || 'Something went wrong. Please try again.');
                setIsGenerating(false);
                return;
            }

            const data = await res.json();
            addMessage('assistant', data.message, data.productId);

            if (data.productId) {
                onProductCreated();
            }
        } catch {
            addMessage('assistant', 'Network error — please check your connection.');
        }

        setIsGenerating(false);
        inputRef.current?.focus();
    }, [input, isGenerating, creatorId, messages, onProductCreated]);

    return (
        <div className="product-builder">
            <style>{`
                .product-builder {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .pb-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .pb-msg {
                    max-width: 85%;
                    padding: 0.75rem 1rem;
                    border-radius: 1rem;
                    font-size: 0.85rem;
                    line-height: 1.5;
                    animation: msgFadeIn 0.3s ease;
                }
                @keyframes msgFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .pb-msg.user {
                    align-self: flex-end;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    border-bottom-right-radius: 0.25rem;
                }
                .pb-msg.assistant {
                    align-self: flex-start;
                    background: rgba(255,255,255,0.06);
                    color: rgba(255,255,255,0.85);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-bottom-left-radius: 0.25rem;
                }
                .pb-msg .product-badge {
                    display: inline-block;
                    margin-top: 0.5rem;
                    padding: 0.25rem 0.75rem;
                    background: rgba(34, 197, 94, 0.15);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    border-radius: 2rem;
                    font-size: 0.7rem;
                    color: #4ade80;
                    font-weight: 600;
                }
                .pb-typing {
                    display: flex;
                    gap: 4px;
                    padding: 0.75rem 1rem;
                    align-self: flex-start;
                }
                .pb-typing span {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.3);
                    animation: typingDot 1.4s ease-in-out infinite;
                }
                .pb-typing span:nth-child(2) { animation-delay: 0.2s; }
                .pb-typing span:nth-child(3) { animation-delay: 0.4s; }
                @keyframes typingDot {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
                    30% { transform: translateY(-6px); opacity: 1; }
                }
                .pb-suggestions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    padding: 0 1rem;
                    margin-bottom: 0.5rem;
                }
                .pb-suggestion {
                    padding: 0.5rem 0.75rem;
                    border-radius: 2rem;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.6);
                    font-size: 0.75rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .pb-suggestion:hover {
                    background: rgba(139, 92, 246, 0.1);
                    border-color: rgba(139, 92, 246, 0.3);
                    color: white;
                }
                .pb-input-bar {
                    display: flex;
                    gap: 0.5rem;
                    padding: 0.75rem 1rem;
                    border-top: 1px solid rgba(255,255,255,0.06);
                    background: rgba(0,0,0,0.2);
                }
                .pb-input {
                    flex: 1;
                    padding: 0.625rem 1rem;
                    border-radius: 1.5rem;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.05);
                    color: white;
                    font-size: 0.85rem;
                    outline: none;
                    font-family: inherit;
                }
                .pb-input::placeholder { color: rgba(255,255,255,0.25); }
                .pb-input:focus { border-color: #8b5cf6; }
                .pb-send {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1rem;
                    transition: all 0.2s;
                    flex-shrink: 0;
                }
                .pb-send:hover { transform: scale(1.05); }
                .pb-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
            `}</style>

            {/* Messages */}
            <div className="pb-messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`pb-msg ${msg.role}`}>
                        {msg.content}
                        {msg.productId && (
                            <div className="product-badge">✓ Draft saved</div>
                        )}
                    </div>
                ))}
                {isGenerating && (
                    <div className="pb-typing">
                        <span />
                        <span />
                        <span />
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Suggestion chips (show only when few messages) */}
            {messages.length <= 2 && !isGenerating && (
                <div className="pb-suggestions">
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s.label}
                            className="pb-suggestion"
                            onClick={() => handleSubmit(s.label)}
                        >
                            {s.icon} {s.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Input bar */}
            <form
                className="pb-input-bar"
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe the product you want to create..."
                    className="pb-input"
                    disabled={isGenerating}
                />
                <button
                    type="submit"
                    className="pb-send"
                    disabled={!input.trim() || isGenerating}
                >
                    ↑
                </button>
            </form>
        </div>
    );
}
