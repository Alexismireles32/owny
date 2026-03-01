import { DashboardBuildView } from '@/components/dashboard/DashboardBuildView';
import { createClient } from '@/lib/supabase/server';
import { getDashboardContext } from './_lib/get-dashboard-context';

export default async function DashboardPage() {
    const { creator } = await getDashboardContext();
    const supabase = await createClient();

    const { data: products } = await supabase
        .from('products')
        .select('id, title, type, status, slug, created_at, active_version_id')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
        .limit(12);

    const activeVersionIds = (products || [])
        .map((product) => product.active_version_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    let versionById = new Map<string, { versionNumber: number; buildPacket: Record<string, unknown> | null }>();
    if (activeVersionIds.length > 0) {
        const { data: activeVersions } = await supabase
            .from('product_versions')
            .select('id, version_number, build_packet')
            .in('id', activeVersionIds);

        versionById = new Map(
            (activeVersions || []).map((version) => [
                version.id,
                {
                    versionNumber: version.version_number,
                    buildPacket: version.build_packet as Record<string, unknown> | null,
                },
            ])
        );
    }

    return (
        <DashboardBuildView
            creatorId={creator.id}
            displayName={creator.display_name}
            initialProducts={(products || []).map((p) => {
                const activeVersion = p.active_version_id ? versionById.get(p.active_version_id) : null;
                return {
                    id: p.id,
                    title: p.title,
                    type: p.type,
                    status: p.status,
                    slug: p.slug,
                    created_at: p.created_at,
                    active_version_number: activeVersion?.versionNumber || null,
                    active_build_packet: activeVersion?.buildPacket || null,
                };
            })}
        />
    );
}
