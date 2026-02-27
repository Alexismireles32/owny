'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const TOUR_KEY = 'owny_tour_completed';

interface TourStep {
    title: string;
    description: string;
}

const STEPS: TourStep[] = [
    {
        title: 'Preview your storefront',
        description: 'See what customers will see before publishing.',
    },
    {
        title: 'Generate with your content',
        description: 'Create products from your transcript library, then refine in chat.',
    },
    {
        title: 'Manage products',
        description: 'Open, publish, and update products in one place.',
    },
    {
        title: 'Track performance',
        description: 'Review revenue and traffic as products go live.',
    },
];

interface WelcomeTourProps {
    displayName: string;
}

export function WelcomeTour({ displayName }: WelcomeTourProps) {
    const [step, setStep] = useState(-1);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const completed = localStorage.getItem(TOUR_KEY);
        if (!completed) {
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="Close welcome tour"
                className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]"
                onClick={handleSkip}
            />
            <Card className="relative w-full max-w-md border-slate-200 bg-white shadow-xl">
                <CardContent className="space-y-4 p-6">
                {isIntro ? (
                    <>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Welcome</p>
                        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                            Welcome, {displayName}
                        </h2>
                        <p className="text-sm leading-6 text-slate-600">
                            Your dashboard is ready. Take a quick tour to understand where everything lives.
                        </p>
                        <div className="flex gap-2 pt-1">
                            <Button type="button" variant="outline" className="flex-1" onClick={handleSkip}>
                                Skip
                            </Button>
                            <Button type="button" className="flex-1" onClick={handleNext}>
                                Start tour
                            </Button>
                        </div>
                    </>
                ) : currentStep && (
                    <>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Step {step + 1} of {STEPS.length}
                        </p>
                        <h3 className="text-xl font-semibold tracking-tight text-slate-900">{currentStep.title}</h3>
                        <p className="text-sm leading-6 text-slate-600">{currentStep.description}</p>
                        <div className="flex gap-2 pt-1">
                            <Button type="button" variant="outline" className="flex-1" onClick={handleBack}>
                                Back
                            </Button>
                            <Button type="button" className="flex-1" onClick={handleNext}>
                                {isLast ? 'Done' : 'Next'}
                            </Button>
                        </div>
                        <div className="flex justify-center gap-1.5 pt-1">
                            {STEPS.map((_, i) => (
                                <span
                                    key={i}
                                    className={`h-1.5 rounded-full ${i === step ? 'w-6 bg-slate-900' : 'w-2 bg-slate-300'}`}
                                />
                            ))}
                        </div>
                    </>
                )}
                </CardContent>
            </Card>
        </div>
    );
}
