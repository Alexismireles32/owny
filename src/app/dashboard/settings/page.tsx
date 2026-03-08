import { getDashboardContext } from '../_lib/get-dashboard-context';
import { DashboardSettingsView } from '@/components/dashboard/DashboardSettingsView';

export default async function DashboardSettingsPage() {
    const { creator, user } = await getDashboardContext();

    return (
        <DashboardSettingsView
            creatorId={creator.id}
            handle={creator.handle}
            displayName={creator.display_name}
            email={user.email || ''}
            avatarUrl={creator.avatar_url}
            stripeConnectStatus={creator.stripe_connect_status || 'unconnected'}
        />
    );
}
