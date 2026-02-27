import type { Meta, StoryObj } from '@storybook/react-vite';

import { StorefrontPreview } from '@/components/dashboard/StorefrontPreview';

const meta: Meta<typeof StorefrontPreview> = {
  title: 'Storefront/StorefrontPreview',
  component: StorefrontPreview,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '760px',
          background:
            'linear-gradient(145deg, rgb(9, 19, 32), rgb(16, 29, 46) 52%, rgb(22, 38, 59))',
          display: 'flex',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    handle: 'creator-demo',
    storefrontKey: 1,
    creatorId: 'creator_demo_id',
    onRestyle: () => undefined,
  },
};

export default meta;

type Story = StoryObj<typeof StorefrontPreview>;

export const Default: Story = {};
