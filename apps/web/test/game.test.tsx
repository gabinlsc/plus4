import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameClient } from '../src/net/client';
import { AppProvider } from '../src/net/context';
import { Game } from '../src/screens/Game';
import { applyGameUpdate, createAppStore } from '../src/store/store';
import { blue2, makeUpdate, makeView, red7, seat, wild, type ViewOptions } from './fixtures';

function fakeClient(): GameClient {
  return {
    createRoom: vi.fn(async () => true),
    joinRoom: vi.fn(async () => true),
    leaveRoom: vi.fn(),
    updateSettings: vi.fn(async () => true),
    setReady: vi.fn(async () => true),
    addBot: vi.fn(async () => true),
    removeBot: vi.fn(async () => true),
    kick: vi.fn(async () => true),
    start: vi.fn(async () => true),
    intent: vi.fn(async () => true),
    rematch: vi.fn(async () => true),
    emote: vi.fn(),
    dispose: vi.fn(),
  };
}

function renderGame(options: ViewOptions = {}) {
  const store = createAppStore();
  const client = fakeClient();
  const update = makeUpdate(makeView(options));
  applyGameUpdate(store, update);
  render(
    <AppProvider store={store} client={client}>
      <Game update={update} />
    </AppProvider>,
  );
  return { store, client };
}

describe('Game screen', () => {
  it('plays a playable card on click', async () => {
    const { client } = renderGame();
    await userEvent.click(screen.getByRole('button', { name: '7 rouge' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'PLAY_CARD', cardIds: [red7.id] });
  });

  it('asks for a color before playing a wild', async () => {
    const { client } = renderGame();
    await userEvent.click(screen.getByRole('button', { name: 'Joker' }));
    expect(client.intent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'VERT' }));
    expect(client.intent).toHaveBeenCalledWith({
      type: 'PLAY_CARD',
      cardIds: [wild.id],
      chosenColor: 'green',
    });
  });

  it('shakes instead of sending an unplayable card', async () => {
    const { client, store } = renderGame();
    await userEvent.click(screen.getByRole('button', { name: '2 bleu' }));
    expect(client.intent).not.toHaveBeenCalled();
    expect(store.getState().shake).toBe(1);
  });

  it('draws from the pile on my turn', async () => {
    const { client } = renderGame();
    await userEvent.click(screen.getByRole('button', { name: 'Piocher' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'DRAW' });
  });

  it('shows the stacked penalty and offers to take it', async () => {
    const { client } = renderGame({ drawStack: 6, playable: [] });
    expect(screen.getByLabelText('Pénalité en cours : 6 cartes')).toHaveTextContent('+6');
    await userEvent.click(screen.getByRole('button', { name: 'Ramasser +6' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'DRAW' });
  });

  it('jumps in out of turn with an identical card', async () => {
    const { client } = renderGame({
      current: 'bob',
      playable: [],
      jumpIn: [red7.id],
      settings: { allowJumpIn: true },
    });
    await userEvent.click(screen.getByRole('button', { name: 'COUPER !' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'JUMP_IN', cardId: red7.id });
  });

  it('offers to catch an opponent who forgot Uno', async () => {
    const { client } = renderGame({
      seats: [
        seat('me', 'Moi', 3),
        seat('bob', 'Bob', 1, { uno: { declared: false, vulnerable: true } }),
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Contre !' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'CATCH_UNO', targetId: 'bob' });
  });

  it('builds a multiple play selection', async () => {
    const red2 = { id: 'red-2-0', kind: 'colored', color: 'red', value: 2 } as const;
    const { client } = renderGame({
      hand: [red2, blue2, red7],
      playable: [red2.id, red7.id],
      settings: { allowMultiplePlay: true },
    });
    await userEvent.click(screen.getByRole('button', { name: '2 rouge' }));
    await userEvent.click(screen.getByRole('button', { name: '2 bleu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Poser 2 cartes' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'PLAY_CARD', cardIds: [red2.id, blue2.id] });
  });

  it('lets the +4 target challenge', async () => {
    const { client } = renderGame({
      playable: [],
      drawStack: 4,
      phase: { type: 'AWAITING_CHALLENGE', accusedId: 'bob', previousColor: 'red' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Contester le +4' }));
    expect(client.intent).toHaveBeenCalledWith({ type: 'RESOLVE_CHALLENGE', challenge: true });
  });
});
