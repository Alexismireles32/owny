import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from '@/components/ui/input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    placeholder: 'Enter your product headline',
  },
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const Invalid: Story = {
  args: {
    'aria-invalid': true,
    defaultValue: 'Headline is too generic',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'Premium launch page',
  },
};
