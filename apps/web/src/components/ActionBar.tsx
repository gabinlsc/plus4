import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EMOTES, type ClientGameView, type Emote } from '@uno/shared';
import { useCountdown } from '../lib/useCountdown';
import ui from '../styles/ui.module.css';
import styles from './ActionBar.module.css';

export interface ActionBarProps {
  readonly view: ClientGameView;
  readonly turnDeadline: number | null;
  readonly currentName: string;
  readonly selectedCount: number;
  readonly onUno: () => void;
  readonly onPass: () => void;
  readonly onChallenge: (challenge: boolean) => void;
  readonly onPlaySelected: () => void;
  readonly onClearSelection: () => void;
  readonly onEmote: (emote: Emote) => void;
}

/** Whether the local player may call "Uno" right now (mirrors the engine rule). */
export function canCallUno(view: ClientGameView): boolean {
  const hand = view.me.hand.length;
  const myTurn = view.currentPlayerId === view.me.id;
  const phaseOk = view.phase.type === 'AWAITING_PLAY' || view.phase.type === 'AWAITING_PLAY_DRAWN';
  if (view.me.uno.declared) return false;
  return hand === 1 || (hand === 2 && myTurn && phaseOk);
}

export function ActionBar({
  view,
  turnDeadline,
  currentName,
  selectedCount,
  onUno,
  onPass,
  onChallenge,
  onPlaySelected,
  onClearSelection,
  onEmote,
}: ActionBarProps) {
  const [emotesOpen, setEmotesOpen] = useState(false);
  const myTurn = view.currentPlayerId === view.me.id;
  const seconds = useCountdown(myTurn ? turnDeadline : null);
  const unoEnabled = canCallUno(view);

  let status: string;
  if (myTurn) {
    switch (view.phase.type) {
      case 'AWAITING_CHALLENGE':
        status = `+${view.drawStack.total} pour toi ! Contester, ${view.settings.allowStackingDrawCards ? 'empiler ' : ''}ou accepter ?`;
        break;
      case 'AWAITING_PLAY_DRAWN':
        status = 'Joue la carte piochée ou passe.';
        break;
      case 'AWAITING_COLOR':
        status = 'Choisis la couleur de départ.';
        break;
      case 'AWAITING_SWAP_TARGET':
        status = 'Choisis avec qui échanger ta main.';
        break;
      default:
        status =
          view.drawStack.total > 0
            ? `Empile ou ramasse +${view.drawStack.total} !`
            : 'À toi de jouer !';
    }
  } else {
    status = `Au tour de ${currentName}…`;
  }

  return (
    <div className={styles.bar}>
      <span className={`${styles.status} ${myTurn ? styles.yourTurn : ''}`} role="status">
        {status}
        {seconds !== null ? (
          <span className={`${styles.timer} ${seconds <= 5 ? styles.timerLow : ''}`}>
            {' '}
            · {seconds}s
          </span>
        ) : null}
      </span>

      {selectedCount > 0 ? (
        <>
          <button type="button" className={`${ui.button} ${ui.primary}`} onClick={onPlaySelected}>
            Poser {selectedCount} carte{selectedCount > 1 ? 's' : ''}
          </button>
          <button type="button" className={`${ui.button} ${ui.ghost}`} onClick={onClearSelection}>
            Annuler
          </button>
        </>
      ) : null}

      {myTurn && view.phase.type === 'AWAITING_PLAY_DRAWN' ? (
        <button type="button" className={ui.button} onClick={onPass}>
          Garder et passer
        </button>
      ) : null}

      {myTurn && view.phase.type === 'AWAITING_CHALLENGE' ? (
        <>
          <button
            type="button"
            className={`${ui.button} ${ui.danger}`}
            onClick={() => onChallenge(true)}
          >
            Contester le +4
          </button>
          <button type="button" className={ui.button} onClick={() => onChallenge(false)}>
            Accepter +{view.drawStack.total}
          </button>
        </>
      ) : null}

      <motion.button
        type="button"
        className={styles.uno}
        disabled={!unoEnabled}
        onClick={onUno}
        animate={unoEnabled ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={unoEnabled ? { duration: 0.9, repeat: Infinity } : {}}
      >
        UNO !
      </motion.button>

      <div className={styles.emotes}>
        <button
          type="button"
          className={`${ui.button} ${ui.ghost}`}
          aria-label="Réactions"
          aria-expanded={emotesOpen}
          onClick={() => setEmotesOpen((o) => !o)}
        >
          😀
        </button>
        <AnimatePresence>
          {emotesOpen ? (
            <motion.div
              className={styles.emoteMenu}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {EMOTES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={styles.emoteButton}
                  onClick={() => {
                    onEmote(e);
                    setEmotesOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
