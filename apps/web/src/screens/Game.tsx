import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { Card as CardModel, CardColor, GameUpdate } from '@uno/shared';
import { ActionBar, canCallUno } from '../components/ActionBar';
import { AnchorsProvider } from '../components/anchors';
import { Avatar } from '../components/Avatar';
import { ColorPicker } from '../components/ColorPicker';
import { FlyingCards } from '../components/FlyingCards';
import { Hand } from '../components/Hand';
import { OpponentSeat, TimerRing } from '../components/OpponentSeat';
import { Results } from '../components/Results';
import { SwapPicker } from '../components/SwapPicker';
import { Table } from '../components/Table';
import { errorMessage } from '../lib/messages';
import { useApp, useClient, useStoreApi } from '../net/context';
import { pushToast, triggerShake } from '../store/store';
import ui from '../styles/ui.module.css';
import actionStyles from '../components/ActionBar.module.css';
import styles from './Game.module.css';

/** Pending wild: the color picker is open before the intent is sent. */
type PendingWild = { readonly cardIds: readonly string[] } | null;

export function Game({ update }: { update: GameUpdate }) {
  const client = useClient();
  const store = useStoreApi();
  const discard = useApp((s) => s.discard);
  const eventSeq = useApp((s) => s.eventSeq);
  const lastEvents = useApp((s) => s.lastEvents);
  const shake = useApp((s) => s.shake);
  const emotes = useApp((s) => s.emotes);
  const colorblind = useApp((s) => s.prefs.colorblind);
  const lobby = useApp((s) => s.lobby);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [pendingWild, setPendingWild] = useState<PendingWild>(null);
  const [dealSeq, setDealSeq] = useState(0);
  const [seenSeq, setSeenSeq] = useState(eventSeq);

  const { view, turnDeadline } = update;
  const me = view.me;
  const myTurn = view.currentPlayerId === me.id;
  const opponents = useMemo(() => {
    // Seats listed starting from the next player, so the table reads in play order.
    const mine = view.seats.findIndex((s) => s.id === me.id);
    return [...view.seats.slice(mine + 1), ...view.seats.slice(0, mine)];
  }, [view.seats, me.id]);
  const nameOf = (id: string) => view.seats.find((s) => s.id === id)?.name ?? '?';
  const autopilotIds = new Set(lobby?.seats.filter((s) => s.autopilot).map((s) => s.id) ?? []);
  const isHost = lobby?.hostId === me.id;

  // Reset local selection and trigger the deal animation on new event batches.
  if (seenSeq !== eventSeq) {
    setSeenSeq(eventSeq);
    if (lastEvents.some((e) => e.type === 'ROUND_STARTED')) setDealSeq((d) => d + 1);
    if (
      selected.length > 0 &&
      lastEvents.some((e) => e.type === 'CARD_PLAYED' || e.type === 'TURN_CHANGED')
    ) {
      setSelected([]);
    }
  }

  const reject = (message: string) => {
    triggerShake(store);
    pushToast(store, message, 'error');
  };

  const play = (cardIds: readonly string[], cards: readonly CardModel[]) => {
    const last = cards[cards.length - 1];
    if (last?.kind === 'wild') {
      setPendingWild({ cardIds });
      return;
    }
    setSelected([]);
    void client.intent({ type: 'PLAY_CARD', cardIds });
  };

  const onCardClick = (card: CardModel) => {
    if (!myTurn) {
      if (view.jumpInCardIds.includes(card.id)) {
        void client.intent({ type: 'JUMP_IN', cardId: card.id });
      } else {
        reject(errorMessage(view.settings.allowJumpIn ? 'JUMP_IN_NOT_IDENTICAL' : 'NOT_YOUR_TURN'));
      }
      return;
    }
    // Multiple play: build a selection of same-value cards.
    if (selected.length > 0) {
      const first = me.hand.find((c) => c.id === selected[0]);
      if (selected.includes(card.id)) {
        setSelected(selected.filter((id) => id !== card.id));
      } else if (first && first.value === card.value) {
        setSelected([...selected, card.id]);
      } else {
        reject(errorMessage('MULTIPLE_PLAY_MISMATCH'));
      }
      return;
    }
    if (!view.playableCardIds.includes(card.id)) {
      reject(errorMessage(view.drawStack.total > 0 ? 'MUST_STACK_OR_DRAW' : 'ILLEGAL_CARD'));
      return;
    }
    const siblings = me.hand.filter((c) => c.id !== card.id && c.value === card.value);
    const multiple =
      view.settings.allowMultiplePlay && view.phase.type === 'AWAITING_PLAY' && siblings.length > 0;
    if (multiple) {
      setSelected([card.id]);
      pushToast(store, 'Sélectionne les autres cartes de même valeur, puis « Poser ».');
      return;
    }
    play([card.id], [card]);
  };

  const canDraw =
    myTurn && (view.phase.type === 'AWAITING_PLAY' || view.phase.type === 'AWAITING_CHALLENGE');
  const drawLabel = view.drawStack.total > 0 ? `Ramasser +${view.drawStack.total}` : 'Piocher';
  const chooseColor = (color: CardColor) => {
    if (pendingWild) {
      void client.intent({ type: 'PLAY_CARD', cardIds: pendingWild.cardIds, chosenColor: color });
      setPendingWild(null);
      setSelected([]);
    } else {
      void client.intent({ type: 'CHOOSE_COLOR', color });
    }
  };

  const currentName = nameOf(view.currentPlayerId);
  const showColorPicker = pendingWild !== null || (myTurn && view.phase.type === 'AWAITING_COLOR');

  return (
    <AnchorsProvider>
      <LayoutGroup>
        <div className={styles.screen}>
          <div className={styles.topBar}>
            <div className={styles.topInfo}>
              {lobby ? <span className={ui.chip}>{lobby.code}</span> : null}
              <span className={ui.chip}>Manche {view.round}</span>
              {view.settings.allowJumpIn ? <span className={ui.chip}>Interception</span> : null}
              {view.settings.allowStackingDrawCards ? (
                <span className={ui.chip}>Empilement</span>
              ) : null}
            </div>
            <button
              type="button"
              className={`${ui.button} ${ui.ghost}`}
              onClick={() => client.leaveRoom()}
            >
              Quitter
            </button>
          </div>

          <div className={styles.arena}>
            <div className={styles.opponents}>
              {opponents.map((seat) => (
                <div key={seat.id} className={styles.opponentSlot}>
                  <OpponentSeat
                    seat={seat}
                    isCurrent={seat.id === view.currentPlayerId}
                    turnDeadline={turnDeadline}
                    turnSeconds={view.settings.turnTimeoutSec}
                    autopilot={autopilotIds.has(seat.id)}
                    emote={emotes[seat.id]}
                    onCatch={
                      seat.uno.vulnerable && view.settings.unoPenalty.enabled
                        ? () => void client.intent({ type: 'CATCH_UNO', targetId: seat.id })
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
            <Table
              view={view}
              discard={discard}
              canDraw={canDraw}
              drawLabel={drawLabel}
              colorblind={colorblind}
              onDraw={() => void client.intent({ type: 'DRAW' })}
            />
            <AnimatePresence>
              {view.jumpInCardIds.length > 0 && !myTurn ? (
                <motion.button
                  type="button"
                  className={`${actionStyles.jump} ${styles.jumpButton}`}
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  onClick={() => {
                    const cardId = view.jumpInCardIds[0];
                    if (cardId) void client.intent({ type: 'JUMP_IN', cardId });
                  }}
                >
                  COUPER !
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>

          <div className={styles.me}>
            <ActionBar
              view={view}
              turnDeadline={turnDeadline}
              currentName={currentName}
              selectedCount={selected.length}
              onUno={() => {
                if (canCallUno(view)) void client.intent({ type: 'CALL_UNO' });
              }}
              onPass={() => void client.intent({ type: 'PASS' })}
              onChallenge={(challenge) =>
                void client.intent({ type: 'RESOLVE_CHALLENGE', challenge })
              }
              onPlaySelected={() => {
                const cards = selected
                  .map((id) => me.hand.find((c) => c.id === id))
                  .filter((c): c is CardModel => c !== undefined);
                play(selected, cards);
              }}
              onClearSelection={() => setSelected([])}
              onEmote={(e) => client.emote(e)}
            />
            <Hand
              cards={me.hand}
              playableIds={view.playableCardIds}
              jumpInIds={view.jumpInCardIds}
              selectedIds={selected}
              myTurn={myTurn}
              shake={shake}
              dealSeq={dealSeq}
              colorblind={colorblind}
              onCardClick={onCardClick}
            />
            <div className={styles.meName}>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Avatar name={me.name} size={28} />
                {myTurn ? (
                  <TimerRing deadline={turnDeadline} total={view.settings.turnTimeoutSec} />
                ) : null}
              </span>
              {me.name}
              {me.score > 0 ? <span className={ui.chip}>{me.score} pts</span> : null}
              {me.uno.declared && me.hand.length === 1 ? (
                <span className={ui.chip}>Dernière annoncée</span>
              ) : null}
            </div>
          </div>
        </div>

        <FlyingCards seq={eventSeq} events={lastEvents} meId={me.id} />

        <AnimatePresence>
          {showColorPicker ? (
            <ColorPicker
              key="color"
              onPick={chooseColor}
              {...(pendingWild ? { onCancel: () => setPendingWild(null) } : {})}
            />
          ) : null}
          {myTurn && view.phase.type === 'AWAITING_SWAP_TARGET' ? (
            <SwapPicker
              key="swap"
              opponents={opponents}
              onPick={(targetId) => void client.intent({ type: 'CHOOSE_SWAP_TARGET', targetId })}
            />
          ) : null}
          {view.phase.type === 'ROUND_OVER' || view.phase.type === 'GAME_OVER' ? (
            <Results
              key="results"
              view={view}
              isHost={isHost}
              onRematch={() => {
                void client.rematch().then((ok) => {
                  if (ok && lobby?.mode === 'solo') void client.start();
                });
              }}
              onLeave={() => client.leaveRoom()}
            />
          ) : null}
        </AnimatePresence>
      </LayoutGroup>
    </AnchorsProvider>
  );
}
