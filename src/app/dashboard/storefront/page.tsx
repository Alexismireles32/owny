import { DashboardStorefrontView } from '@/components/dashboard/DashboardStorefrontView';
import { getDashboardContext } from '../_lib/get-dashboard-context';

export default async function DashboardStorefrontPage() {
    const { creator } = await getDashboardContext();

    return (
        <DashboardStorefrontView
            creatorId={creator.id}
            handle={creator.handle}
        />
    );
}
