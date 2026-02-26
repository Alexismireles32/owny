// GET /api/admin/creators — List all creators (admin only)
// POST /api/admin/creators — Takedown actions

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

interface AdminCreatorBody {
    action?: string;
    creatorId?: string;
}

async function verifyAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Allow explicit email allowlist for bootstrap environments.
    if (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(user.email || '')) {
        return user;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') return null;
    return user;
}

function readFormString(value: FormDataEntryValue | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

async function parseAdminCreatorBody(request: Request): Promise<AdminCreatorBody | null> {
    const contentType = request.headers.get('content-type') || '';

    try {
        if (contentType.includes('application/json')) {
            return await request.json() as AdminCreatorBody;
        }

        const formData = await request.formData();
        return {
            action: readFormString(formData.get('action')),
            creatorId: readFormString(formData.get('creatorId')),
        };
    } catch {
        return null;
    }
}

export async function GET() {
    const supabase = await createClient();
    const user = await verifyAdmin(supabase);
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: creators, error } = await supabase
        .from('creators')
        .select('id, handle, display_name, stripe_account_id, stripe_charges_enabled, created_at')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ creators });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const user = await verifyAdmin(supabase);
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await parseAdminCreatorBody(request);
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    const { action, creatorId } = body;

    if (action === 'takedown' && creatorId) {
        // Mark all creator's products as taken down
        const { error } = await supabase
            .from('products')
            .update({ status: 'archived' })
            .eq('creator_id', creatorId)
            .eq('status', 'published');

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
