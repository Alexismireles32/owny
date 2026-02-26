'use client';

// WelcomeTour — 4-step tooltip overlay for first-time dashboard visitors
// Steps: Storefront Preview → Create Product → My Products → Analytics
// Stored in localStorage to prevent showing again

import { useState, useEffect } from 'react';

const TOUR_KEY = 'owny_tour_completed';

interface TourStep {
    target: string;  // human-readable section name
    title: string;
    description: string;
    icon: string;
    position: 'left' | 'right';
}

const STEPS: TourStep[] = [
    {
        target: 'storefront',
        title: 'Your Live Storefront',
        description: 'This is a real-time preview of your public storefront. Customers will see this when they visit your page.',
        icon: '📱',
        position: 'left',
    },
    {
        target: 'builder',
        title: 'Create Products with AI',
        description: 'Tell the AI what you want to create — a PDF guide, mini course, or challenge — and it will build it from your TikTok content.',
        icon: '✨',
        position: 'right',
    },
    {
        target: 'products',
        title: 'Manage Your Products',
        description: 'All your products appear here. Edit, publish, or open the Vibe Builder to design premium sales pages.',
        icon: '📦',
        position: 'right',
    },
    {
        target: 'analytics',
        title: 'Track Your Performance',
        description: 'See revenue, sales, and page views in real time. Watch your business grow!',
        icon: '📊',
        position: 'left',
    },
];

interface WelcomeTourProps {
    displayName: string;
}

export function WelcomeTour({ displayName }: WelcomeTourProps) {
    const [step, setStep] = useState(-1); // -1 = intro screen
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const completed = localStorage.getItem(TOUR_KEY);
        if (!completed) {
            // Small delay so dashboard renders first
            const timer = setTimeout(() => setVisible(true), 800);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleSkip = () => {
        localStorage.setItem(TOUR_KEY, 'true');
        setVisible(false);
    };

    const handleNext = () => {
        if (step >= STEPS.length - 1) {
            localStorage.setItem(TOUR_KEY, 'true');
            setVisible(false);
        } else {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        setStep(Math.max(-1, step - 1));
    };

    if (!visible) return null;

    const currentStep = step >= 0 ? STEPS[step] : null;
    const isIntro = step === -1;
    const isLast = step === STEPS.length - 1;

    return (
        <div className="welcome-tour-overlay">
            <style>{`
                .welcome-tour-overlay {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: tourFadeIn 0.3s ease;
                }
                @keyframes tourFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .welcome-tour-backdrop {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                }
                .welcome-tour-card {
                    position: relative;
                    z-index: 1;
                    background: linear-gradient(135deg, #1a1a2e, #16213e);
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    border-radius: 1.5rem;
                    padding: 2.5rem;
                    max-width: 420px;
                    width: 90%;
                    text-align: center;
                    color: white;
                    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5),
                                0 0 40px rgba(139, 92, 246, 0.1);
                    animation: tourCardSlide 0.4s ease;
                }
                @keyframes tourCardSlide {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .tour-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                    display: block;
                    animation: tourIconBounce 2s ease-in-out infinite;
                }
                @keyframes tourIconBounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }
                .tour-title {
                    font-size: 1.4rem;
                    font-weight: 700;
                    margin-bottom: 0.5rem;
                    background: linear-gradient(135deg, #e0e7ff, #c4b5fd);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .tour-desc {
                    font-size: 0.9rem;
                    color: rgba(255,255,255,0.6);
                    line-height: 1.6;
                    margin-bottom: 2rem;
                }
                .tour-actions {
                    display: flex;
                    gap: 0.75rem;
                    justify-content: center;
                }
                .tour-btn {
                    padding: 0.65rem 1.5rem;
                    border-radius: 2rem;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s;
                    border: none;
                }
                .tour-btn-primary {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                }
                .tour-btn-primary:hover {
                    box-shadow: 0 0 24px rgba(139, 92, 246, 0.5);
                    transform: translateY(-1px);
                }
                .tour-btn-ghost {
                    background: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.6);
                }
                .tour-btn-ghost:hover {
                    background: rgba(255,255,255,0.12);
                    color: rgba(255,255,255,0.9);
                }
                .tour-progress {
                    display: flex;
                    gap: 0.4rem;
                    justify-content: center;
                    margin-top: 1.5rem;
                }
                .tour-dot {
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.2);
                    transition: all 0.3s;
                }
                .tour-dot.active {
                    background: #8b5cf6;
                    box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
                    width: 24px;
                    border-radius: 4px;
                }
                .tour-step-badge {
                    font-size: 0.7rem;
                    color: rgba(255,255,255,0.3);
                    margin-bottom: 0.5rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 600;
                }
            `}</style>

            <div className="welcome-tour-backdrop" onClick={handleSkip} />

            <div className="welcome-tour-card">
                {isIntro ? (
                    <>
                        <span className="tour-icon">🎉</span>
                        <div className="tour-title">
                            Welcome to Owny, {displayName}!
                        </div>
                        <div className="tour-desc">
                            Your storefront is ready. Let me give you a quick
                            30-second tour of your dashboard.
                        </div>
                        <div className="tour-actions">
                            <button className="tour-btn tour-btn-ghost" onClick={handleSkip}>
                                Skip Tour
                            </button>
                            <button className="tour-btn tour-btn-primary" onClick={handleNext}>
                                Show Me Around →
                            </button>
                        </div>
                    </>
                ) : currentStep && (
                    <>
                        <div className="tour-step-badge">
                            Step {step + 1} of {STEPS.length}
                        </div>
                        <span className="tour-icon">{currentStep.icon}</span>
                        <div className="tour-title">{currentStep.title}</div>
                        <div className="tour-desc">{currentStep.description}</div>
                        <div className="tour-actions">
                            <button className="tour-btn tour-btn-ghost" onClick={handleBack}>
                                ← Back
                            </button>
                            <button className="tour-btn tour-btn-primary" onClick={handleNext}>
                                {isLast ? 'Get Started! 🚀' : 'Next →'}
                            </button>
                        </div>
                        <div className="tour-progress">
                            {STEPS.map((_, i) => (
                                <div key={i} className={`tour-dot ${i === step ? 'active' : ''}`} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
