import { expect, type Locator, type Page } from '@playwright/test';

/** Collects console errors and uncaught exceptions of a page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export function hand(page: Page): Locator {
  return page.getByRole('list', { name: 'Ta main' }).getByRole('listitem');
}

/** The local player's status line in the action bar. */
export function status(page: Page): Locator {
  return page.locator('[class*="_status_"]').first();
}

export const MY_TURN = /toi|Empile|Choisis/;

/** Clicks the draw pile; forced because it "breathes" while it is our turn. */
export async function drawFromPile(page: Page): Promise<void> {
  await page
    .locator('button[aria-label^="Piocher"], button[aria-label^="Ramasser"]')
    .first()
    .click({ force: true });
}

export async function enterName(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder('Ex : Gabin').fill(name);
}

export async function seatCardCount(page: Page, seatName: string): Promise<number> {
  const seat = page.locator('[class*="_seat_"]', { hasText: seatName }).first();
  const label = await seat.getByLabel(/\d+ cartes/).getAttribute('aria-label');
  return Number(label?.match(/\d+/)?.[0] ?? NaN);
}

export async function waitForGame(page: Page): Promise<void> {
  await expect(hand(page).first()).toBeVisible();
}

/** Keeps only the first `count` bots of the default solo table (3 bots). */
export async function keepBots(page: Page, count: number): Promise<void> {
  for (let i = 3; i > count; i--) {
    await page.getByRole('button', { name: `Retirer le bot ${i}` }).click();
  }
  await expect(page.getByRole('button', { name: /^Bot \d : / })).toHaveCount(count);
}
