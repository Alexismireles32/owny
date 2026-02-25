'use client';

// PipelineProgress — Full-screen animated pipeline progress
// Shows 5 stages with animated progress indicators
// Polls /api/pipeline/status every 3 seconds
// Auto-redirects to /dashboard when pipeline complete

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PipelineProgressProps {
    creatorId: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    initialStatus: string;
}

const STAGES = [
    {
        key: 'scraping',
        icon: '📱',
        label: 'Fetching your TikTok profile',
        description: 'Pulling your profile picture, bio and account info...',
    },
    {
        key: 'transcribing',
        icon: '🎬',
        label: 'Scanning your videos',
        description: 'Analyzing your top videos and content...',
    },
    {
        key: 'clustering',
        icon: '🧠',
        label: 'Reading your content',
        description: 'Extracting transcripts and understanding your topics...',
    },
    {
        key: 'extracting',
        icon: '🎨',
        label: 'Understanding your brand',
        description: 'Identifying your visual style and color palette...',
    },
    {
        key: 'ready',
        icon: '✨',
        label: 'Designing your storefront',
        description: 'Building your personalized product page...',
    },
];

// Map pipeline_status values to stage indices
function statusToStageIndex(status: string): number {
    switch (status) {
        case 'pending':
        case 'scraping':
            return 0;
        case 'transcribing':
            return 1;
        case 'clustering':
        case 'cleaning':
            return 2;
        case 'extracting':
            return 3;
        case 'ready':
            return 4;
        case 'error':
        case 'failed':
        case 'insufficient_content':
            return -1;
        default:
            return 0;
    }
}

export function PipelineProgress({
    creatorId,
    handle,
    displayName,
    avatarUrl,
    initialStatus,
}: PipelineProgressProps) {
    const router = useRouter();
    const [currentStatus, setCurrentStatus] = useState(initialStatus);
    const [stageIndex, setStageIndex] = useState(statusToStageIndex(initialStatus));
    const [error, setError] = useState<string | null>(null);
    const [dots, setDots] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const showSkip = elapsed >= 30;

    // Animated dots + elapsed timer
    useEffect(() => {
        const dotInt = setInterval(() => {
            setDots((d) => (d.length >= 3 ? '' : d + '.'));
        }, 500);
        const secInt = setInterval(() => {
            setElapsed((e) => e + 1);
        }, 1000);
        return () => { clearInterval(dotInt); clearInterval(secInt); };
    }, []);

    // Poll pipeline status
    const poll = useCallback(async () => {
        try {
            const res = await fetch(`/api/pipeline/status?creatorId=${creatorId}`);
            if (!res.ok) return;
            const data = await res.json();
            const status = data.status || data.pipeline_status || 'pending';
            setCurrentStatus(status);
            const idx = statusToStageIndex(status);
            setStageIndex(idx);

            if (status === 'ready') {
                // Done — redirect to dashboard after a brief celebration
                setTimeout(() => router.push('/dashboard'), 1500);
            } else if (status === 'failed' || status === 'error' || status === 'insufficient_content') {
                setError(
                    status === 'insufficient_content'
                        ? "We couldn't find enough content on this account. Try a different TikTok username."
                        : data.error || 'Something went wrong. Please try again.'
                );
            }
        } catch {
            // Silent retry
        }
    }, [creatorId, router]);

    useEffect(() => {
        if (currentStatus === 'ready') return;
        const interval = setInterval(poll, 3000);
        const timeout = setTimeout(() => { void poll(); }, 0); // Immediate first poll
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [poll, currentStatus]);

    const isComplete = currentStatus === 'ready';
    const isFailed = stageIndex === -1;

    return (
        <div className="pipeline-progress">
            <style>{`
                .pipeline-progress {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
                    color: white;
                    padding: 2rem;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .pipeline-avatar {
                    width: 96px;
                    height: 96px;
                    border-radius: 50%;
                    border: 3px solid rgba(139, 92, 246, 0.5);
                    object-fit: cover;
                    margin-bottom: 1rem;
                    animation: avatarGlow 2s ease-in-out infinite;
                }
                @keyframes avatarGlow {
                    0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); }
                    50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); }
                }
                .pipeline-avatar-placeholder {
                    width: 96px;
                    height: 96px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.5rem;
                    margin-bottom: 1rem;
                    animation: avatarGlow 2s ease-in-out infinite;
                }
                .pipeline-name {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 0.25rem;
                }
                .pipeline-handle {
                    font-size: 0.875rem;
                    color: rgba(255,255,255,0.5);
                    margin-bottom: 2.5rem;
                }
                .pipeline-stages {
                    width: 100%;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .pipeline-stage {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 1.25rem;
                    border-radius: 1rem;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    transition: all 0.6s ease;
                    opacity: 0.35;
                }
                .pipeline-stage.active {
                    opacity: 1;
                    background: rgba(139, 92, 246, 0.1);
                    border-color: rgba(139, 92, 246, 0.3);
                    box-shadow: 0 0 24px rgba(139, 92, 246, 0.1);
                }
                .pipeline-stage.done {
                    opacity: 0.6;
                }
                .pipeline-stage-icon {
                    font-size: 1.5rem;
                    width: 2.5rem;
                    height: 2.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .pipeline-stage-check {
                    width: 2.5rem;
                    height: 2.5rem;
                    border-radius: 50%;
                    background: #22c55e;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 1rem;
                }
                .pipeline-stage-text {
                    flex: 1;
                    min-width: 0;
                }
                .pipeline-stage-label {
                    font-weight: 600;
                    font-size: 0.9rem;
                }
                .pipeline-stage-desc {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.5);
                    margin-top: 0.125rem;
                }
                .pipeline-spinner {
                    width: 2.5rem;
                    height: 2.5rem;
                    border-radius: 50%;
                    border: 3px solid rgba(139, 92, 246, 0.2);
                    border-top-color: #8b5cf6;
                    animation: spin 1s linear infinite;
                    flex-shrink: 0;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .pipeline-error {
                    max-width: 400px;
                    margin-top: 2rem;
                    padding: 1rem 1.5rem;
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 1rem;
                    color: #fca5a5;
                    text-align: center;
                    font-size: 0.875rem;
                }
                .pipeline-error a {
                    color: white;
                    text-decoration: underline;
                    margin-top: 0.5rem;
                    display: inline-block;
                }
                .pipeline-celebration {
                    animation: celebratePulse 0.5s ease;
                }
                @keyframes celebratePulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            `}</style>

            {/* Avatar */}
            {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="pipeline-avatar" />
            ) : (
                <div className="pipeline-avatar-placeholder">👤</div>
            )}

            <div className="pipeline-name">{displayName}</div>
            <div className="pipeline-handle">@{handle}</div>

            {/* Stages */}
            <div className={`pipeline-stages ${isComplete ? 'pipeline-celebration' : ''}`}>
                {STAGES.map((stage, i) => {
                    const isDone = stageIndex > i || isComplete;
                    const isActive = stageIndex === i && !isComplete && !isFailed;

                    return (
                        <div
                            key={stage.key}
                            className={`pipeline-stage ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                        >
                            {isDone ? (
                                <div className="pipeline-stage-check">✓</div>
                            ) : isActive ? (
                                <div className="pipeline-spinner" />
                            ) : (
                                <div className="pipeline-stage-icon">{stage.icon}</div>
                            )}
                            <div className="pipeline-stage-text">
                                <div className="pipeline-stage-label">
                                    {stage.label}
                                    {isActive ? dots : ''}
                                </div>
                                <div className="pipeline-stage-desc">{stage.description}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Error state */}
            {isFailed && error && (
                <div className="pipeline-error">
                    {error}
                    <br />
                    <Link href="/">← Try a different username</Link>
                </div>
            )}

            {/* Skip / Go to dashboard */}
            {!isComplete && !isFailed && (
                <div style={{
                    marginTop: '2rem',
                    textAlign: 'center',
                    opacity: showSkip ? 1 : 0,
                    transition: 'opacity 0.5s',
                    pointerEvents: showSkip ? 'auto' : 'none',
                }}>
                    <button
                        onClick={() => router.push('/dashboard')}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: 'rgba(255,255,255,0.7)',
                            padding: '0.6rem 1.5rem',
                            borderRadius: '2rem',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            transition: 'all 0.2s',
                        }}
                    >
                        Skip to Dashboard →
                    </button>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', marginTop: '0.5rem' }}>
                        Your storefront is being set up in the background
                    </div>
                </div>
            )}
        </div>
    );
}
