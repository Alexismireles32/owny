import { expect, test, type Page } from '@playwright/test';
import {
  cleanupCreatorBuildFixture,
  seedCreatorBuildFixture,
  type CreatorBuildFixture,
} from './helpers/creator-build-fixtures';

interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  active_version_number: number | null;
}

async function signInAsCreator(page: Page, fixture: CreatorBuildFixture) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(fixture.creator.email);
  await page.getByLabel('Password').fill(fixture.creator.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

async function loadProducts(page: Page): Promise<ProductSummary[]> {
  return page.evaluate(async () => {
    const response = await fetch('/api/products');
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to load products');
    }
    return payload.products as ProductSummary[];
  });
}

test.describe('creator build journey', () => {
  test('creator can build, refine, publish, and view a product from the dashboard flow', async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    const fixture = await seedCreatorBuildFixture();

    try {
      await signInAsCreator(page, fixture);

      await expect(page.getByRole('heading', { name: 'What digital product will you build today?' })).toBeVisible();
      await expect(page.getByText('No projects yet')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Design a sellable product from your creator voice' })).toBeVisible();

      const buildStartedAt = Date.now();
      await page.getByPlaceholder('Describe what you want to create...').fill(fixture.prompt);
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible({
        timeout: 6 * 60 * 1000,
      });
      const buildDurationMs = Date.now() - buildStartedAt;

      await expect(page.getByText(/^Error:/)).toHaveCount(0);
      await expect(page.getByText(/is ready\./)).toBeVisible();
      await expect(page.frameLocator('iframe[title="Product Preview"]').locator('h1').first()).toBeVisible();

      const afterBuildProducts = await loadProducts(page);
      expect(afterBuildProducts).toHaveLength(1);
      expect(afterBuildProducts[0].status).toBe('draft');
      expect(afterBuildProducts[0].active_version_number).toBe(1);

      const improveStartedAt = Date.now();
      await page.getByPlaceholder('Refine your draft...').fill(fixture.improvePrompt);
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByText('Updated. The latest changes are now in the draft.')).toBeVisible({
        timeout: 5 * 60 * 1000,
      });
      const improveDurationMs = Date.now() - improveStartedAt;

      await expect.poll(async () => {
        const products = await loadProducts(page);
        return products[0]?.active_version_number ?? null;
      }, {
        timeout: 60 * 1000,
        message: 'expected improve flow to save a new active version',
      }).toBe(2);

      await page.getByRole('button', { name: 'Publish' }).click();
      await expect(page.getByText('Product published. It is now live on your storefront.')).toBeVisible({
        timeout: 60 * 1000,
      });
      await expect(page.getByText('Live', { exact: true }).last()).toBeVisible();

      const publishedProduct = (await loadProducts(page))[0];
      expect(publishedProduct.status).toBe('published');

      await page.goto(`/c/${fixture.creator.handle}`);
      await expect(page.getByRole('heading', { name: fixture.creator.displayName })).toBeVisible();
      await expect(page.locator(`a[href="/p/${publishedProduct.slug}"]`).first()).toBeVisible();

      await page.goto(`/p/${publishedProduct.slug}`);
      await expect(page.getByRole('button', { name: 'Buy Now' })).toBeVisible();
      await expect(
        page.frameLocator(`iframe[title="${publishedProduct.title}"]`).locator('h1').first()
      ).toBeVisible();

      console.info(JSON.stringify({
        journey: 'creator-build',
        buildDurationMs,
        improveDurationMs,
        finalTitle: publishedProduct.title,
        finalSlug: publishedProduct.slug,
      }));
    } finally {
      await cleanupCreatorBuildFixture(fixture);
    }
  });
});
