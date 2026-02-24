'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type Tab = 'tiktok' | 'csv' | 'manual';

interface JobResult {
    videosImported?: number;
    transcriptsFetched?: number;
    transcriptsImported?: number;
    phase?: string;
    totalRows?: number;
}

interface ImportJob {
    id: string;
    type: string;
    status: string;
    result: JobResult | null;
    error_message: string | null;
    created_at: string;
}

export default function ImportPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('tiktok');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // TikTok state
    const [handle, setHandle] = useState('');
    const [maxVideos, setMaxVideos] = useState(100);
    const [consent, setConsent] = useState(false);

    // CSV state
    const [csvFile, setCsvFile] = useState<File | null>(null);

    // Manual state
    const [manualTitle, setManualTitle] = useState('');
    const [manualUrl, setManualUrl] = useState('');
    const [manualTranscript, setManualTranscript] = useState('');

    // Import status
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    const [stats, setStats] = useState({ totalVideos: 0, totalTranscripts: 0 });

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/import/status');
            if (res.ok) {
                const data = await res.json();
                setJobs(data.jobs || []);
                setStats(data.stats || { totalVideos: 0, totalTranscripts: 0 });
            }
        } catch {
            // Silently fail on status fetch
        }
    }, []);

    useEffect(() => {
        // Use IIFE to avoid synchronous setState in effect body
        const load = async () => { await fetchStatus(); };
        load();
        // Poll while there's a running job
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    async function handleTikTokImport(e: React.FormEvent) {
        e.preventDefault();
        if (!handle.trim() || !consent) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch('/api/import/tiktok', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ handle: handle.trim(), maxVideos, consent }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Import failed');
            } else {
                setSuccess(`Import started! Job ID: ${data.jobId}. Videos will appear below as they're imported.`);
                fetchStatus();
            }
        } catch {
            setError('Network error');
        }
        setLoading(false);
    }

    async function handleCSVImport(e: React.FormEvent) {
        e.preventDefault();
        if (!csvFile) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const formData = new FormData();
            formData.append('file', csvFile);

            const res = await fetch('/api/import/csv', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'CSV import failed');
            } else {
                setSuccess(`Imported ${data.videosImported} videos and ${data.transcriptsImported} transcripts.`);
                fetchStatus();
            }
        } catch {
            setError('Network error');
        }
        setLoading(false);
    }

    async function handleManualAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!manualTranscript.trim()) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch('/api/import/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: manualTitle || undefined,
                    url: manualUrl || undefined,
                    transcript: manualTranscript.trim(),
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to add video');
            } else {
                setSuccess('Video added successfully!');
                setManualTitle('');
                setManualUrl('');
                setManualTranscript('');
                fetchStatus();
            }
        } catch {
            setError('Network error');
        }
        setLoading(false);
    }

    const statusColor = (status: string) => {
        switch (status) {
            case 'succeeded': return 'default';
            case 'running': return 'secondary';
            case 'queued': return 'outline';
            case 'failed': return 'destructive';
            default: return 'outline';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <h1 className="text-xl font-bold">
                        <span className="text-primary">Owny</span>
                        <span className="text-muted-foreground ml-2 text-sm font-normal">Import Videos</span>
                    </h1>
                    <Button variant="outline" onClick={() => router.push('/dashboard')}>
                        Dashboard
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-3xl">
                {/* Stats bar */}
                <div className="flex gap-4 mb-6">
                    <div className="rounded-lg border bg-white px-4 py-3 flex-1 text-center">
                        <p className="text-2xl font-bold">{stats.totalVideos}</p>
                        <p className="text-xs text-muted-foreground">Videos</p>
                    </div>
                    <div className="rounded-lg border bg-white px-4 py-3 flex-1 text-center">
                        <p className="text-2xl font-bold">{stats.totalTranscripts}</p>
                        <p className="text-xs text-muted-foreground">Transcripts</p>
                    </div>
                </div>

                {/* Import tabs */}
                <Card>
                    <CardHeader>
                        <CardTitle>Import Content</CardTitle>
                        <CardDescription>
                            Bring your video library into Owny to generate products
                        </CardDescription>
                        <div className="flex gap-1 mt-3">
                            {(['tiktok', 'csv', 'manual'] as Tab[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => { setActiveTab(tab); setError(null); setSuccess(null); }}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === tab
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted'
                                        }`}
                                >
                                    {tab === 'tiktok' ? 'TikTok' : tab === 'csv' ? 'CSV Upload' : 'Manual Paste'}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">
                                {success}
                            </div>
                        )}

                        {activeTab === 'tiktok' && (
                            <form onSubmit={handleTikTokImport} className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="tiktok-handle" className="text-sm font-medium">
                                        TikTok Handle
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">@</span>
                                        <Input
                                            id="tiktok-handle"
                                            placeholder="yourusername"
                                            value={handle}
                                            onChange={(e) => setHandle(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="max-videos" className="text-sm font-medium">
                                        Max Videos to Import
                                    </label>
                                    <Input
                                        id="max-videos"
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={maxVideos}
                                        onChange={(e) => setMaxVideos(parseInt(e.target.value) || 100)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Up to 500. More videos = more content for products.
                                    </p>
                                </div>

                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={consent}
                                        onChange={(e) => setConsent(e.target.checked)}
                                        className="mt-1 h-4 w-4"
                                    />
                                    <span className="text-sm text-muted-foreground">
                                        I own or control the TikTok account <strong>@{handle || '...'}</strong> and
                                        authorize Owny to import its public video data.
                                    </span>
                                </label>

                                <Button type="submit" className="w-full" disabled={loading || !consent || !handle.trim()}>
                                    {loading ? 'Starting Import...' : 'Import from TikTok'}
                                </Button>
                            </form>
                        )}

                        {activeTab === 'csv' && (
                            <form onSubmit={handleCSVImport} className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="csv-file" className="text-sm font-medium">
                                        CSV File
                                    </label>
                                    <Input
                                        id="csv-file"
                                        type="file"
                                        accept=".csv,.tsv,.txt"
                                        onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Columns: <code>title, url, transcript, views, created_at</code>.
                                        At minimum include <code>transcript</code>.
                                    </p>
                                </div>

                                <Button type="submit" className="w-full" disabled={loading || !csvFile}>
                                    {loading ? 'Importing...' : 'Upload CSV'}
                                </Button>
                            </form>
                        )}

                        {activeTab === 'manual' && (
                            <form onSubmit={handleManualAdd} className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="manual-title" className="text-sm font-medium">
                                        Title <span className="text-muted-foreground">(optional)</span>
                                    </label>
                                    <Input
                                        id="manual-title"
                                        placeholder="My video about fitness..."
                                        value={manualTitle}
                                        onChange={(e) => setManualTitle(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="manual-url" className="text-sm font-medium">
                                        Video URL <span className="text-muted-foreground">(optional)</span>
                                    </label>
                                    <Input
                                        id="manual-url"
                                        placeholder="https://tiktok.com/@user/video/..."
                                        value={manualUrl}
                                        onChange={(e) => setManualUrl(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="manual-transcript" className="text-sm font-medium">
                                        Transcript <span className="text-destructive">*</span>
                                    </label>
                                    <textarea
                                        id="manual-transcript"
                                        rows={6}
                                        placeholder="Paste your video transcript here..."
                                        value={manualTranscript}
                                        onChange={(e) => setManualTranscript(e.target.value)}
                                        required
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    />
                                </div>

                                <Button type="submit" className="w-full" disabled={loading || !manualTranscript.trim()}>
                                    {loading ? 'Adding...' : 'Add Video'}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>

                {/* Job history */}
                {jobs.length > 0 && (
                    <>
                        <Separator className="my-8" />
                        <h3 className="text-lg font-semibold mb-4">Import History</h3>
                        <div className="space-y-3">
                            {jobs.map((job) => (
                                <div key={job.id} className="rounded-lg border bg-white p-4 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-sm">
                                                {job.type === 'tiktok_import' ? 'TikTok Import' :
                                                    job.type === 'csv_parse' ? 'CSV Upload' : job.type}
                                            </p>
                                            <Badge variant={statusColor(job.status) as "default" | "secondary" | "outline" | "destructive"}>
                                                {job.status}
                                            </Badge>
                                        </div>
                                        {job.result && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {job.result.videosImported != null && `${job.result.videosImported} videos`}
                                                {job.result.transcriptsFetched != null && ` · ${job.result.transcriptsFetched} transcripts`}
                                                {job.result.phase && ` · ${job.result.phase}`}
                                            </p>
                                        )}
                                        {job.error_message && (
                                            <p className="text-xs text-destructive mt-1">{job.error_message}</p>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(job.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
