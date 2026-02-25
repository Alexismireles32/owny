'use client';

// StorefrontPreview — Mobile phone frame with live iframe of /c/[handle]
// Plus a design prompt input below for storefront restyling

import { useState, useCallback } from 'react';

interface StorefrontPreviewProps {
    handle: string;
    storefrontKey: number;
    onRestyle: () => void;
    creatorId: string;
}

export function StorefrontPreview({ handle, storefrontKey, onRestyle, creatorId }: StorefrontPreviewProps) {
    const [designPrompt, setDesignPrompt] = useState('');
    const [restyling, setRestyling] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    const handleRestyle = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!designPrompt.trim() || restyling) return;

        setRestyling(true);
        try {
            const res = await fetch('/api/storefront/restyle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorId, prompt: designPrompt }),
            });
            if (res.ok) {
                setDesignPrompt('');
                onRestyle();
            }
        } catch { /* silent */ }
        setRestyling(false);
    }, [designPrompt, restyling, creatorId, onRestyle]);

    return (
        <div className="storefront-preview">
            <style>{`
                .storefront-preview {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 1.5rem 1rem;
                    overflow: hidden;
                }
                .phone-frame {
                    width: 280px;
                    max-width: 100%;
                    flex: 1;
                    min-height: 0;
                    background: #000;
                    border-radius: 2rem;
                    border: 3px solid rgba(255,255,255,0.1);
                    overflow: hidden;
                    position: relative;
                    box-shadow: 0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
                }
                .phone-notch {
                    width: 120px;
                    height: 24px;
                    background: #000;
                    border-radius: 0 0 1rem 1rem;
                    position: absolute;
                    top: 0;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 10;
                }
                .phone-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    background: white;
                    border-radius: 1.75rem;
                    opacity: 0;
                    transition: opacity 0.4s ease;
                }
                .phone-iframe.loaded {
                    opacity: 1;
                }
                .phone-loader {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: rgba(255,255,255,0.3);
                    font-size: 0.75rem;
                    text-align: center;
                }
                .phone-loader-spinner {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.1);
                    border-top-color: #8b5cf6;
                    animation: iframeSpin 1s linear infinite;
                    margin: 0 auto 0.5rem;
                }
                @keyframes iframeSpin { to { transform: rotate(360deg); } }
                .design-prompt-form {
                    width: 280px;
                    max-width: 100%;
                    margin-top: 1rem;
                    display: flex;
                    gap: 0.5rem;
                }
                .design-prompt-input {
                    flex: 1;
                    padding: 0.5rem 0.75rem;
                    border-radius: 0.75rem;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.05);
                    color: white;
                    font-size: 0.75rem;
                    outline: none;
                    font-family: inherit;
                }
                .design-prompt-input::placeholder {
                    color: rgba(255,255,255,0.3);
                }
                .design-prompt-input:focus {
                    border-color: #8b5cf6;
                }
                .design-prompt-btn {
                    padding: 0.5rem 0.75rem;
                    border-radius: 0.75rem;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    font-size: 0.75rem;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    font-family: inherit;
                    white-space: nowrap;
                }
                .design-prompt-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .storefront-handle {
                    font-size: 0.7rem;
                    color: rgba(255,255,255,0.3);
                    margin-top: 0.5rem;
                }
            `}</style>

            {/* Phone Frame */}
            <div className="phone-frame">
                <div className="phone-notch" />
                {!iframeLoaded && (
                    <div className="phone-loader">
                        <div className="phone-loader-spinner" />
                        Loading preview
                    </div>
                )}
                <iframe
                    key={storefrontKey}
                    src={`/c/${handle}`}
                    className={`phone-iframe ${iframeLoaded ? 'loaded' : ''}`}
                    title="Storefront Preview"
                    onLoad={() => setIframeLoaded(true)}
                />
            </div>

            <div className="storefront-handle">owny.store/c/{handle}</div>

            {/* Design Prompt */}
            <form className="design-prompt-form" onSubmit={handleRestyle}>
                <input
                    type="text"
                    value={designPrompt}
                    onChange={(e) => setDesignPrompt(e.target.value)}
                    placeholder="Change storefront design..."
                    className="design-prompt-input"
                    disabled={restyling}
                />
                <button
                    type="submit"
                    className="design-prompt-btn"
                    disabled={restyling || !designPrompt.trim()}
                >
                    {restyling ? '...' : 'Apply'}
                </button>
            </form>
        </div>
    );
}
