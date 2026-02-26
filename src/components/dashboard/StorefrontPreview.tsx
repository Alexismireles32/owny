'use client';

import { useState, useCallback } from 'react';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

interface StorefrontPreviewProps {
    handle: string;
    storefrontKey: number;
    onRestyle: () => void;
    creatorId: string;
}

const STYLE_PROMPTS = [
    'Make it editorial and minimalist',
    'Give it a bold launch-day style',
    'Use a clean premium coaching look',
    'Make it warm and lifestyle focused',
];

export function StorefrontPreview({ handle, storefrontKey, onRestyle, creatorId }: StorefrontPreviewProps) {
    const [designPrompt, setDesignPrompt] = useState('');
    const [restyling, setRestyling] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const applyRestyle = useCallback(async (prompt: string) => {
        if (!prompt.trim() || restyling) return;

        setRestyling(true);
        setError(null);
        try {
            const res = await fetch('/api/storefront/restyle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorId, prompt }),
            });

            const payload = await readJsonSafe<{ error?: string }>(res);
            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = '/sign-in?next=%2Fdashboard';
                    return;
                }
                setError(getApiErrorMessage(payload, 'Could not apply storefront style changes.'));
                return;
            }

            setDesignPrompt('');
            onRestyle();
        } catch {
            setError('Network error while applying storefront style changes.');
        } finally {
            setRestyling(false);
        }
    }, [creatorId, onRestyle, restyling]);

    const handleRestyle = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        await applyRestyle(designPrompt);
    }, [applyRestyle, designPrompt]);

    return (
        <div className="preview-root">
            <style>{`
                .preview-root {
                    --preview-line: rgba(255, 255, 255, 0.13);
                    --preview-muted: rgba(226, 232, 240, 0.62);
                    --preview-text: rgba(241, 245, 249, 0.94);
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 1rem 1rem 1.05rem;
                    gap: 0.78rem;
                    overflow: hidden;
                }
                .preview-head {
                    width: min(340px, 100%);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    color: var(--preview-muted);
                    font-size: 0.7rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    font-weight: 700;
                }
                .preview-tag {
                    border: 1px solid rgba(34, 211, 238, 0.4);
                    background: rgba(34, 211, 238, 0.12);
                    color: #67e8f9;
                    border-radius: 999px;
                    padding: 0.25rem 0.56rem;
                    font-size: 0.6rem;
                }
                .preview-phone {
                    width: min(340px, 100%);
                    flex: 1;
                    min-height: 320px;
                    background: linear-gradient(160deg, rgba(6, 12, 22, 0.9), rgba(12, 21, 33, 0.95));
                    border-radius: 2.1rem;
                    border: 1px solid var(--preview-line);
                    overflow: hidden;
                    position: relative;
                    box-shadow: 0 25px 40px rgba(0, 0, 0, 0.32);
                    padding: 0.48rem;
                }
                .preview-inner {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    border-radius: 1.7rem;
                    overflow: hidden;
                    background: #0b1220;
                    border: 1px solid rgba(255, 255, 255, 0.09);
                }
                .preview-notch {
                    width: 122px;
                    height: 23px;
                    border-radius: 0 0 0.9rem 0.9rem;
                    background: rgba(2, 8, 16, 0.92);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-top: none;
                    position: absolute;
                    top: 0;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 3;
                }
                .preview-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    background: #fff;
                    opacity: 0;
                    transition: opacity 0.35s ease;
                }
                .preview-iframe.loaded {
                    opacity: 1;
                }
                .preview-loader {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 0.6rem;
                    color: var(--preview-muted);
                    font-size: 0.72rem;
                    letter-spacing: 0.02em;
                }
                .preview-loader-spinner {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid rgba(226, 232, 240, 0.2);
                    border-top-color: #22d3ee;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .preview-handle {
                    width: min(340px, 100%);
                    color: rgba(226, 232, 240, 0.44);
                    font-size: 0.68rem;
                    text-align: center;
                }
                .preview-presets {
                    width: min(340px, 100%);
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.4rem;
                }
                .preview-preset {
                    border: 1px solid rgba(226, 232, 240, 0.18);
                    background: rgba(226, 232, 240, 0.08);
                    color: rgba(226, 232, 240, 0.8);
                    border-radius: 999px;
                    font-size: 0.64rem;
                    padding: 0.32rem 0.58rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .preview-preset:hover {
                    border-color: rgba(34, 211, 238, 0.38);
                    color: #a5f3fc;
                    background: rgba(34, 211, 238, 0.13);
                }
                .preview-preset:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }
                .preview-form {
                    width: min(340px, 100%);
                    display: flex;
                    gap: 0.45rem;
                }
                .preview-input {
                    flex: 1;
                    min-width: 0;
                    border-radius: 0.8rem;
                    border: 1px solid rgba(226, 232, 240, 0.2);
                    background: rgba(226, 232, 240, 0.08);
                    color: var(--preview-text);
                    padding: 0.56rem 0.72rem;
                    font-size: 0.74rem;
                    outline: none;
                    font-family: inherit;
                    transition: border-color 0.2s ease;
                }
                .preview-input:focus {
                    border-color: rgba(34, 211, 238, 0.5);
                }
                .preview-input::placeholder {
                    color: rgba(226, 232, 240, 0.4);
                }
                .preview-btn {
                    border: none;
                    border-radius: 0.8rem;
                    padding: 0.56rem 0.78rem;
                    font-size: 0.7rem;
                    font-weight: 700;
                    letter-spacing: 0.03em;
                    color: #082f49;
                    background: linear-gradient(145deg, #22d3ee, #f59e0b);
                    cursor: pointer;
                    transition: transform 0.2s ease, filter 0.2s ease;
                    font-family: inherit;
                    white-space: nowrap;
                }
                .preview-btn:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.04);
                }
                .preview-btn:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                    transform: none;
                    filter: none;
                }
                .preview-error {
                    width: min(340px, 100%);
                    font-size: 0.68rem;
                    border-radius: 0.72rem;
                    border: 1px solid rgba(248, 113, 113, 0.35);
                    background: rgba(248, 113, 113, 0.12);
                    color: #fecaca;
                    padding: 0.45rem 0.55rem;
                }
            `}</style>

            <div className="preview-head">
                <span>Storefront Studio</span>
                <span className="preview-tag">Live</span>
            </div>

            <div className="preview-phone">
                <div className="preview-inner">
                    <div className="preview-notch" />
                    {!iframeLoaded && (
                        <div className="preview-loader">
                            <div className="preview-loader-spinner" />
                            <span>Loading storefront</span>
                        </div>
                    )}
                    <iframe
                        key={storefrontKey}
                        src={`/c/${handle}`}
                        className={`preview-iframe ${iframeLoaded ? 'loaded' : ''}`}
                        title="Storefront Preview"
                        onLoad={() => setIframeLoaded(true)}
                    />
                </div>
            </div>

            <div className="preview-handle">owny.store/c/{handle}</div>

            <div className="preview-presets">
                {STYLE_PROMPTS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        className="preview-preset"
                        disabled={restyling}
                        onClick={() => {
                            setDesignPrompt(preset);
                            void applyRestyle(preset);
                        }}
                    >
                        {preset}
                    </button>
                ))}
            </div>

            <form className="preview-form" onSubmit={handleRestyle}>
                <input
                    type="text"
                    value={designPrompt}
                    onChange={(e) => setDesignPrompt(e.target.value)}
                    placeholder="Ask for a specific redesign direction..."
                    className="preview-input"
                    disabled={restyling}
                />
                <button type="submit" className="preview-btn" disabled={restyling || !designPrompt.trim()}>
                    {restyling ? 'Applying' : 'Apply'}
                </button>
            </form>

            {error && <p className="preview-error">{error}</p>}
        </div>
    );
}
