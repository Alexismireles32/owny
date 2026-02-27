import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Overview: Story = {
  render: () => (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Creator Product Brief</CardTitle>
        <CardDescription>
          Distinctive visual direction with conversion-focused copy.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">
            Compare variants
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li>Audience fit score: 92</li>
          <li>Distinctiveness score: 89</li>
          <li>WCAG checks: passing</li>
        </ul>
      </CardContent>
      <CardFooter>
        <Button>Approve direction</Button>
      </CardFooter>
    </Card>
  ),
};
