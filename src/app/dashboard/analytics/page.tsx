import { getDashboardContext } from '../_lib/get-dashboard-context';
import { DashboardAnalyticsView } from '@/components/dashboard/DashboardAnalyticsView';

export default async function DashboardAnalyticsPage() {
    const { creator } = await getDashboardContext();

    return (
        <DashboardAnalyticsView creatorId={creator.id} />
    );
}
