import type { Meta, StoryObj } from '@storybook/react-vite';

import { AnalyticsPanel } from '@/components/dashboard/AnalyticsPanel';

const meta: Meta<typeof AnalyticsPanel> = {
  title: 'Dashboard/AnalyticsPanel',
  component: AnalyticsPanel,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '560px',
          maxWidth: '360px',
          background:
            'linear-gradient(145deg, rgb(9, 19, 32), rgb(16, 29, 46) 52%, rgb(22, 38, 59))',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    handle: 'creator-demo',
    stats: {
      revenue: 842500,
      sales: 127,
      pageViews: 18240,
    },
  },
};

export default meta;

type Story = StoryObj<typeof AnalyticsPanel>;

export const Overview: Story = {};
