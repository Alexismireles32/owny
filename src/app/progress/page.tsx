// /progress — Pipeline Progress page
// Shows animated progress while ScrapeCreators pipeline runs
// Redirects to /dashboard when complete

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PipelineProgress } from '@/components/pipeline/PipelineProgress';

export default async function ProgressPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    // Fetch creator for this user
    const { data: creator } = await supabase
        .from('creators')
        .select('id, handle, display_name, avatar_url, pipeline_status, pipeline_error')
        .eq('profile_id', user.id)
        .single();

    // No creator yet — send back to landing to enter handle
    if (!creator) redirect('/');

    // Pipeline already done — go to dashboard
    const status = creator.pipeline_status || 'pending';
    if (status === 'ready') redirect('/dashboard');

    return (
        <PipelineProgress
            creatorId={creator.id}
            handle={creator.handle}
            displayName={creator.display_name}
            avatarUrl={creator.avatar_url}
            initialStatus={status}
            initialError={creator.pipeline_error}
        />
    );
}
