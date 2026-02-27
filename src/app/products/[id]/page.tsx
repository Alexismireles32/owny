// /products/[id] — Product detail/manage page (creator-only)

import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ProductActions } from './product-actions';

interface Props {
    params: Promise<{ id: string }>;
}

interface ProductVersionRow {
    id: string;
    version_number: number;
    published_at: string | null;
    created_at: string;
    build_packet: Record<string, unknown> | null;
}

interface QualityGateScore {
    key: string;
    label: string;
    score: number;
    threshold: number;
    passed: boolean;
}

interface VersionQuality {
    overallScore: number | null;
    overallPassed: boolean | null;
    failingGates: string[];
    designCanonVersion: string | null;
    creativeDirectionName: string | null;
    creativeDirectionId: string | null;
    criticIterations: number | null;
    maxCatalogSimilarity: number | null;
    gateScores: QualityGateScore[];
}

export default async function ProductDetailPage({ params }: Props) {
    const { id } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (!creator) redirect('/onboard');

    const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
            *,
            product_versions(id, version_number, published_at, created_at, build_packet)
        `)
        .eq('id', id)
        .single();

    // If query errored (likely RLS/session issue), redirect instead of hard 404
    if (productError && !product) {
        console.error('Product query error:', productError.message, { id, creatorId: creator.id });
        // If PGRST116 (no rows), the product genuinely doesn't exist or RLS blocks it
        // Redirect to products list with a message rather than showing a 404 page
        redirect('/products');
    }

    if (!product || product.creator_id !== creator.id) {
        notFound();
    }

    const versions = (product.product_versions || []) as ProductVersionRow[];
    const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);
    const activeVersion = sortedVersions.find((version) => version.id === product.active_version_id) || sortedVersions[0] || null;
    const activeQuality = activeVersion ? parseVersionQuality(activeVersion.build_packet) : null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
                            ← Products
                        </Link>
                        <Separator orientation="vertical" className="h-4" />
                        <h1 className="text-sm font-medium truncate max-w-xs">{product.title}</h1>
                    </div>
                    <ProductActions productId={product.id} status={product.status} />
                </div>
            </header>

            <main className="container mx-auto max-w-3xl px-4 py-8">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-2xl font-bold">{product.title}</h2>
                            <Badge variant={product.status === 'published' ? 'default' : 'secondary'}>
                                {product.status}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">
                            {formatProductType(product.type)} · {formatPrice(product.price_cents, product.currency)}
                        </p>
                        {product.description && (
                            <p className="text-sm text-muted-foreground mt-2">{product.description}</p>
                        )}
                    </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">{versions.length}</p>
                            <p className="text-xs text-muted-foreground">Versions</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">{product.status === 'published' ? '✅' : '—'}</p>
                            <p className="text-xs text-muted-foreground">Published</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">
                                {product.slug ? (
                                    <Link href={`/p/${product.slug}`} className="text-primary hover:underline text-sm">
                                        View
                                    </Link>
                                ) : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">Sales Page</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 text-center">
                            <p className="text-2xl font-bold">
                                {activeQuality?.overallScore !== null ? `${activeQuality?.overallScore}` : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">Quality Score</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Version history */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Version History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {versions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No versions yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {sortedVersions.map((v) => {
                                    const quality = parseVersionQuality(v.build_packet);
                                    return (
                                        <div
                                            key={v.id}
                                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${v.id === product.active_version_id
                                                ? 'bg-primary/5 border border-primary/20'
                                                : 'bg-muted/50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium">v{v.version_number}</span>
                                                {v.id === product.active_version_id && (
                                                    <Badge variant="outline" className="text-xs">Active</Badge>
                                                )}
                                                {v.published_at && (
                                                    <Badge variant="secondary" className="text-xs">Published</Badge>
                                                )}
                                                {quality?.overallScore !== null && (
                                                    <Badge variant={quality?.overallPassed ? 'default' : 'secondary'} className="text-xs">
                                                        Quality {quality?.overallScore}
                                                    </Badge>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(v.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="text-base">Quality Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!activeQuality ? (
                            <p className="text-sm text-muted-foreground">No quality metadata yet. Generate a new version to populate this panel.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {activeQuality.overallScore !== null && (
                                        <Badge variant={activeQuality.overallPassed ? 'default' : 'secondary'}>
                                            Score {activeQuality.overallScore}/100
                                        </Badge>
                                    )}
                                    {activeQuality.designCanonVersion && (
                                        <Badge variant="outline">{activeQuality.designCanonVersion}</Badge>
                                    )}
                                    {activeQuality.creativeDirectionName && (
                                        <Badge variant="outline">{activeQuality.creativeDirectionName}</Badge>
                                    )}
                                    {activeQuality.criticIterations !== null && (
                                        <Badge variant="outline">Critic {activeQuality.criticIterations}</Badge>
                                    )}
                                </div>

                                {activeQuality.gateScores.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {activeQuality.gateScores.map((gate) => (
                                            <div key={gate.key} className="rounded-md border px-3 py-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-xs font-medium text-muted-foreground">{gate.label}</p>
                                                    <p className={`text-xs font-semibold ${gate.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {gate.score}/{gate.threshold}
                                                    </p>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className={`h-full ${gate.passed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                        style={{ width: `${Math.min(100, Math.max(0, gate.score))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeQuality.failingGates.length > 0 && (
                                    <p className="text-sm text-amber-700">
                                        Open gates: {activeQuality.failingGates.map(formatGateLabel).join(', ')}
                                    </p>
                                )}

                                {activeQuality.maxCatalogSimilarity !== null && (
                                    <p className="text-xs text-muted-foreground">
                                        Max catalog similarity: {Math.round(activeQuality.maxCatalogSimilarity * 100)}%
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* AI builder placeholder */}
                <Card className="mt-4">
                    <CardContent className="py-12 text-center">
                        <p className="text-3xl mb-2">🤖</p>
                        <p className="font-medium">AI Product Builder</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Design and customize your product pages with the Vibe Builder.
                        </p>
                        <Link href={`/products/${product.id}/builder`}>
                            <Button className="mt-4">
                                Open Builder
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatGateLabel(key: string): string {
    const labels: Record<string, string> = {
        brandFidelity: 'Brand Fidelity',
        distinctiveness: 'Distinctiveness',
        accessibility: 'Accessibility',
        contentDepth: 'Content Depth',
        evidenceLock: 'Evidence Lock',
    };
    return labels[key] || key;
}

function parseVersionQuality(buildPacket: Record<string, unknown> | null): VersionQuality | null {
    if (!isRecord(buildPacket)) return null;

    const overallScore = typeof buildPacket.qualityOverallScore === 'number'
        ? Math.round(buildPacket.qualityOverallScore)
        : null;
    const overallPassed = typeof buildPacket.qualityOverallPassed === 'boolean'
        ? buildPacket.qualityOverallPassed
        : null;
    const failingGates = Array.isArray(buildPacket.qualityFailingGates)
        ? buildPacket.qualityFailingGates
            .map((item) => (typeof item === 'string' ? item : null))
            .filter((item): item is string => Boolean(item))
        : [];
    const designCanonVersion = typeof buildPacket.designCanonVersion === 'string'
        ? buildPacket.designCanonVersion
        : null;
    const creativeDirectionName = typeof buildPacket.creativeDirectionName === 'string'
        ? buildPacket.creativeDirectionName
        : null;
    const creativeDirectionId = typeof buildPacket.creativeDirectionId === 'string'
        ? buildPacket.creativeDirectionId
        : null;
    const criticIterations = typeof buildPacket.criticIterations === 'number'
        ? buildPacket.criticIterations
        : null;
    const maxCatalogSimilarity = typeof buildPacket.maxCatalogSimilarity === 'number'
        ? buildPacket.maxCatalogSimilarity
        : null;

    const gateScores: QualityGateScore[] = [];
    if (isRecord(buildPacket.qualityGateScores)) {
        for (const [key, value] of Object.entries(buildPacket.qualityGateScores)) {
            if (!isRecord(value)) continue;
            if (typeof value.score !== 'number' || typeof value.threshold !== 'number' || typeof value.passed !== 'boolean') {
                continue;
            }
            gateScores.push({
                key,
                label: formatGateLabel(key),
                score: Math.round(value.score),
                threshold: Math.round(value.threshold),
                passed: value.passed,
            });
        }
    }

    if (
        overallScore === null
        && gateScores.length === 0
        && !designCanonVersion
        && !creativeDirectionName
        && !creativeDirectionId
    ) {
        return null;
    }

    return {
        overallScore,
        overallPassed,
        failingGates,
        designCanonVersion,
        creativeDirectionName,
        creativeDirectionId,
        criticIterations,
        maxCatalogSimilarity,
        gateScores,
    };
}

function formatPrice(cents: number | null, currency: string): string {
    if (!cents || cents === 0) return 'Free';
    const amount = cents / 100;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'usd',
    }).format(amount);
}
