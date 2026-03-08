import { expect, test, type Page } from '@playwright/test';
import {
  cleanupCreatorBuildFixture,
  seedCreatorBuildFixture,
} from './helpers/creator-build-fixtures';
import {
  createAdminSupabase,
  createAuthUser,
  uniqueToken,
  type UserFixture,
} from './helpers/supabase-fixtures';

interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  active_version_number: number | null;
}

async function signInFromCurrentPage(page: Page, user: UserFixture) {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

async function signIn(page: Page, user: UserFixture, expectedUrl: RegExp) {
  await page.goto('/sign-in');
  await signInFromCurrentPage(page, user);
  await expect(page).toHaveURL(expectedUrl, { timeout: 20_000 });
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

test.describe('creator to purchase journey', () => {
  test('creator can publish a generated product and a buyer can purchase it', async ({ browser }) => {
    test.setTimeout(12 * 60 * 1000);
    const admin = createAdminSupabase();
    const fixture = await seedCreatorBuildFixture();
    const buyer = await createAuthUser(admin, {
      email: `buyer-from-build-${uniqueToken()}@owny-e2e.local`,
      password: `Buyer-${uniqueToken()}`,
      role: 'buyer',
    });

    const creatorContext = await browser.newContext();
    const buyerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const buyerPage = await buyerContext.newPage();

    try {
      await signIn(creatorPage, fixture.creator, /\/dashboard$/);

      await creatorPage.getByPlaceholder('Describe what you want to create...').fill(fixture.prompt);
      await creatorPage.getByRole('button', { name: 'Send' }).click();

      await expect(creatorPage.getByRole('button', { name: 'Publish' })).toBeVisible({
        timeout: 6 * 60 * 1000,
      });

      const draftProducts = await loadProducts(creatorPage);
      expect(draftProducts).toHaveLength(1);
      expect(draftProducts[0].status).toBe('draft');

      await creatorPage.getByRole('button', { name: 'Publish' }).click();
      await expect(
        creatorPage.getByText('Product published. It is now live on your storefront.')
      ).toBeVisible({ timeout: 60_000 });

      const publishedProduct = (await loadProducts(creatorPage))[0];
      expect(publishedProduct.status).toBe('published');

      await buyerPage.goto(`/p/${publishedProduct.slug}`);
      await expect(
        buyerPage.frameLocator(`iframe[title="${publishedProduct.title}"]`).locator('h1').first()
      ).toBeVisible({ timeout: 60_000 });
      await expect(buyerPage.getByRole('button', { name: 'Buy Now' })).toBeVisible();

      await buyerPage.getByRole('button', { name: 'Buy Now' }).click();
      await expect(buyerPage).toHaveURL(new RegExp(`/sign-in\\?next=.*${publishedProduct.slug}`));

      await signInFromCurrentPage(buyerPage, buyer);
      await expect(buyerPage).toHaveURL(new RegExp(`/p/${publishedProduct.slug}$`), { timeout: 20_000 });
      await buyerPage.getByRole('button', { name: 'Buy Now' }).click();

      await expect(buyerPage).toHaveURL(/\/checkout-success\?session_id=/);
      await expect(buyerPage.getByRole('heading', { name: 'Purchase Complete!' })).toBeVisible();
      await expect(
        buyerPage.getByText(`You now have access to ${publishedProduct.title}.`)
      ).toBeVisible();

      await buyerPage.getByRole('link', { name: 'Go to My Library' }).click();
      await expect(buyerPage).toHaveURL(/\/library$/);
      await expect(buyerPage.getByRole('heading', { name: publishedProduct.title })).toBeVisible();

      await buyerPage.getByRole('link', { name: 'Continue' }).click();
      await expect(buyerPage).toHaveURL(new RegExp(`/library/${publishedProduct.slug}$`));
      await expect(buyerPage.getByRole('heading', { name: publishedProduct.title })).toBeVisible();
    } finally {
      await Promise.allSettled([
        creatorContext.close(),
        buyerContext.close(),
        admin.auth.admin.deleteUser(buyer.id),
        cleanupCreatorBuildFixture(fixture),
      ]);
    }
  });
});
