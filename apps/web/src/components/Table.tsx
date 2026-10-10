import { AnimatePresence, motion } from 'framer-motion';
import type { ClientGameView } from '@uno/shared';
import { COLOR_HEX } from '../lib/cards';
import type { PlayedCard } from '../store/store';
import { useAnchors } from './anchors';
import { Card } from './Card';
import styles from './Table.module.css';

export interface TableProps {
  readonly view: ClientGameView;
  readonly discard: readonly PlayedCard[];
  readonly canDraw: boolean;
  readonly drawLabel: string;
  readonly colorblind: boolean;
  readonly onDraw: () => void;
}

export function Table({ view, discard, canDraw, drawLabel, colorblind, onDraw }: TableProps) {
  const anchors = useAnchors();
  const glow = view.top.activeColor ? COLOR_HEX[view.top.activeColor] : '#ffffff';
  const meId = view.me.id;

  /** Where a card played by `playerId` comes from, relative to the discard pile. */
  const originFor = (playerId: string) => {
    const from = anchors.rect(`seat:${playerId}`);
    const to = anchors.rect('discard');
    if (!from || !to) return { x: 0, y: -120 };
    return {
      x: from.left + from.width / 2 - (to.left + to.width / 2),
      y: from.top + from.height / 2 - (to.top + to.height / 2),
    };
  };

  return (
    <div className={styles.table}>
      <div className={styles.felt} />
      <svg
        className={`${styles.direction} ${view.direction === -1 ? styles.counter : ''}`}
        viewBox="0 0 200 120"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#fff" />
          </marker>
        </defs>
        <path
          d="M 30 60 A 70 48 0 0 1 170 60"
          fill="none"
          stroke="#fff"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          markerEnd="url(#arrow)"
        />
        <path
          d="M 170 60 A 70 48 0 0 1 30 60"
          fill="none"
          stroke="#fff"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          markerEnd="url(#arrow)"
        />
      </svg>

      <button
        type="button"
        ref={anchors.ref('deck')}
        className={`${styles.drawStack} ${canDraw ? styles.drawable : ''}`}
        disabled={!canDraw}
        onClick={onDraw}
        aria-label={drawLabel}
      >
        {[2, 1, 0].map((depth) => (
          <span
            key={depth}
            className={styles.layer}
            style={{ transform: `translate(${depth * 2}px, ${depth * -2}px)` }}
          >
            <Card card={null} />
          </span>
        ))}
        <span className={styles.count}>{view.drawPileCount}</span>
        {canDraw ? <span className={styles.drawHint}>{drawLabel}</span> : null}
      </button>

      <div className={styles.pile} ref={anchors.ref('discard')}>
        <div
          className={styles.colorRing}
          style={{ boxShadow: `0 0 0 2px ${glow}66, 0 0 42px ${glow}` }}
          aria-hidden="true"
        />
        <AnimatePresence initial={false}>
          {discard.map((played, i) => {
            const fromMe = played.playerId === meId;
            const origin =
              played.playerId && !fromMe ? originFor(played.playerId) : { x: 0, y: -40 };
            return (
              <motion.div
                key={played.card.id}
                className={styles.discardCard}
                {...(fromMe ? { layoutId: `card-${played.card.id}` } : {})}
                initial={
                  fromMe
                    ? false
                    : { ...origin, scale: 0.6, opacity: 0, rotate: played.rotation - 40 }
                }
                animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: played.rotation }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                style={{ zIndex: i }}
              >
                <Card card={played.card} colorblind={colorblind} />
              </motion.div>
            );
          })}
        </AnimatePresence>
        <AnimatePresence>
          {view.drawStack.total > 0 ? (
            <motion.div
              key={view.drawStack.total}
              className={styles.penalty}
              role="status"
              aria-label={`Pénalité en cours : ${view.drawStack.total} cartes`}
              initial={{ scale: 2.2, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            >
              +{view.drawStack.total}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
