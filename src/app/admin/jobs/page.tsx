import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminJobsPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') redirect('/dashboard');

    // Data queries use admin client (bypasses RLS)
    const adminSupabase = createAdminClient();

    // Fetch job counts by status
    const statuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
    const counts: Record<string, number> = {};
    for (const status of statuses) {
        const { count } = await adminSupabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('status', status);
        counts[status] = count || 0;
    }

    // Fetch recent failed jobs
    const { data: failedJobs } = await adminSupabase
        .from('jobs')
        .select('id, type, status, error_message, attempts, max_attempts, created_at, completed_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(20);

    // Fetch recently running jobs
    const { data: runningJobs } = await adminSupabase
        .from('jobs')
        .select('id, type, status, attempts, payload, started_at, created_at')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(10);

    // Fetch queued jobs
    const { data: queuedJobs } = await adminSupabase
        .from('jobs')
        .select('id, type, status, created_at')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(10);



    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <header className="border-b bg-white/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold">
                            <span className="text-primary">Owny</span>
                            <span className="text-muted-foreground ml-2 text-sm font-normal">Admin</span>
                        </h1>
                        <nav className="hidden sm:flex items-center gap-3 text-sm">
                            <Link href="/admin/creators" className="text-muted-foreground hover:text-foreground transition-colors">Creators</Link>
                            <Link href="/admin/products" className="text-muted-foreground hover:text-foreground transition-colors">Products</Link>
                            <Link href="/admin/jobs" className="font-medium text-primary">Jobs</Link>
                        </nav>
                    </div>
                    <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        ← Dashboard
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <h2 className="text-2xl font-bold mb-6">Job Queue</h2>

                {/* Status overview cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
                    {statuses.map((status) => (
                        <div key={status} className="rounded-xl border bg-white p-4">
                            <p className="text-xs text-muted-foreground uppercase font-medium">{status}</p>
                            <p className="text-2xl font-bold mt-1">{counts[status]}</p>
                        </div>
                    ))}
                </div>

                {/* Running jobs */}
                {(runningJobs?.length || 0) > 0 && (
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-3">Running ({runningJobs?.length})</h3>
                        <div className="rounded-xl border bg-white overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-slate-50">
                                        <th className="text-left px-4 py-2 font-medium">Type</th>
                                        <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Attempts</th>
                                        <th className="text-left px-4 py-2 font-medium">Started</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(runningJobs || []).map((job) => (
                                        <tr key={job.id} className="border-b last:border-0">
                                            <td className="px-4 py-2 font-medium">{job.type}</td>
                                            <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{job.attempts}</td>
                                            <td className="px-4 py-2 text-muted-foreground text-xs">
                                                {job.started_at ? new Date(job.started_at).toLocaleString() : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Queued jobs */}
                {(queuedJobs?.length || 0) > 0 && (
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-3">Queued ({counts.queued})</h3>
                        <div className="rounded-xl border bg-white overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-slate-50">
                                        <th className="text-left px-4 py-2 font-medium">Type</th>
                                        <th className="text-left px-4 py-2 font-medium">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(queuedJobs || []).map((job) => (
                                        <tr key={job.id} className="border-b last:border-0">
                                            <td className="px-4 py-2 font-medium">{job.type}</td>
                                            <td className="px-4 py-2 text-muted-foreground text-xs">
                                                {new Date(job.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Failed jobs */}
                <div>
                    <h3 className="text-lg font-semibold mb-3">
                        Recent Failures ({counts.failed})
                    </h3>
                    <div className="rounded-xl border bg-white overflow-hidden">
                        {(failedJobs?.length || 0) === 0 ? (
                            <p className="px-4 py-8 text-center text-muted-foreground">
                                No failed jobs 🎉
                            </p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-slate-50">
                                        <th className="text-left px-4 py-2 font-medium">Type</th>
                                        <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Attempts</th>
                                        <th className="text-left px-4 py-2 font-medium">Error</th>
                                        <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(failedJobs || []).map((job) => (
                                        <tr key={job.id} className="border-b last:border-0">
                                            <td className="px-4 py-2 font-medium">{job.type}</td>
                                            <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                                                {job.attempts}/{job.max_attempts}
                                            </td>
                                            <td className="px-4 py-2">
                                                <p className="text-xs text-red-600 max-w-xs truncate">
                                                    {job.error_message || 'Unknown error'}
                                                </p>
                                            </td>
                                            <td className="px-4 py-2 text-muted-foreground text-xs hidden md:table-cell">
                                                {new Date(job.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
