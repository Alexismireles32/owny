import { expect, test } from '@playwright/test';

const stories = [
  { id: 'ui-button--primary', name: 'button-primary' },
  { id: 'ui-button--secondary', name: 'button-secondary' },
  { id: 'ui-button--destructive', name: 'button-destructive' },
  { id: 'ui-card--overview', name: 'card-overview' },
  { id: 'ui-input--default', name: 'input-default' },
  { id: 'ui-input--invalid', name: 'input-invalid' },
  { id: 'builder-productbuilder--welcome-state', name: 'product-builder-welcome' },
  { id: 'builder-productlist--populated', name: 'product-list-populated' },
  { id: 'builder-productlist--empty', name: 'product-list-empty' },
  { id: 'builder-vibebuilder--empty-canvas', name: 'vibe-builder-empty' },
  { id: 'builder-vibebuilder--with-generated-preview', name: 'vibe-builder-preview' },
  { id: 'dashboard-analyticspanel--overview', name: 'analytics-panel-overview' },
  { id: 'storefront-sharebutton--default', name: 'share-button-default' },
] as const;

for (const story of stories) {
  test(`visual baseline: ${story.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.waitForSelector('#storybook-root > *');

    await expect(page.locator('#storybook-root')).toHaveScreenshot(
      `${story.name}.png`
    );
  });
}
