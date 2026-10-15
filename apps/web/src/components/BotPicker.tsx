import { AnimatePresence, motion } from 'framer-motion';
import { LIMITS, type BotDifficulty } from '@uno/shared';
import styles from './BotPicker.module.css';

interface Level {
  readonly id: BotDifficulty;
  readonly emoji: string;
  readonly label: string;
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', emoji: '🐣', label: 'Facile' },
  { id: 'normal', emoji: '🙂', label: 'Normal' },
  { id: 'hard', emoji: '😈', label: 'Difficile' },
];

const PRESETS: readonly {
  readonly id: BotDifficulty;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'easy', label: 'Tranquille', hint: 'Tous faciles' },
  { id: 'normal', label: 'Équilibré', hint: 'Tous normaux' },
  { id: 'hard', label: 'Corsé', hint: 'Tous difficiles' },
];

const NORMAL: Level = { id: 'normal', emoji: '🙂', label: 'Normal' };
const levelOf = (id: BotDifficulty): Level => LEVELS.find((l) => l.id === id) ?? NORMAL;
const NEXT: Record<BotDifficulty, BotDifficulty> = { easy: 'normal', normal: 'hard', hard: 'easy' };
const nextLevel = (id: BotDifficulty): BotDifficulty => NEXT[id];

const ALL_SAME: Record<BotDifficulty, string> = {
  easy: 'tous faciles',
  normal: 'tous de niveau normal',
  hard: 'tous difficiles',
};

/** Places autour de la table, dans l'ordre où on les remplit. */
const AREAS = ['b1', 'b2', 'b3', 'b4'] as const;

export interface BotPickerProps {
  readonly bots: readonly BotDifficulty[];
  readonly onChange: (bots: BotDifficulty[]) => void;
}

/**
 * Choix des adversaires sur une mini-table vue de dessus : on clique sur une place
 * libre pour ajouter un bot, sur un bot pour changer son niveau.
 */
export function BotPicker({ bots, onChange }: BotPickerProps) {
  const max = LIMITS.maxBots;
  const allSame = bots.every((b) => b === bots[0]);

  const summary = bots.length === 1 ? '1 adversaire' : `${bots.length} adversaires`;
  const first = bots[0] ?? 'normal';
  const levelSummary =
    bots.length === 1
      ? `niveau ${levelOf(first).label.toLowerCase()}`
      : allSame
        ? ALL_SAME[first]
        : 'niveaux mélangés';

  return (
    <div className={styles.picker}>
      <div className={styles.presets} role="group" aria-label="Niveau de toute la table">
        {PRESETS.map((p) => {
          const active = allSame && bots[0] === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              className={`${styles.preset} ${active ? styles.presetActive : ''}`}
              onClick={() => onChange(bots.map(() => p.id))}
            >
              <span className={styles.presetEmoji} aria-hidden="true">
                {levelOf(p.id).emoji}
              </span>
              <span>
                <strong>{p.label}</strong>
                <small>{p.hint}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.table}>
        <div className={styles.felt} aria-live="polite">
          <strong>{summary}</strong>
          <span>{levelSummary}</span>
        </div>

        {AREAS.slice(0, max).map((area, i) => {
          const difficulty = bots[i];
          return (
            <div key={area} className={styles.place} style={{ gridArea: area }}>
              <AnimatePresence mode="popLayout" initial={false}>
                {difficulty ? (
                  <motion.div
                    key="bot"
                    className={styles.botWrap}
                    initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
                    animate={{ scale: 1, opacity: 1, rotate: i % 2 === 0 ? -3 : 3 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                  >
                    <button
                      type="button"
                      className={`${styles.bot} ${styles[difficulty]}`}
                      aria-label={`Bot ${i + 1} : ${levelOf(difficulty).label}. Changer de niveau`}
                      onClick={() => onChange(bots.map((b, j) => (j === i ? nextLevel(b) : b)))}
                    >
                      <motion.span
                        key={difficulty}
                        className={styles.botEmoji}
                        initial={{ scale: 0.5, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        aria-hidden="true"
                      >
                        {levelOf(difficulty).emoji}
                      </motion.span>
                      <span className={styles.botName}>Bot {i + 1}</span>
                      <span className={styles.botLevel}>{levelOf(difficulty).label}</span>
                    </button>
                    {bots.length > 1 ? (
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Retirer le bot ${i + 1}`}
                        onClick={() => onChange(bots.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    ) : null}
                  </motion.div>
                ) : (
                  <motion.button
                    key="empty"
                    type="button"
                    className={styles.empty}
                    aria-label="Ajouter un bot"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    disabled={i !== bots.length}
                    onClick={() => onChange([...bots, bots[bots.length - 1] ?? 'normal'])}
                  >
                    <span aria-hidden="true">+</span>
                    <small>{i === bots.length ? 'Ajouter' : 'Libre'}</small>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div className={styles.me} style={{ gridArea: 'me' }}>
          <span aria-hidden="true">🙋</span> Toi
        </div>
      </div>

      <p className={styles.help}>
        Clique sur un bot pour changer son niveau (
        {LEVELS.map((l) => `${l.emoji} ${l.label}`).join(' → ')}).
      </p>
    </div>
  );
}
