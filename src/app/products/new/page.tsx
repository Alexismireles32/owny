'use client';

// /products/new — Product wizard: type selection → details → review
// PRD M5: Product creation wizard for creators

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ProductType = 'pdf_guide' | 'mini_course' | 'challenge_7day' | 'checklist_toolkit';

const PRODUCT_TYPES: { value: ProductType; label: string; description: string; icon: string }[] = [
    {
        value: 'pdf_guide',
        label: 'PDF Guide',
        description: 'A downloadable PDF packed with actionable content from your videos.',
        icon: '📄',
    },
    {
        value: 'mini_course',
        label: 'Mini Course',
        description: 'Multi-module course with lessons your fans can progress through.',
        icon: '🎓',
    },
    {
        value: 'challenge_7day',
        label: '7-Day Challenge',
        description: 'A structured daily challenge to keep your audience engaged.',
        icon: '🔥',
    },
    {
        value: 'checklist_toolkit',
        label: 'Checklist Toolkit',
        description: 'Interactive checklists and tools your fans can use right away.',
        icon: '✅',
    },
];

type Step = 'type' | 'details' | 'review';

export default function NewProductPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('type');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [productType, setProductType] = useState<ProductType | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priceCents, setPriceCents] = useState<number>(999); // $9.99 default
    const [accessType, setAccessType] = useState<string>('paid');

    async function handleCreate() {
        if (!productType || !title.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: productType,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    priceCents: accessType === 'paid' ? priceCents : 0,
                    accessType,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to create product');
            } else {
                router.push(`/products/${data.product.id}/builder`);
            }
        } catch {
            setError('Network error');
        }
        setLoading(false);
    }

    const selectedType = PRODUCT_TYPES.find((t) => t.value === productType);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <h1 className="text-xl font-bold">
                        <span className="text-primary">Owny</span>
                        <span className="text-muted-foreground ml-2 text-sm font-normal">New Product</span>
                    </h1>
                    <Button variant="outline" onClick={() => router.push('/products')}>
                        Cancel
                    </Button>
                </div>
            </header>

            <main className="container mx-auto max-w-2xl px-4 py-8">
                {/* Progress */}
                <div className="flex items-center gap-2 mb-8">
                    {(['type', 'details', 'review'] as Step[]).map((s, i) => (
                        <div key={s} className="flex items-center gap-2 flex-1">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s
                                    ? 'bg-primary text-primary-foreground'
                                    : i < ['type', 'details', 'review'].indexOf(step)
                                        ? 'bg-green-500 text-white'
                                        : 'bg-muted text-muted-foreground'
                                    }`}
                            >
                                {i + 1}
                            </div>
                            <span className="text-sm text-muted-foreground capitalize hidden sm:inline">
                                {s === 'type' ? 'Type' : s === 'details' ? 'Details' : 'Review'}
                            </span>
                            {i < 2 && <div className="flex-1 h-px bg-border" />}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
                        {error}
                    </div>
                )}

                {/* Step 1: Type selection */}
                {step === 'type' && (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold">What would you like to create?</h2>
                        <p className="text-muted-foreground text-sm">
                            Choose a product type. AI will generate content from your video library.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 mt-6">
                            {PRODUCT_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    onClick={() => setProductType(type.value)}
                                    className={`rounded-xl border p-5 text-left transition-all hover:shadow-md ${productType === type.value
                                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                        : 'bg-white hover:border-primary/30'
                                        }`}
                                >
                                    <div className="text-2xl mb-2">{type.icon}</div>
                                    <h3 className="font-semibold">{type.label}</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {type.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                        <Button
                            className="w-full mt-4"
                            disabled={!productType}
                            onClick={() => setStep('details')}
                        >
                            Continue
                        </Button>
                    </div>
                )}

                {/* Step 2: Details */}
                {step === 'details' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Product Details</h2>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    {selectedType?.icon} {selectedType?.label}
                                </CardTitle>
                                <CardDescription>
                                    Fill in the basics — AI will help generate content later.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="title" className="text-sm font-medium">
                                        Title <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                        id="title"
                                        placeholder="e.g. The Ultimate Morning Routine Guide"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="description" className="text-sm font-medium">
                                        Description
                                    </label>
                                    <textarea
                                        id="description"
                                        rows={3}
                                        placeholder="Brief description for the sales page..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Access</label>
                                    <div className="flex gap-2">
                                        {[
                                            { value: 'paid', label: 'Paid' },
                                            { value: 'email_gated', label: 'Free (email)' },
                                            { value: 'public', label: 'Public' },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => setAccessType(option.value)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${accessType === option.value
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                                    }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {accessType === 'paid' && (
                                    <div className="space-y-2">
                                        <label htmlFor="price" className="text-sm font-medium">
                                            Price (USD)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">$</span>
                                            <Input
                                                id="price"
                                                type="number"
                                                min={0.5}
                                                step={0.01}
                                                value={(priceCents / 100).toFixed(2)}
                                                onChange={(e) =>
                                                    setPriceCents(Math.round(parseFloat(e.target.value || '0') * 100))
                                                }
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setStep('type')} className="flex-1">
                                Back
                            </Button>
                            <Button
                                onClick={() => setStep('review')}
                                disabled={!title.trim()}
                                className="flex-1"
                            >
                                Review
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Review */}
                {step === 'review' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Review & Create</h2>
                        <Card>
                            <CardContent className="pt-6 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Type</span>
                                    <span className="text-sm font-medium">
                                        {selectedType?.icon} {selectedType?.label}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Title</span>
                                    <span className="text-sm font-medium">{title}</span>
                                </div>
                                {description && (
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Description</span>
                                        <span className="text-sm font-medium text-right max-w-[60%]">
                                            {description}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Access</span>
                                    <span className="text-sm font-medium capitalize">{accessType}</span>
                                </div>
                                {accessType === 'paid' && (
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Price</span>
                                        <span className="text-sm font-bold">
                                            ${(priceCents / 100).toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <p className="text-xs text-muted-foreground text-center">
                            Your product will be created as a draft. Use the AI builder to generate
                            content, then publish when ready.
                        </p>

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setStep('details')} className="flex-1">
                                Back
                            </Button>
                            <Button onClick={handleCreate} disabled={loading} className="flex-1">
                                {loading ? 'Creating...' : 'Create Product'}
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
