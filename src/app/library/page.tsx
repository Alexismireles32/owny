'use client';

// /library — Buyer's library of purchased/entitled products
// PRD M7: Shows all products the buyer has access to with progress

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getApiErrorMessage, isAuthStatus, readJsonSafe } from '@/lib/utils';

interface LibraryItem {
    id: string;
    status: string;
    granted_via: string;
    created_at: string;
    products: {
        id: string;
        slug: string;
        type: string;
        title: string;
        description: string | null;
        price_cents: number | null;
        currency: string;
        creators: {
            handle: string;
            display_name: string;
            avatar_url: string | null;
        };
    };
    progress: { percentComplete: number } | null;
}

export default function LibraryPage() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLibrary = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch('/api/library');
            const data = await readJsonSafe<{ entitlements?: LibraryItem[]; error?: string }>(res);

            if (!res.ok) {
                if (isAuthStatus(res.status)) {
                    window.location.href = '/sign-in?next=%2Flibrary';
                    return;
                }
                setItems([]);
                setError(getApiErrorMessage(data, 'Failed to load your library.'));
                return;
            }

            setItems(data?.entitlements || []);
        } catch {
            setItems([]);
            setError('Network error while loading your library.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const load = async () => { await fetchLibrary(); };
        load();
    }, [fetchLibrary]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <h1 className="text-xl font-bold">
                        <span className="text-primary">Owny</span>
                        <span className="text-muted-foreground ml-2 text-sm font-normal">My Library</span>
                    </h1>
                    <Link href="/">
                        <Button variant="outline" size="sm">Browse</Button>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto max-w-3xl px-4 py-8">
                {loading ? (
                    <p className="text-center text-muted-foreground py-12">Loading your library…</p>
                ) : error ? (
                    <div className="text-center py-16">
                        <p className="text-destructive mb-4">{error}</p>
                        <Button variant="outline" onClick={() => void fetchLibrary()}>
                            Retry
                        </Button>
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-4xl mb-4">📚</p>
                        <h2 className="text-xl font-bold mb-2">Your library is empty</h2>
                        <p className="text-muted-foreground mb-6">
                            Products you purchase will appear here.
                        </p>
                        <Link href="/">
                            <Button>Browse Products</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item) => (
                            <Card key={item.id} className="overflow-hidden">
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle className="text-lg">
                                                {item.products.title}
                                            </CardTitle>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                by {item.products.creators.display_name}
                                            </p>
                                        </div>
                                        <Badge variant="secondary">
                                            {formatProductType(item.products.type)}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {item.products.description && (
                                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                            {item.products.description}
                                        </p>
                                    )}

                                    {/* Progress bar */}
                                    {item.progress && item.progress.percentComplete > 0 && (
                                        <div className="mb-3">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-muted-foreground">Progress</span>
                                                <span className="font-medium">{item.progress.percentComplete}%</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-2">
                                                <div
                                                    className="bg-primary h-2 rounded-full transition-all"
                                                    style={{ width: `${item.progress.percentComplete}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <Link href={`/library/${item.products.slug}`} className="flex-1">
                                            <Button className="w-full" size="sm">
                                                {item.products.type === 'pdf_guide' ? 'View & Download' : 'Continue'}
                                            </Button>
                                        </Link>
                                        {item.products.type === 'pdf_guide' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={async () => {
                                                    const res = await fetch(`/api/content/${item.products.slug}/download`);
                                                    const data = await readJsonSafe<{ downloadUrl?: string; error?: string }>(res);
                                                    if (!res.ok) {
                                                        if (isAuthStatus(res.status)) {
                                                            window.location.href = `/sign-in?next=${encodeURIComponent('/library')}`;
                                                            return;
                                                        }
                                                        setError(getApiErrorMessage(data, 'Could not prepare your PDF download.'));
                                                        return;
                                                    }

                                                    if (data?.downloadUrl) {
                                                        window.open(data.downloadUrl, '_blank');
                                                        return;
                                                    }

                                                    setError('Could not prepare your PDF download.');
                                                }}
                                            >
                                                ⬇ PDF
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function formatProductType(type: string): string {
    const map: Record<string, string> = {
        pdf_guide: 'PDF Guide',
        mini_course: 'Mini Course',
        challenge_7day: '7-Day Challenge',
        checklist_toolkit: 'Toolkit',
    };
    return map[type] || type;
}
