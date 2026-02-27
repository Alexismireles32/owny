import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProductList } from '@/components/dashboard/ProductList';

const now = new Date('2026-02-27T18:00:00.000Z').toISOString();

const meta: Meta<typeof ProductList> = {
  title: 'Builder/ProductList',
  component: ProductList,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '620px',
          background:
            'linear-gradient(145deg, rgb(9, 19, 32), rgb(16, 29, 46) 52%, rgb(22, 38, 59))',
          padding: '16px',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    onRefresh: () => undefined,
    onPublishToggle: () => undefined,
    products: [
      {
        id: 'prod_1',
        title: 'Monetize Your Niche Knowledge',
        type: 'pdf_guide',
        status: 'published',
        slug: 'monetize-your-niche',
        created_at: now,
      },
      {
        id: 'prod_2',
        title: '30-Day Creator Growth Challenge',
        type: 'challenge_7day',
        status: 'draft',
        slug: 'creator-growth-challenge',
        created_at: now,
      },
      {
        id: 'prod_3',
        title: 'Offer Positioning Crash Course',
        type: 'mini_course',
        status: 'draft',
        slug: 'offer-positioning-crash-course',
        created_at: now,
      },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof ProductList>;

export const Populated: Story = {};

export const Empty: Story = {
  args: {
    products: [],
  },
};
