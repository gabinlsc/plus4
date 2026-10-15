import { motion, AnimatePresence } from 'framer-motion';
import type { BotDifficulty, LobbyState } from '@uno/shared';
import { Avatar } from '../components/Avatar';
import { LEVELS } from '../components/BotPicker';
import { Decor } from '../components/Decor';
import { RulesPanel } from '../components/RulesPanel';
import { useApp, useClient, useStoreApi } from '../net/context';
import { pushToast } from '../store/store';
import ui from '../styles/ui.module.css';
import styles from './RoomLobby.module.css';

const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Facile',
  normal: 'Normal',
  hard: 'Difficile',
};

export function RoomLobby({ lobby }: { lobby: LobbyState }) {
  const client = useClient();
  const store = useStoreApi();
  const meId = useApp((s) => s.session?.playerId);
  const isHost = lobby.hostId === meId;
  const me = lobby.seats.find((s) => s.id === meId);
  const emptySeats = Math.max(0, lobby.maxPlayers - lobby.seats.length);
  const canStart = isHost && lobby.seats.length >= 2;

  const copy = async () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${lobby.code}`;
    try {
      await navigator.clipboard.writeText(link);
      pushToast(store, 'Lien d’invitation copié !', 'success');
    } catch {
      pushToast(store, `Code : ${lobby.code}`);
    }
  };

  return (
    <>
      <Decor />
      <div className={styles.page}>
        <div className={styles.layout}>
          <section className={ui.panel}>
            <div className={styles.header}>
              <div>
                <span className={ui.label}>Code de la room</span>
                <p className={styles.code}>{lobby.code}</p>
              </div>
              <button type="button" className={ui.button} onClick={() => void copy()}>
                🔗 Copier le lien
              </button>
            </div>

            <div className={styles.seats}>
              <AnimatePresence initial={false}>
                {lobby.seats.map((seat) => (
                  <motion.div
                    key={seat.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`${styles.seat} ${seat.connected ? '' : styles.offline}`}
                  >
                    <Avatar name={seat.name} isBot={seat.isBot} />
                    <div className={styles.seatInfo}>
                      <div className={styles.seatName}>
                        {seat.name}
                        {seat.id === meId ? ' (toi)' : ''}
                      </div>
                      <div className={styles.seatMeta}>
                        {seat.isHost ? <span className={ui.chip}>👑 Hôte</span> : null}
                        {seat.isBot && seat.botDifficulty ? (
                          <span className={ui.chip}>
                            {LEVELS.find((l) => l.id === seat.botDifficulty)?.emoji}{' '}
                            {DIFFICULTY_LABEL[seat.botDifficulty]}
                          </span>
                        ) : null}
                        {!seat.isBot && !seat.isHost ? (
                          <span className={`${ui.chip} ${seat.ready ? styles.ready : ''}`}>
                            {seat.ready ? '✓ Prêt' : 'En attente'}
                          </span>
                        ) : null}
                        {!seat.connected ? <span className={ui.chip}>Déconnecté</span> : null}
                      </div>
                    </div>
                    {isHost && seat.id !== meId ? (
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={seat.isBot ? `Retirer ${seat.name}` : `Exclure ${seat.name}`}
                        onClick={() =>
                          void (seat.isBot ? client.removeBot(seat.id) : client.kick(seat.id))
                        }
                      >
                        ✕
                      </button>
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>
              {Array.from({ length: emptySeats }, (_, i) => (
                <div key={`empty-${i}`} className={`${styles.seat} ${styles.seatEmpty}`}>
                  Place libre
                </div>
              ))}
            </div>

            {isHost && emptySeats > 0 ? (
              <div className={styles.botAdd}>
                <span className={ui.muted}>Ajouter un bot :</span>
                {LEVELS.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className={ui.button}
                    onClick={() => void client.addBot(level.id)}
                  >
                    <span aria-hidden="true">{level.emoji}</span> + {level.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.actions}>
              {isHost ? (
                <button
                  type="button"
                  className={`${ui.button} ${ui.primary}`}
                  disabled={!canStart}
                  onClick={() => void client.start()}
                >
                  {canStart ? 'Lancer la partie' : 'En attente de joueurs…'}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${ui.button} ${me?.ready ? '' : ui.primary}`}
                  onClick={() => void client.setReady(!me?.ready)}
                >
                  {me?.ready ? 'Je ne suis plus prêt' : 'Je suis prêt'}
                </button>
              )}
              <button
                type="button"
                className={`${ui.button} ${ui.ghost}`}
                onClick={() => client.leaveRoom()}
              >
                Quitter
              </button>
            </div>
          </section>

          <section className={ui.panel}>
            <h2 className={styles.sectionTitle}>Règles {isHost ? '' : '(choisies par l’hôte)'}</h2>
            <RulesPanel
              settings={lobby.settings}
              {...(isHost ? { onChange: (patch) => void client.updateSettings(patch) } : {})}
            />
          </section>
        </div>
      </div>
    </>
  );
}
