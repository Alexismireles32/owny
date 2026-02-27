import type { Meta, StoryObj } from '@storybook/react-vite';

import { VibeBuilder } from '@/components/builder/vibe-builder';
import type { ProductDSL } from '@/types/product-dsl';

const sampleDsl: ProductDSL = {
  product: {
    title: 'Creator Launch Page',
    type: 'pdf_guide',
    version: 2,
  },
  themeTokens: {
    primaryColor: '#0e7490',
    secondaryColor: '#f59e0b',
    backgroundColor: '#ffffff',
    textColor: '#0f172a',
    fontFamily: 'dm-sans',
    borderRadius: 'lg',
    spacing: 'normal',
    shadow: 'sm',
    mood: 'premium',
  },
  pages: [
    {
      id: 'page_sales',
      type: 'sales',
      title: 'Sales Page',
      accessRule: 'public',
      blocks: [],
    },
  ],
};

const sampleHtml = `<!doctype html>
<html>
  <body style="margin:0;font-family:system-ui;background:#f8fafc;color:#0f172a;">
    <main style="max-width:860px;margin:0 auto;padding:48px 20px;">
      <p style="text-transform:uppercase;letter-spacing:.09em;font-size:12px;color:#0e7490;font-weight:700;">Digital Product</p>
      <h1 style="font-size:42px;line-height:1.08;margin:12px 0;">Build Your Signature Offer in 7 Days</h1>
      <p style="font-size:18px;line-height:1.6;max-width:60ch;">A practical creator playbook for planning, writing, and launching products that convert without losing your voice.</p>
      <section style="margin-top:28px;padding:20px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;">
        <h2 style="margin:0 0 12px;font-size:20px;">What you get</h2>
        <ul style="margin:0;padding-left:20px;line-height:1.8;">
          <li>Offer positioning worksheet</li>
          <li>Launch page structure templates</li>
          <li>Pricing and messaging checkpoints</li>
        </ul>
      </section>
    </main>
  </body>
</html>`;

const meta: Meta<typeof VibeBuilder> = {
  title: 'Builder/VibeBuilder',
  component: VibeBuilder,
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
    productId: 'prod_story_001',
    initialDsl: null,
    initialHtml: null,
    initialBuildPacket: null,
    onSave: async () => Promise.resolve(),
    onPublish: async () => Promise.resolve(),
  },
};

export default meta;

type Story = StoryObj<typeof VibeBuilder>;

export const EmptyCanvas: Story = {};

export const WithGeneratedPreview: Story = {
  args: {
    initialDsl: sampleDsl,
    initialHtml: sampleHtml,
    initialBuildPacket: {
      designCanonVersion: 'canon-2026.1',
      creativeDirectionId: 'studio-workshop',
      qualityOverallScore: 92,
      qualityOverallPassed: true,
      criticIterations: 1,
      qualityFailingGates: [],
      qualityGateScores: {
        brandFidelity: { score: 90, threshold: 85, passed: true },
        distinctiveness: { score: 89, threshold: 80, passed: true },
        accessibility: { score: 96, threshold: 90, passed: true },
        contentDepth: { score: 91, threshold: 85, passed: true },
        evidenceLock: { score: 94, threshold: 85, passed: true },
      },
    },
  },
};
