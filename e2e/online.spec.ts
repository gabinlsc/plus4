import { expect, test, type Page } from '@playwright/test';
import {
  MY_TURN,
  drawFromPile,
  enterName,
  seatCardCount,
  status,
  trackErrors,
  waitForGame,
} from './helpers';

test('online: create, join by link, configure, start and play', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [...trackErrors(host), ...trackErrors(guest)];

  // Host creates an online room.
  await host.goto('/');
  await enterName(host, 'Alice');
  await host.getByRole('tab', { name: 'En ligne' }).click();
  await host.getByRole('button', { name: 'Créer la room' }).click();
  const code = (await host.locator('p[class*="_code_"]').textContent()) ?? '';
  expect(code).toMatch(/^P4-[2-9A-HJ-NP-Z]{4}$/);

  // Guest opens the invitation link: online tab and code are prefilled.
  await guest.goto(`/?room=${code}`);
  await enterName(guest, 'Bob');
  await guest.getByRole('button', { name: 'Rejoindre la room' }).click();
  await expect(host.getByText('Bob', { exact: true })).toBeVisible();

  // Only the host edits the rules; the guest sees them live.
  await host.getByRole('switch', { name: 'Interception' }).click();
  const guestSwitch = guest.getByRole('switch', { name: 'Interception' });
  await expect(guestSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(guestSwitch).toBeDisabled();

  await guest.getByRole('button', { name: 'Je suis prêt' }).click();
  await expect(host.getByText('✓ Prêt')).toBeVisible();

  await host.getByRole('button', { name: 'Lancer la partie' }).click();
  await waitForGame(host);
  await waitForGame(guest);

  // Exactly one player has the turn; when they draw, the other sees their count change.
  const hostTurn = async () => MY_TURN.test((await status(host).textContent()) ?? '');
  const guestTurn = async () => MY_TURN.test((await status(guest).textContent()) ?? '');
  await expect.poll(async () => (await hostTurn()) !== (await guestTurn())).toBe(true);
  const [current, other, currentName]: [Page, Page, string] = (await hostTurn())
    ? [host, guest, 'Alice']
    : [guest, host, 'Bob'];

  if (!(await status(current).textContent())?.includes('Choisis')) {
    const before = await seatCardCount(other, currentName);
    await drawFromPile(current);
    await expect.poll(() => seatCardCount(other, currentName)).toBeGreaterThan(before);
  }

  // Emotes reach the other player.
  await host.getByRole('button', { name: 'Réactions' }).click();
  await host.getByRole('button', { name: '🔥' }).click();
  await expect(guest.getByText('🔥')).toBeVisible();

  expect(errors).toEqual([]);
  await hostContext.close();
  await guestContext.close();
});

test('online: joining an unknown room explains the error', async ({ page }) => {
  await page.goto('/');
  await enterName(page, 'Eve');
  await page.getByRole('tab', { name: 'En ligne' }).click();
  await page.getByPlaceholder('P4-XXXX').fill('P4-ZZZZ');
  await page.getByRole('button', { name: 'Rejoindre la room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Room introuvable. Vérifie le code.');
});
