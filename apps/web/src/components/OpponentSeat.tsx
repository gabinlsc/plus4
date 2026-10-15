import { AnimatePresence, motion } from 'framer-motion';
import type { Emote, PublicPlayerState } from '@uno/shared';
import { useCountdown } from '../lib/useCountdown';
import ui from '../styles/ui.module.css';
import { useAnchors } from './anchors';
import { Avatar } from './Avatar';
import { Card } from './Card';
import styles from './OpponentSeat.module.css';

export interface OpponentSeatProps {
  readonly seat: PublicPlayerState;
  readonly isCurrent: boolean;
  readonly turnDeadline: number | null;
  readonly turnSeconds: number | null;
  readonly autopilot: boolean;
  readonly emote: { emote: Emote; seq: number } | undefined;
  readonly onCatch: (() => void) | undefined;
}

const MAX_FAN = 8;

export function TimerRing({ deadline, total }: { deadline: number | null; total: number | null }) {
  const left = useCountdown(deadline);
  if (left === null || total === null) return null;
  const ratio = Math.max(0, Math.min(1, left / total));
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg className={styles.timer} viewBox="0 0 64 64" aria-label={`${left} secondes restantes`}>
      <circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke={left <= 5 ? 'var(--danger)' : 'var(--ink)'}
        strokeWidth={4}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        style={{ transition: 'stroke-dashoffset 0.25s linear' }}
      />
    </svg>
  );
}

export function OpponentSeat({
  seat,
  isCurrent,
  turnDeadline,
  turnSeconds,
  autopilot,
  emote,
  onCatch,
}: OpponentSeatProps) {
  const anchors = useAnchors();
  const shown = Math.min(seat.handCount, MAX_FAN);
  return (
    <div
      className={`${styles.seat} ${isCurrent ? styles.current : ''} ${seat.connected || seat.isBot ? '' : styles.away}`}
      ref={anchors.ref(`seat:${seat.id}`)}
    >
      <AnimatePresence>
        {emote ? (
          <motion.div
            key={emote.seq}
            className={styles.emote}
            initial={{ opacity: 0, y: 10, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10], scale: [0.6, 1.1, 1, 1] }}
            transition={{ duration: 2.4, times: [0, 0.12, 0.8, 1] }}
          >
            {emote.emote}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className={styles.avatarWrap}>
        <Avatar name={seat.name} isBot={seat.isBot || autopilot} />
        {isCurrent ? (
          <motion.span
            className={styles.turn}
            layoutId="turn-ring"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        ) : null}
        {isCurrent ? <TimerRing deadline={turnDeadline} total={turnSeconds} /> : null}
        <AnimatePresence>
          {seat.handCount === 1 && seat.uno.declared ? (
            <motion.span
              className={styles.uno}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              UNO
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <div className={styles.name}>{seat.name}</div>
      <div className={styles.meta}>
        {autopilot ? <span className={ui.chip}>Auto</span> : null}
        {!seat.connected && !seat.isBot ? <span className={ui.chip}>Hors ligne</span> : null}
        <span>{seat.score > 0 ? `${seat.score} pts` : null}</span>
      </div>
      <div className={styles.fan} aria-label={`${seat.handCount} cartes`}>
        <AnimatePresence initial={false}>
          {Array.from({ length: shown }, (_, i) => (
            <motion.div
              key={i}
              className={styles.fanCard}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1, rotate: (i - (shown - 1) / 2) * 5 }}
              exit={{ y: 10, opacity: 0 }}
            >
              <Card card={null} size="sm" />
            </motion.div>
          ))}
        </AnimatePresence>
        <motion.span
          key={seat.handCount}
          className={styles.count}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
        >
          {seat.handCount}
        </motion.span>
      </div>
      <AnimatePresence>
        {onCatch ? (
          <motion.button
            type="button"
            className={styles.catch}
            onClick={onCatch}
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.12, 1] }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            Contre-Uno !
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
