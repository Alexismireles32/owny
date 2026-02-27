import { DashboardBuildView } from '@/components/dashboard/DashboardBuildView';
import { getDashboardContext } from './_lib/get-dashboard-context';

export default async function DashboardPage() {
    const { creator } = await getDashboardContext();

    return (
        <DashboardBuildView
            creatorId={creator.id}
            displayName={creator.display_name}
        />
    );
}
