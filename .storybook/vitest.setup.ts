import { setProjectAnnotations } from '@storybook/react-vite';

import * as projectAnnotations from './preview';

// Applies Storybook decorators/parameters to story-based Vitest runs.
setProjectAnnotations([projectAnnotations]);
