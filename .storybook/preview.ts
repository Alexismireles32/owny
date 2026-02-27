import type { Preview } from '@storybook/react-vite';

import '../src/styles/generated/tokens.css';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'canvas',
      values: [
        { name: 'canvas', value: 'var(--background)' },
        { name: 'ink', value: 'var(--foreground)' },
      ],
    },
    a11y: {
      test: 'error',
    },
    options: {
      storySort: {
        order: ['Foundations', 'UI'],
      },
    },
  },
};

export default preview;
