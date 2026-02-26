'use client';

// PipelineProgress — Premium animated pipeline progress page
// 5 stages with animated indicators, rotating tips, confetti on complete
// Polls /api/pipeline/status every 3s, auto-redirects to /dashboard
// Retry button on error state, skip button after 30s

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PipelineProgressProps {
    creatorId: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    initialStatus: string;
    initialError?: string | null;
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

const TIPS = [
    '💡 90% of creators publish their first product within 5 minutes',
    '🎯 PDF guides are the most popular product type on Owny',
    '📈 Creators earn an average of $47 on their first sale',
    '🔥 Your top-performing TikTok videos inspire the best products',
    '✨ AI analyzes your unique voice to match your brand perfectly',
    '🚀 You can create unlimited products with your account',
    '💰 Set any price — from free lead magnets to premium courses',
    '📱 Your storefront looks great on every device',
];

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

function hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function createSeededRng(seed: number): () => number {
    let state = seed % 2147483647;
    if (state <= 0) state += 2147483646;

    return () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
    };
}

function deterministicShuffle(items: string[], seedSource: string): string[] {
    const shuffled = [...items];
    const rng = createSeededRng(hashString(seedSource) + 1);
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function normalizePipelineError(status: string, message?: string | null): string {
    if (status === 'insufficient_content') {
        return "We couldn't find enough content on this account. Try a different TikTok username.";
    }
    if (message && message.trim().length > 0) return message;
    return 'Something went wrong while building your storefront. Please retry the pipeline.';
}

export function PipelineProgress({
    creatorId,
    handle,
    displayName,
    avatarUrl,
    initialStatus,
    initialError = null,
}: PipelineProgressProps) {
    const router = useRouter();
    const [currentStatus, setCurrentStatus] = useState(initialStatus);
    const [stageIndex, setStageIndex] = useState(statusToStageIndex(initialStatus));
    const [error, setError] = useState<string | null>(
        statusToStageIndex(initialStatus) === -1
            ? normalizePipelineError(initialStatus, initialError)
            : null
    );
    const [dots, setDots] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);
    const [retrying, setRetrying] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const showSkip = elapsed >= 30;

    const shuffledTips = useMemo(
        () => deterministicShuffle(TIPS, `tips:${creatorId}`),
        [creatorId]
    );

    const confettiPieces = useMemo(() => {
        const rng = createSeededRng(hashString(`confetti:${creatorId}`) + 11);
        return Array.from({ length: 50 }).map((_, i) => ({
            id: i,
            left: `${(rng() * 100).toFixed(3)}%`,
            backgroundColor: ['#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6'][i % 6],
            borderRadius: i % 3 === 0 ? '50%' : '2px',
            width: `${(6 + rng() * 8).toFixed(2)}px`,
            height: `${(6 + rng() * 8).toFixed(2)}px`,
            animationDelay: `${(rng() * 0.8).toFixed(2)}s`,
            animationDuration: `${(2 + rng() * 2).toFixed(2)}s`,
        }));
    }, [creatorId]);

    // Animated dots + elapsed timer + rotating tips
    useEffect(() => {
        const dotInt = setInterval(() => {
            setDots((d) => (d.length >= 3 ? '' : d + '.'));
        }, 500);
        const secInt = setInterval(() => {
            setElapsed((e) => e + 1);
        }, 1000);
        const tipInt = setInterval(() => {
            setTipIndex((i) => (i + 1) % shuffledTips.length);
        }, 5000);
        return () => {
            clearInterval(dotInt);
            clearInterval(secInt);
            clearInterval(tipInt);
        };
    }, [shuffledTips.length]);

    // Poll pipeline status
    const poll = useCallback(async () => {
        try {
            const res = await fetch(`/api/pipeline/status?creatorId=${creatorId}`);
            let data: { status?: string; pipeline_status?: string; error?: string } | null = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }

            if (!res.ok) {
                const authError = res.status === 401 || res.status === 403;
                setCurrentStatus('error');
                setStageIndex(-1);
                setError(
                    authError
                        ? 'Your session expired. Please sign in again, then retry the pipeline.'
                        : data?.error || 'Could not check pipeline status. Please retry.'
                );
                return;
            }

            const status = data?.status || data?.pipeline_status || 'pending';
            setCurrentStatus(status);
            const idx = statusToStageIndex(status);
            setStageIndex(idx);

            if (status === 'ready') {
                setShowConfetti(true);
                setTimeout(() => router.push('/dashboard'), 2500);
            } else if (status === 'failed' || status === 'error' || status === 'insufficient_content') {
                setError(normalizePipelineError(status, data?.error || null));
            }
        } catch {
            setCurrentStatus('error');
            setStageIndex(-1);
            setError('Network error while checking progress. Please retry.');
        }
    }, [creatorId, router]);

    useEffect(() => {
        if (currentStatus === 'ready') return;
        const interval = setInterval(poll, 3000);
        const timeout = setTimeout(() => { void poll(); }, 0);
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [poll, currentStatus]);

    // Retry handler
    const handleRetry = async () => {
        setRetrying(true);
        setError(null);
        try {
            const res = await fetch('/api/pipeline/retry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorId }),
            });
            if (res.ok) {
                setCurrentStatus('scraping');
                setStageIndex(0);
                setElapsed(0);
            } else {
                const data = await res.json();
                setError(data.error || 'Retry failed. Please try again.');
            }
        } catch {
            setError('Network error. Please check your connection.');
        }
        setRetrying(false);
    };

    const isComplete = currentStatus === 'ready';
    const isFailed = stageIndex === -1;

    // Estimated time text
    const estimatedTime = elapsed < 15
        ? 'Usually takes 30–60 seconds'
        : elapsed < 45
            ? 'Almost there...'
            : 'Taking a bit longer than usual...';

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
                    position: relative;
                    overflow: hidden;
                }
                /* Shimmer particles */
                .pipeline-progress::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: radial-gradient(circle at 20% 50%, rgba(139,92,246,0.08) 0%, transparent 50%),
                                radial-gradient(circle at 80% 20%, rgba(99,102,241,0.06) 0%, transparent 50%),
                                radial-gradient(circle at 50% 80%, rgba(139,92,246,0.05) 0%, transparent 50%);
                    animation: shimmerBg 8s ease-in-out infinite;
                    pointer-events: none;
                }
                @keyframes shimmerBg {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.05); }
                }
                .pipeline-avatar {
                    width: 96px; height: 96px;
                    border-radius: 50%;
                    border: 3px solid rgba(139, 92, 246, 0.5);
                    object-fit: cover;
                    margin-bottom: 1rem;
                    animation: avatarGlow 2s ease-in-out infinite;
                    position: relative;
                    z-index: 1;
                }
                @keyframes avatarGlow {
                    0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); }
                    50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); }
                }
                .pipeline-avatar-placeholder {
                    width: 96px; height: 96px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 2.5rem;
                    margin-bottom: 1rem;
                    animation: avatarGlow 2s ease-in-out infinite;
                    position: relative; z-index: 1;
                }
                .pipeline-name {
                    font-size: 1.5rem; font-weight: 700;
                    margin-bottom: 0.25rem;
                    position: relative; z-index: 1;
                }
                .pipeline-handle {
                    font-size: 0.875rem;
                    color: rgba(255,255,255,0.5);
                    margin-bottom: 1rem;
                    position: relative; z-index: 1;
                }
                .pipeline-estimate {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.35);
                    margin-bottom: 2rem;
                    position: relative; z-index: 1;
                    transition: opacity 0.3s;
                }
                .pipeline-stages {
                    width: 100%; max-width: 400px;
                    display: flex; flex-direction: column; gap: 0.75rem;
                    position: relative; z-index: 1;
                }
                .pipeline-stage {
                    display: flex; align-items: center; gap: 1rem;
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
                .pipeline-stage.done { opacity: 0.6; }
                .pipeline-stage-icon {
                    font-size: 1.5rem;
                    width: 2.5rem; height: 2.5rem;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .pipeline-stage-check {
                    width: 2.5rem; height: 2.5rem;
                    border-radius: 50%; background: #22c55e;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; font-size: 1rem;
                    animation: checkPop 0.3s ease;
                }
                @keyframes checkPop {
                    0% { transform: scale(0); }
                    70% { transform: scale(1.2); }
                    100% { transform: scale(1); }
                }
                .pipeline-stage-text { flex: 1; min-width: 0; }
                .pipeline-stage-label { font-weight: 600; font-size: 0.9rem; }
                .pipeline-stage-desc {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.5);
                    margin-top: 0.125rem;
                }
                .pipeline-spinner {
                    width: 2.5rem; height: 2.5rem;
                    border-radius: 50%;
                    border: 3px solid rgba(139, 92, 246, 0.2);
                    border-top-color: #8b5cf6;
                    animation: spin 1s linear infinite;
                    flex-shrink: 0;
                }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* Tips */
                .pipeline-tip {
                    max-width: 400px;
                    margin-top: 2rem;
                    text-align: center;
                    font-size: 0.8rem;
                    color: rgba(255,255,255,0.4);
                    min-height: 2.5rem;
                    position: relative; z-index: 1;
                    animation: tipFade 5s ease infinite;
                }
                @keyframes tipFade {
                    0%, 100% { opacity: 0; }
                    10%, 90% { opacity: 1; }
                }

                /* Error */
                .pipeline-error-box {
                    max-width: 400px;
                    margin-top: 2rem;
                    padding: 1.25rem 1.5rem;
                    background: rgba(239, 68, 68, 0.08);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    border-radius: 1rem;
                    text-align: center;
                    position: relative; z-index: 1;
                }
                .pipeline-error-msg {
                    color: #fca5a5;
                    font-size: 0.875rem;
                    margin-bottom: 1rem;
                    line-height: 1.5;
                }
                .pipeline-error-actions {
                    display: flex; gap: 0.75rem;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .pipeline-btn {
                    padding: 0.6rem 1.5rem;
                    border-radius: 2rem;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s;
                    border: none;
                }
                .pipeline-btn-primary {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                }
                .pipeline-btn-primary:hover {
                    box-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
                    transform: translateY(-1px);
                }
                .pipeline-btn-primary:disabled {
                    opacity: 0.5; cursor: not-allowed; transform: none;
                    box-shadow: none;
                }
                .pipeline-btn-ghost {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    color: rgba(255,255,255,0.7);
                }
                .pipeline-btn-ghost:hover {
                    background: rgba(255,255,255,0.12);
                }

                /* Celebration */
                .pipeline-celebration {
                    animation: celebratePulse 0.5s ease;
                }
                @keyframes celebratePulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                .pipeline-complete-msg {
                    margin-top: 1.5rem;
                    text-align: center;
                    position: relative; z-index: 1;
                }
                .pipeline-complete-msg h2 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #22c55e, #4ade80);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 0.25rem;
                }
                .pipeline-complete-msg p {
                    font-size: 0.85rem;
                    color: rgba(255,255,255,0.5);
                }

                /* Confetti */
                .confetti-container {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: 100;
                    overflow: hidden;
                }
                .confetti-piece {
                    position: absolute;
                    width: 10px; height: 10px;
                    top: -10px;
                    animation: confettiFall 3s ease-out forwards;
                }
                @keyframes confettiFall {
                    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }

                /* Skip */
                .pipeline-skip {
                    margin-top: 2rem; text-align: center;
                    position: relative; z-index: 1;
                    transition: opacity 0.5s;
                }
                .pipeline-skip-hint {
                    font-size: 0.65rem;
                    color: rgba(255,255,255,0.25);
                    margin-top: 0.5rem;
                }
            `}</style>

            {/* Confetti on completion */}
            {showConfetti && (
                <div className="confetti-container">
                    {confettiPieces.map((piece) => (
                        <div
                            key={piece.id}
                            className="confetti-piece"
                            style={{
                                left: piece.left,
                                backgroundColor: piece.backgroundColor,
                                borderRadius: piece.borderRadius,
                                width: piece.width,
                                height: piece.height,
                                animationDelay: piece.animationDelay,
                                animationDuration: piece.animationDuration,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Avatar */}
            {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="pipeline-avatar" />
            ) : (
                <div className="pipeline-avatar-placeholder">👤</div>
            )}

            <div className="pipeline-name">{displayName}</div>
            <div className="pipeline-handle">@{handle}</div>

            {/* Estimated time */}
            {!isComplete && !isFailed && (
                <div className="pipeline-estimate">{estimatedTime}</div>
            )}

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

            {/* Completion celebration */}
            {isComplete && (
                <div className="pipeline-complete-msg">
                    <h2>🎉 Your storefront is ready!</h2>
                    <p>Redirecting to your dashboard...</p>
                </div>
            )}

            {/* Error state with retry */}
            {isFailed && error && (
                <div className="pipeline-error-box">
                    <div className="pipeline-error-msg">{error}</div>
                    <div className="pipeline-error-actions">
                        <button
                            className="pipeline-btn pipeline-btn-primary"
                            onClick={handleRetry}
                            disabled={retrying}
                        >
                            {retrying ? 'Retrying...' : '🔄 Retry Pipeline'}
                        </button>
                        <button
                            className="pipeline-btn pipeline-btn-ghost"
                            onClick={() => router.push('/dashboard')}
                        >
                            Skip to Dashboard →
                        </button>
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                        <Link href="/" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textDecoration: 'underline' }}>
                            Or try a different username
                        </Link>
                    </div>
                </div>
            )}

            {/* Rotating tips */}
            {!isComplete && !isFailed && (
                <div className="pipeline-tip" key={tipIndex}>
                    {shuffledTips[tipIndex]}
                </div>
            )}

            {/* Skip button (after 30s) */}
            {!isComplete && !isFailed && (
                <div className="pipeline-skip" style={{ opacity: showSkip ? 1 : 0, pointerEvents: showSkip ? 'auto' : 'none' }}>
                    <button
                        className="pipeline-btn pipeline-btn-ghost"
                        onClick={() => router.push('/dashboard')}
                    >
                        Skip to Dashboard →
                    </button>
                    <div className="pipeline-skip-hint">
                        Your storefront is being set up in the background
                    </div>
                </div>
            )}
        </div>
    );
}
