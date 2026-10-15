import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@uno/shared';
import { canCallUno } from '../src/components/ActionBar';
import { BotPicker } from '../src/components/BotPicker';
import { Card } from '../src/components/Card';
import { RulesPanel } from '../src/components/RulesPanel';
import { blue2, makeView, red7, wild } from './fixtures';

describe('Card', () => {
  it('is a labelled button when clickable, an image otherwise', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Card card={red7} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: '7 rouge' }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<Card card={null} />);
    expect(screen.getByRole('img', { name: 'Carte face cachée' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('labels wilds', () => {
    render(<Card card={wild} />);
    expect(screen.getByRole('img', { name: 'Joker' })).toBeInTheDocument();
  });
});

describe('RulesPanel', () => {
  it('toggles a rule through onChange', async () => {
    const onChange = vi.fn();
    render(<RulesPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Interception' }));
    expect(onChange).toHaveBeenCalledWith({ allowJumpIn: true });
  });

  it('applies a preset', async () => {
    const onChange = vi.fn();
    render(<RulesPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Maison/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ allowJumpIn: true, allowStackingDrawCards: true }),
    );
  });

  it('is read-only without onChange and hides dependent rules', () => {
    render(<RulesPanel settings={DEFAULT_SETTINGS} />);
    expect(screen.getByRole('switch', { name: 'Interception' })).toBeDisabled();
    expect(screen.queryByRole('switch', { name: /\+2 sur \+4/ })).toBeNull();
  });
});

describe('canCallUno', () => {
  it('allows a pre-call with two cards on my turn and a late call with one', () => {
    expect(canCallUno(makeView({ hand: [red7, blue2] }))).toBe(true);
    expect(canCallUno(makeView({ hand: [red7, blue2], current: 'bob' }))).toBe(false);
    expect(canCallUno(makeView({ hand: [red7], current: 'bob' }))).toBe(true);
    expect(canCallUno(makeView({ hand: [red7, blue2, wild] }))).toBe(false);
  });
});

describe('BotPicker', () => {
  it('cycles a bot level on click: easy → normal → hard → easy', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<BotPicker bots={['easy', 'normal']} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Bot 1 : Facile. Changer de niveau' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(['normal', 'normal']);
    rerender(<BotPicker bots={['hard']} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Bot 1 : Difficile. Changer de niveau' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(['easy']);
  });

  it('adds a bot on the next free seat, removes one, and never goes below one bot', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<BotPicker bots={['hard', 'easy']} onChange={onChange} />);
    const enabled = screen
      .getAllByRole('button', { name: 'Ajouter un bot' })
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toHaveLength(1);
    await userEvent.click(enabled[0] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(['hard', 'easy', 'easy']);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le bot 1' }));
    expect(onChange).toHaveBeenLastCalledWith(['easy']);
    rerender(<BotPicker bots={['easy']} onChange={onChange} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Retirer/ })).toBeNull());
  });

  it('sets the whole table with a preset', async () => {
    const onChange = vi.fn();
    render(<BotPicker bots={['easy', 'normal', 'hard']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Corsé/ }));
    expect(onChange).toHaveBeenLastCalledWith(['hard', 'hard', 'hard']);
  });
});
