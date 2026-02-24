// src/lib/import/jobs.ts
// DB-based job queue helpers using the `jobs` table

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job, JobType, JobStatus } from '@/types/database';

export interface CreateJobInput {
    type: JobType;
    creatorId: string;
    payload?: Record<string, unknown>;
    maxAttempts?: number;
}

/**
 * Create a new job in the queue
 */
export async function createJob(
    supabase: SupabaseClient,
    input: CreateJobInput
): Promise<Job | null> {
    const { data, error } = await supabase
        .from('jobs')
        .insert({
            type: input.type,
            creator_id: input.creatorId,
            payload: input.payload || {},
            max_attempts: input.maxAttempts ?? 5,
            status: 'queued' as JobStatus,
        })
        .select()
        .single();

    if (error) {
        console.error('Failed to create job:', error);
        return null;
    }

    return data as Job;
}

/**
 * Update job status + optional fields
 */
export async function updateJob(
    supabase: SupabaseClient,
    jobId: string,
    updates: {
        status?: JobStatus;
        result?: Record<string, unknown>;
        errorMessage?: string;
        attempts?: number;
    }
): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (updates.status) updateData.status = updates.status;
    if (updates.result !== undefined) updateData.result = updates.result;
    if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;
    if (updates.attempts !== undefined) updateData.attempts = updates.attempts;

    if (updates.status === 'running') updateData.started_at = new Date().toISOString();
    if (updates.status === 'succeeded' || updates.status === 'failed') {
        updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', jobId);

    if (error) {
        console.error('Failed to update job:', error);
    }
}

/**
 * Get all jobs for a creator, optionally filtered by type/status
 */
export async function getCreatorJobs(
    supabase: SupabaseClient,
    creatorId: string,
    options?: { type?: JobType; status?: JobStatus; limit?: number }
): Promise<Job[]> {
    let query = supabase
        .from('jobs')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

    if (options?.type) query = query.eq('type', options.type);
    if (options?.status) query = query.eq('status', options.status);
    if (options?.limit) query = query.limit(options.limit);

    const { data, error } = await query;

    if (error) {
        console.error('Failed to fetch jobs:', error);
        return [];
    }

    return (data || []) as Job[];
}

/**
 * Get a single job by ID
 */
export async function getJob(
    supabase: SupabaseClient,
    jobId: string
): Promise<Job | null> {
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (error) return null;
    return data as Job;
}
