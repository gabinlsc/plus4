import { expect, test } from '@playwright/test';
import {
  MY_TURN,
  drawFromPile,
  enterName,
  hand,
  keepBots,
  status,
  trackErrors,
  waitForGame,
} from './helpers';

test('solo: deal, take a turn, and resume the game after a reload', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '+4' })).toBeVisible();

  await enterName(page, 'Gabin');
  await keepBots(page, 2);
  await page.getByRole('button', { name: 'Lancer la partie' }).click();

  await waitForGame(page);
  expect(await hand(page).count()).toBeGreaterThanOrEqual(7);
  await expect(page.locator('[class*="_seat_"]')).toHaveCount(2);
  const code = await page.locator('[class*="_chip_"]').first().textContent();
  expect(code).toMatch(/^P4-/);

  // Bots play first (the human deals); wait until it is our turn, then draw.
  await expect(status(page)).toHaveText(MY_TURN, { timeout: 30_000 });
  const before = await hand(page).count();
  const choosingColor = (await status(page).textContent())?.includes('Choisis');
  if (choosingColor) {
    await page.getByRole('button', { name: 'ROUGE' }).click();
  } else {
    await drawFromPile(page);
    await expect.poll(() => hand(page).count()).toBeGreaterThan(before);
  }

  // A reload resumes the same seat through the stored session token.
  await page.reload();
  await waitForGame(page);
  await expect(page.locator('[class*="_chip_"]').first()).toHaveText(code ?? '');

  expect(errors).toEqual([]);
});

test('solo: an invalid card shakes the hand without reaching the server', async ({ page }) => {
  await page.goto('/');
  await enterName(page, 'Gabin');
  await keepBots(page, 1);
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await waitForGame(page);
  await expect(status(page)).toHaveText(MY_TURN, { timeout: 30_000 });

  const dimmed = page.locator('[class*="_dimmed_"]');
  test.skip((await dimmed.count()) === 0, 'Every card in hand happens to be playable');
  await dimmed.first().click({ force: true });
  await expect(page.getByRole('alert')).toBeVisible();
});
