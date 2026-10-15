import { motion } from 'framer-motion';
import type { ClientGameView } from '@uno/shared';
import ui from '../styles/ui.module.css';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import modal from './Modal.module.css';

const CONFETTI_COLORS = ['#ff4f4f', '#ffc83d', '#22b573', '#3d7bff', '#c3a6ff', '#111111'];

function Confetti() {
  return (
    <div
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 60 }}
      aria-hidden="true"
    >
      {Array.from({ length: 48 }, (_, i) => (
        <motion.span
          key={i}
          style={{
            position: 'absolute',
            top: -20,
            left: `${(i * 97) % 100}%`,
            width: 8,
            height: 14,
            borderRadius: 2,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: 360 * ((i % 3) + 1), opacity: [1, 1, 0.6] }}
          transition={{ duration: 2.4 + (i % 7) * 0.25, delay: (i % 12) * 0.08, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

export interface ResultsProps {
  readonly view: ClientGameView;
  readonly isHost: boolean;
  readonly onRematch: () => void;
  readonly onLeave: () => void;
}

export function Results({ view, isHost, onRematch, onLeave }: ResultsProps) {
  const { phase } = view;
  if (phase.type !== 'ROUND_OVER' && phase.type !== 'GAME_OVER') return null;
  const winner = view.seats.find((s) => s.id === phase.winnerId);
  const iWon = phase.winnerId === view.me.id;
  const ranking = [...view.seats].sort((a, b) => b.score - a.score);
  const final = phase.type === 'GAME_OVER';
  const pointsMode = view.settings.scoring.mode === 'points';

  return (
    <>
      {iWon ? <Confetti /> : null}
      <Modal
        title={
          iWon
            ? final
              ? 'Victoire !'
              : 'Manche gagnée !'
            : `${winner?.name ?? '?'} gagne ${final ? 'la partie' : 'la manche'}`
        }
      >
        <p>
          {phase.type === 'ROUND_OVER'
            ? `+${phase.points} points. Manche suivante dans quelques secondes…`
            : pointsMode
              ? 'Fin de la partie.'
              : iWon
                ? 'Bien joué !'
                : 'Retente ta chance !'}
        </p>
        {pointsMode || final ? (
          <div className={modal.targets} style={{ marginBottom: 20 }}>
            {ranking.map((s, i) => (
              <div key={s.id} className={modal.target} style={{ cursor: 'default' }}>
                <strong style={{ width: 20 }}>{i + 1}</strong>
                <Avatar name={s.name} isBot={s.isBot} size={32} />
                <span className={modal.targetName}>
                  {s.name}
                  {s.id === view.me.id ? ' (toi)' : ''}
                </span>
                <span className={ui.chip}>{s.score} pts</span>
              </div>
            ))}
          </div>
        ) : null}
        {final ? (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {isHost ? (
              <button type="button" className={`${ui.button} ${ui.primary}`} onClick={onRematch}>
                Rejouer
              </button>
            ) : (
              <span className={ui.muted} style={{ alignSelf: 'center' }}>
                En attente de l’hôte…
              </span>
            )}
            <button type="button" className={ui.button} onClick={onLeave}>
              Quitter
            </button>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
