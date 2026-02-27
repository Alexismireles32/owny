import type { Meta, StoryObj } from '@storybook/react-vite';

import { ShareButton } from '@/components/storefront/ShareButton';

const meta: Meta<typeof ShareButton> = {
  title: 'Storefront/ShareButton',
  component: ShareButton,
  args: {
    handle: 'creator-demo',
    primaryColor: '#0ea5e9',
  },
};

export default meta;

type Story = StoryObj<typeof ShareButton>;

export const Default: Story = {};

export const WarmAccent: Story = {
  args: {
    primaryColor: '#f97316',
  },
};
