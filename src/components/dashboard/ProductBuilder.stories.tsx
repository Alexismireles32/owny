import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProductBuilder } from '@/components/dashboard/ProductBuilder';

const meta: Meta<typeof ProductBuilder> = {
  title: 'Builder/ProductBuilder',
  component: ProductBuilder,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '760px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    creatorId: 'story_creator',
    displayName: 'Ari Creator',
    onProductCreated: () => undefined,
  },
};

export default meta;

type Story = StoryObj<typeof ProductBuilder>;

export const WelcomeState: Story = {
  decorators: [
    (Story) => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('owny-builder-story_creator');
      }
      return <Story />;
    },
  ],
};
