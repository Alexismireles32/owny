// /library/[slug] — Content viewer for purchased products
// PRD M7: Course/challenge/checklist content with progress tracking

import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ContentProgressTracker } from './progress-tracker';
import { PdfDownloadButton } from './pdf-download-button';

interface Props {
    params: Promise<{ slug: string }>;
}

export default async function ContentViewerPage({ params }: Props) {
    const { slug } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    // Fetch product
    const { data: product } = await supabase
        .from('products')
        .select(`
            id, slug, type, title, description, status,
            active_version_id,
            creators(handle, display_name, avatar_url, brand_tokens)
        `)
        .eq('slug', slug)
        .single();

    if (!product) notFound();

    // Check entitlement
    const { data: entitlement } = await supabase
        .from('entitlements')
        .select('id')
        .eq('buyer_profile_id', user.id)
        .eq('product_id', product.id)
        .eq('status', 'active')
        .single();

    if (!entitlement) {
        redirect(`/p/${slug}?access=denied`);
    }

    // Fetch DSL content + generated HTML
    let dslJson: Record<string, unknown> | null = null;
    let generatedHtml: string | null = null;
    if (product.active_version_id) {
        const { data: version } = await supabase
            .from('product_versions')
            .select('dsl_json, generated_html')
            .eq('id', product.active_version_id)
            .single();
        dslJson = version?.dsl_json || null;
        generatedHtml = (version as unknown as { generated_html: string | null })?.generated_html || null;
    }

    // Fetch current progress
    const { data: progressRow } = await supabase
        .from('course_progress')
        .select('progress_data')
        .eq('buyer_profile_id', user.id)
        .eq('product_id', product.id)
        .single();

    const progress = (progressRow?.progress_data as Record<string, unknown>) || {
        completedBlockIds: [],
        lastAccessedAt: null,
        percentComplete: 0,
    };

    const creator = product.creators as unknown as {
        handle: string;
        display_name: string;
        avatar_url: string | null;
        brand_tokens: Record<string, string>;
    };

    const primaryColor = creator?.brand_tokens?.primaryColor || '#6366f1';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto flex h-14 items-center justify-between px-4">
                    <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">
                        ← My Library
                    </Link>
                    <span className="text-sm font-medium truncate max-w-xs">{product.title}</span>
                    <Badge variant="secondary">{formatProductType(product.type)}</Badge>
                </div>
            </header>

            <main className="container mx-auto max-w-2xl px-4 py-8">
                {/* Product header */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold">{product.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        by {creator?.display_name}
                    </p>
                </div>

                {/* PDF Guide — if we have generated HTML, show it + download */}
                {product.type === 'pdf_guide' && generatedHtml && (
                    <Card className="mb-6 overflow-hidden">
                        <CardContent className="p-0">
                            <iframe
                                srcDoc={generatedHtml}
                                sandbox="allow-scripts"
                                className="w-full border-0"
                                style={{ minHeight: '70vh' }}
                                title={product.title}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* PDF Guide — download only (no generated HTML) */}
                {product.type === 'pdf_guide' && !generatedHtml && (
                    <Card className="mb-6">
                        <CardContent className="py-8 text-center">
                            <p className="text-4xl mb-3">📄</p>
                            <h3 className="font-semibold mb-2">Your PDF Guide</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Download your guide to read offline.
                            </p>
                            <PdfDownloadButton slug={slug} primaryColor={primaryColor} />
                        </CardContent>
                    </Card>
                )}

                {/* Generated HTML viewer for non-PDF product types */}
                {product.type !== 'pdf_guide' && generatedHtml && (
                    <Card className="mb-6 overflow-hidden">
                        <CardContent className="p-0">
                            <iframe
                                srcDoc={generatedHtml}
                                sandbox="allow-scripts"
                                className="w-full border-0"
                                style={{ minHeight: '70vh' }}
                                title={product.title}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Course / Challenge / Checklist — DSL-based progress tracking (no generated HTML) */}
                {(product.type === 'mini_course' || product.type === 'challenge_7day' || product.type === 'checklist_toolkit') && !generatedHtml && (
                    <>
                        <Separator className="my-6" />

                        {dslJson && Object.keys(dslJson).length > 0 ? (
                            <ContentProgressTracker
                                productId={product.id}
                                dslJson={dslJson}
                                initialProgress={progress}
                                primaryColor={primaryColor}
                            />
                        ) : (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <p className="text-muted-foreground">
                                        Content is being generated. Check back soon!
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}

                {/* Fallback for empty DSL */}
                {!dslJson && product.type === 'pdf_guide' && (
                    <Card className="mt-4">
                        <CardHeader>
                            <CardTitle className="text-base">Preview</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                The PDF will be available for download once it&apos;s generated by the AI builder.
                            </p>
                        </CardContent>
                    </Card>
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
