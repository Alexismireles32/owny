import { getDashboardContext } from '../_lib/get-dashboard-context';
import { DashboardOrdersView } from '@/components/dashboard/DashboardOrdersView';

export default async function DashboardOrdersPage() {
    const { creator } = await getDashboardContext();

    return (
        <DashboardOrdersView creatorId={creator.id} />
    );
}
