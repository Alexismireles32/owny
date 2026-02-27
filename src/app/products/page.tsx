// /products — Creator's product list page
// Shows all products for the current creator with status, type, and quick actions

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProductRow {
    id: string;
    title: string;
    slug: string | null;
    type: string;
    status: string;
    price_cents: number | null;
    currency: string;
    created_at: string;
}

interface ProductVersionRow {
    id: string;
    product_id: string;
    version_number: number;
    created_at: string;
    build_packet: Record<string, unknown> | null;
}

type GateKey =
    | 'brandFidelity'
    | 'distinctiveness'
    | 'accessibility'
    | 'contentDepth'
    | 'evidenceLock';

interface ParsedGateScore {
    score: number;
    threshold: number;
    passed: boolean;
}

interface QualityVersionEntry {
    id: string;
    productId: string;
    productTitle: string;
    versionNumber: number;
    createdAt: string;
    score: number;
    passed: boolean | null;
    failingGates: string[];
    gateScores: Partial<Record<GateKey, ParsedGateScore>>;
}

export default async function ProductsPage() {
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

    const { data: productsRaw } = await supabase
        .from('products')
        .select('id, title, slug, type, status, price_cents, currency, created_at')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false });
    const products = (productsRaw || []) as ProductRow[];

    const productTitleById = new Map(products.map((product) => [product.id, product.title]));
    const productIds = products.map((product) => product.id);

    let qualityVersions: QualityVersionEntry[] = [];
    if (productIds.length > 0) {
        const { data: versionRowsRaw } = await supabase
            .from('product_versions')
            .select('id, product_id, version_number, created_at, build_packet')
            .in('product_id', productIds)
            .order('created_at', { ascending: false })
            .limit(240);

        const versionRows = (versionRowsRaw || []) as ProductVersionRow[];
        qualityVersions = versionRows
            .map((row) => {
                const quality = parseVersionQuality(row.build_packet);
                if (!quality || quality.overallScore === null) return null;
                return {
                    id: row.id,
                    productId: row.product_id,
                    productTitle: productTitleById.get(row.product_id) || 'Unknown product',
                    versionNumber: row.version_number,
                    createdAt: row.created_at,
                    score: quality.overallScore,
                    passed: quality.overallPassed,
                    failingGates: quality.failingGates,
                    gateScores: quality.gateScores,
                } as QualityVersionEntry;
            })
            .filter((entry): entry is QualityVersionEntry => Boolean(entry));
    }

    const trendWindow = qualityVersions.slice(0, 24).reverse();
    const trendScores = qualityVersions.map((entry) => entry.score);
    const avgScore = trendScores.length > 0
        ? Math.round(trendScores.reduce((sum, score) => sum + score, 0) / trendScores.length)
        : null;
    const medianScore = trendScores.length > 0 ? percentile(trendScores, 0.5) : null;
    const p30Score = trendScores.length > 0 ? percentile(trendScores, 0.3) : null;
    const recommendedFloor = p30Score !== null ? clamp(Math.round(p30Score), 65, 90) : null;

    const passRows = qualityVersions.filter((entry) => entry.passed !== null);
    const passRate = passRows.length > 0
        ? Math.round((passRows.filter((entry) => entry.passed).length / passRows.length) * 100)
        : null;

    const newestTrendScore = trendWindow.length > 0 ? trendWindow[trendWindow.length - 1].score : null;
    const oldestTrendScore = trendWindow.length > 0 ? trendWindow[0].score : null;
    const trendDelta = newestTrendScore !== null && oldestTrendScore !== null
        ? newestTrendScore - oldestTrendScore
        : null;

    const gateFailureCounts = new Map<string, number>();
    for (const entry of qualityVersions) {
        for (const gate of entry.failingGates) {
            gateFailureCounts.set(gate, (gateFailureCounts.get(gate) || 0) + 1);
        }
    }
    const topFailingGates = Array.from(gateFailureCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([gate, count]) => ({ gate, count }));

    const chartData = buildQualityChartData(trendWindow);
    const gateTrendCards = getGateKeys().map((gate) => {
        const points = qualityVersions
            .map((entry) => {
                const gateScore = entry.gateScores[gate];
                if (!gateScore) return null;
                return {
                    id: `${entry.id}:${gate}`,
                    productTitle: entry.productTitle,
                    versionNumber: entry.versionNumber,
                    createdAt: entry.createdAt,
                    score: gateScore.score,
                    passed: gateScore.passed,
                    threshold: gateScore.threshold,
                };
            })
            .filter((point): point is {
                id: string;
                productTitle: string;
                versionNumber: number;
                createdAt: string;
                score: number;
                passed: boolean;
                threshold: number;
            } => Boolean(point));

        const windowPoints = points.slice(0, 24).reverse();
        const scores = points.map((point) => point.score);
        const median = scores.length > 0 ? percentile(scores, 0.5) : null;
        const passRateForGate = points.length > 0
            ? Math.round((points.filter((point) => point.passed).length / points.length) * 100)
            : null;
        const p30 = scores.length > 0 ? percentile(scores, 0.3) : null;
        const suggestedFloorForGate = p30 !== null ? clamp(Math.round(p30), 60, 92) : null;
        const trendData = buildMiniTrendData(windowPoints);
        const latest = windowPoints.length > 0 ? windowPoints[windowPoints.length - 1].score : null;
        const earliest = windowPoints.length > 0 ? windowPoints[0].score : null;
        const delta = latest !== null && earliest !== null ? latest - earliest : null;
        const latestThreshold = windowPoints.length > 0 ? windowPoints[windowPoints.length - 1].threshold : null;

        return {
            gate,
            label: formatGateLabel(gate),
            windowPoints,
            median,
            passRate: passRateForGate,
            suggestedFloor: suggestedFloorForGate,
            trendData,
            delta,
            latestThreshold,
        };
    }).filter((card) => card.windowPoints.length > 0);

    const formatType = (type: string) => {
        const map: Record<string, string> = {
            pdf_guide: 'PDF Guide',
            mini_course: 'Mini Course',
            challenge_7day: '7-Day Challenge',
            checklist_toolkit: 'Toolkit',
        };
        return map[type] || type;
    };

    const formatPrice = (cents: number | null, currency: string) => {
        if (!cents || cents === 0) return 'Free';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'usd',
        }).format(cents / 100);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                            ← Dashboard
                        </Link>
                        <h1 className="text-sm font-medium">My Products</h1>
                    </div>
                    <Link href="/dashboard">
                        <Button size="sm">+ New Product</Button>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto max-w-3xl px-4 py-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold">Products</h2>
                    <p className="text-muted-foreground text-sm mt-1">{products.length} {products.length === 1 ? 'product' : 'products'}</p>
                </div>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-base">Creator Quality Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {qualityVersions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No quality-scored versions yet. Generate products to start threshold tuning.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <MetricCard label="Avg Score" value={avgScore !== null ? `${avgScore}` : '—'} />
                                    <MetricCard label="Median" value={medianScore !== null ? `${medianScore}` : '—'} />
                                    <MetricCard label="Pass Rate" value={passRate !== null ? `${passRate}%` : '—'} />
                                    <MetricCard label="Suggested Floor" value={recommendedFloor !== null ? `${recommendedFloor}` : '—'} />
                                </div>

                                {chartData && (
                                    <div className="rounded-lg border p-3 bg-muted/20">
                                        <svg viewBox={`0 0 ${chartData.width} ${chartData.height}`} className="w-full h-44">
                                            <rect x="0" y="0" width={chartData.width} height={chartData.height} fill="transparent" />
                                            {[0, 25, 50, 75, 100].map((score) => {
                                                const y = chartData.padding + ((100 - score) / 100) * chartData.plotHeight;
                                                return (
                                                    <g key={score}>
                                                        <line
                                                            x1={chartData.padding}
                                                            y1={y}
                                                            x2={chartData.width - chartData.padding}
                                                            y2={y}
                                                            stroke="currentColor"
                                                            strokeOpacity="0.12"
                                                            strokeWidth="1"
                                                        />
                                                        <text
                                                            x={6}
                                                            y={y + 4}
                                                            fontSize="10"
                                                            fill="currentColor"
                                                            opacity="0.55"
                                                        >
                                                            {score}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {recommendedFloor !== null && (
                                                <line
                                                    x1={chartData.padding}
                                                    y1={chartData.padding + ((100 - recommendedFloor) / 100) * chartData.plotHeight}
                                                    x2={chartData.width - chartData.padding}
                                                    y2={chartData.padding + ((100 - recommendedFloor) / 100) * chartData.plotHeight}
                                                    stroke="#f59e0b"
                                                    strokeDasharray="4 4"
                                                    strokeWidth="1.5"
                                                    opacity="0.9"
                                                />
                                            )}

                                            <path d={chartData.path} fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
                                            {chartData.points.map((point) => (
                                                <circle
                                                    key={point.id}
                                                    cx={point.x}
                                                    cy={point.y}
                                                    r="3.2"
                                                    fill={point.passed ? '#10b981' : '#f59e0b'}
                                                >
                                                    <title>
                                                        {`${point.productTitle} v${point.versionNumber} · ${point.score}/100 · ${new Date(point.createdAt).toLocaleDateString()}`}
                                                    </title>
                                                </circle>
                                            ))}
                                        </svg>
                                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                            <span>
                                                Last {trendWindow.length} scored versions
                                                {trendDelta !== null ? ` · Trend ${trendDelta >= 0 ? '+' : ''}${trendDelta}` : ''}
                                            </span>
                                            <span>
                                                {new Date(trendWindow[0].createdAt).toLocaleDateString()} → {new Date(trendWindow[trendWindow.length - 1].createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Threshold Tuning Signals</p>
                                    {topFailingGates.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No recurring failing gates in recent data.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {topFailingGates.map((item) => (
                                                <Badge key={item.gate} variant="secondary">
                                                    {formatGateLabel(item.gate)} · {item.count}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {gateTrendCards.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Per-Gate Trends</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {gateTrendCards.map((gateCard) => {
                                                const latestPoint = gateCard.windowPoints[gateCard.windowPoints.length - 1] || null;
                                                const passTone = latestPoint && gateCard.latestThreshold !== null
                                                    ? latestPoint.score >= gateCard.latestThreshold
                                                    : true;

                                                return (
                                                    <div key={gateCard.gate} className="rounded-lg border bg-background p-3">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-sm font-medium">{gateCard.label}</p>
                                                            {gateCard.median !== null && (
                                                                <Badge variant={passTone ? 'default' : 'secondary'} className="text-[11px]">
                                                                    median {gateCard.median}
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                                                            <span>Pass: {gateCard.passRate !== null ? `${gateCard.passRate}%` : '—'}</span>
                                                            <span>Floor: {gateCard.suggestedFloor !== null ? gateCard.suggestedFloor : '—'}</span>
                                                            <span>Trend: {gateCard.delta !== null ? `${gateCard.delta >= 0 ? '+' : ''}${gateCard.delta}` : '—'}</span>
                                                        </div>

                                                        {gateCard.trendData && (
                                                            <div className="mt-2 rounded border bg-muted/20 p-2">
                                                                <svg viewBox={`0 0 ${gateCard.trendData.width} ${gateCard.trendData.height}`} className="w-full h-20">
                                                                    <rect x="0" y="0" width={gateCard.trendData.width} height={gateCard.trendData.height} fill="transparent" />
                                                                    <line
                                                                        x1={gateCard.trendData.padding}
                                                                        y1={gateCard.trendData.padding + gateCard.trendData.plotHeight}
                                                                        x2={gateCard.trendData.width - gateCard.trendData.padding}
                                                                        y2={gateCard.trendData.padding + gateCard.trendData.plotHeight}
                                                                        stroke="currentColor"
                                                                        strokeOpacity="0.14"
                                                                        strokeWidth="1"
                                                                    />
                                                                    {gateCard.latestThreshold !== null && (
                                                                        <line
                                                                            x1={gateCard.trendData.padding}
                                                                            y1={gateCard.trendData.padding + ((100 - gateCard.latestThreshold) / 100) * gateCard.trendData.plotHeight}
                                                                            x2={gateCard.trendData.width - gateCard.trendData.padding}
                                                                            y2={gateCard.trendData.padding + ((100 - gateCard.latestThreshold) / 100) * gateCard.trendData.plotHeight}
                                                                            stroke="#f59e0b"
                                                                            strokeDasharray="3 3"
                                                                            strokeWidth="1.2"
                                                                            opacity="0.8"
                                                                        />
                                                                    )}
                                                                    <path
                                                                        d={gateCard.trendData.path}
                                                                        fill="none"
                                                                        stroke={passTone ? '#10b981' : '#f59e0b'}
                                                                        strokeWidth="2.2"
                                                                    />
                                                                    {gateCard.trendData.points.map((point) => (
                                                                        <circle
                                                                            key={point.id}
                                                                            cx={point.x}
                                                                            cy={point.y}
                                                                            r="2.8"
                                                                            fill={point.passed ? '#10b981' : '#f59e0b'}
                                                                        >
                                                                            <title>
                                                                                {`${gateCard.label}: ${point.score}/100 · ${point.productTitle} v${point.versionNumber}`}
                                                                            </title>
                                                                        </circle>
                                                                    ))}
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {products.length === 0 ? (
                    <div className="rounded-xl border bg-white p-12 text-center">
                        <p className="text-3xl mb-3">📦</p>
                        <p className="font-medium text-lg">No products yet</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                            Create your first digital product from your video content.
                        </p>
                        <Link href="/dashboard">
                            <Button>Create Your First Product</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {products.map((product) => (
                            <Link
                                key={product.id}
                                href={`/products/${product.id}`}
                                className="block rounded-xl border bg-white p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold">{product.title}</h3>
                                            <Badge
                                                variant={product.status === 'published' ? 'default' : 'secondary'}
                                            >
                                                {product.status}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {formatType(product.type)} · {formatPrice(product.price_cents, product.currency)}
                                        </p>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(product.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold leading-tight mt-0.5">{value}</p>
        </div>
    );
}

interface ParsedQuality {
    overallScore: number | null;
    overallPassed: boolean | null;
    failingGates: string[];
    gateScores: Partial<Record<GateKey, ParsedGateScore>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseVersionQuality(buildPacket: Record<string, unknown> | null): ParsedQuality | null {
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

    const gateScores: Partial<Record<GateKey, ParsedGateScore>> = {};
    if (isRecord(buildPacket.qualityGateScores)) {
        for (const gate of getGateKeys()) {
            const raw = buildPacket.qualityGateScores[gate];
            if (!isRecord(raw)) continue;
            if (typeof raw.score !== 'number' || typeof raw.threshold !== 'number' || typeof raw.passed !== 'boolean') {
                continue;
            }
            gateScores[gate] = {
                score: Math.round(raw.score),
                threshold: Math.round(raw.threshold),
                passed: raw.passed,
            };
        }
    }

    if (overallScore === null && overallPassed === null && failingGates.length === 0 && Object.keys(gateScores).length === 0) {
        return null;
    }

    return { overallScore, overallPassed, failingGates, gateScores };
}

function percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return Math.round(sorted[lower]);
    const weight = idx - lower;
    return Math.round((sorted[lower] * (1 - weight)) + (sorted[upper] * weight));
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
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

function getGateKeys(): GateKey[] {
    return ['brandFidelity', 'distinctiveness', 'accessibility', 'contentDepth', 'evidenceLock'];
}

function buildMiniTrendData(points: Array<{
    id: string;
    productTitle: string;
    versionNumber: number;
    createdAt: string;
    score: number;
    passed: boolean;
    threshold: number;
}>) {
    if (points.length === 0) return null;

    const width = 280;
    const height = 92;
    const padding = 12;
    const plotWidth = width - (padding * 2);
    const plotHeight = height - (padding * 2);

    const normalizedPoints = points.map((point, index) => {
        const x = points.length === 1
            ? width / 2
            : padding + (index * (plotWidth / (points.length - 1)));
        const y = padding + ((100 - point.score) / 100) * plotHeight;
        return { ...point, x, y };
    });

    const path = normalizedPoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

    return {
        width,
        height,
        padding,
        plotHeight,
        path,
        points: normalizedPoints,
    };
}

function buildQualityChartData(entries: QualityVersionEntry[]) {
    if (entries.length === 0) return null;

    const width = 780;
    const height = 220;
    const padding = 24;
    const plotWidth = width - (padding * 2);
    const plotHeight = height - (padding * 2);

    const points = entries.map((entry, index) => {
        const x = entries.length === 1
            ? width / 2
            : padding + (index * (plotWidth / (entries.length - 1)));
        const y = padding + ((100 - entry.score) / 100) * plotHeight;
        return {
            id: entry.id,
            x,
            y,
            score: entry.score,
            productTitle: entry.productTitle,
            versionNumber: entry.versionNumber,
            createdAt: entry.createdAt,
            passed: entry.passed ?? false,
        };
    });

    const path = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

    return {
        width,
        height,
        padding,
        plotHeight,
        points,
        path,
    };
}
