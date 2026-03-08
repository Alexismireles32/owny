import { expect, test, type Page } from '@playwright/test';
import { cleanupCommerceFixture, seedCommerceFixture, type CommerceFixture } from './helpers/commerce-fixtures';

async function signInFromPage(page: Page, fixture: CommerceFixture) {
  await page.getByLabel('Email').fill(fixture.buyer.email);
  await page.getByLabel('Password').fill(fixture.buyer.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('commerce journey', () => {
  test('paid buyer flow survives auth bounce and lands in the library', async ({ page }) => {
    const fixture = await seedCommerceFixture({ accessType: 'paid' });

    try {
      await page.goto(`/p/${fixture.slug}`);
      await expect(page.frameLocator(`iframe[title="${fixture.title}"]`).getByRole('heading', { name: fixture.title })).toBeVisible();

      await page.getByRole('button', { name: 'Buy Now' }).click();
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=.*${fixture.slug}`));

      await signInFromPage(page, fixture);
      await expect(page).toHaveURL(new RegExp(`/p/${fixture.slug}$`));

      await page.getByRole('button', { name: 'Buy Now' }).click();
      await expect(page).toHaveURL(/\/checkout-success\?session_id=/);
      await expect(page.getByRole('heading', { name: 'Purchase Complete!' })).toBeVisible();
      await expect(page.getByText(`You now have access to ${fixture.title}.`)).toBeVisible();

      await page.getByRole('link', { name: 'Go to My Library' }).click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();

      await page.getByRole('link', { name: 'Continue' }).click();
      await expect(page).toHaveURL(new RegExp(`/library/${fixture.slug}$`));
      await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();

      const frame = page.frameLocator(`iframe[title="${fixture.title}"]`);
      await expect(frame.getByText('seeded paid commerce journey product')).toBeVisible();
    } finally {
      await cleanupCommerceFixture(fixture);
    }
  });

  test('free unlock flow grants access and keeps the library handoff intact', async ({ page }) => {
    const fixture = await seedCommerceFixture({ accessType: 'public' });

    try {
      await page.goto(`/p/${fixture.slug}`);
      await expect(page.frameLocator(`iframe[title="${fixture.title}"]`).getByRole('heading', { name: fixture.title })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Get Free Access' })).toBeVisible();

      await page.getByRole('button', { name: 'Get Free Access' }).click();
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=.*${fixture.slug}`));

      await signInFromPage(page, fixture);
      await expect(page).toHaveURL(new RegExp(`/p/${fixture.slug}$`));

      await page.getByRole('button', { name: 'Get Free Access' }).click();
      await expect(page).toHaveURL(new RegExp(`/library/${fixture.slug}$`));
      await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();

      await page.goto('/library');
      await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
    } finally {
      await cleanupCommerceFixture(fixture);
    }
  });
});
