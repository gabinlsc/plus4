import { AnimatePresence, motion } from 'framer-motion';
import { useApp, useStoreApi } from '../net/context';
import { dismissToast } from '../store/store';
import styles from './Toasts.module.css';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const store = useStoreApi();
  return (
    <div className={styles.stack} aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`${styles.toast} ${t.tone !== 'info' ? styles[t.tone] : ''}`}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={() => dismissToast(store, t.id)}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConnectionBanner() {
  const connection = useApp((s) => s.connection);
  return (
    <AnimatePresence>
      {connection !== 'online' ? (
        <motion.div
          className={styles.banner}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          role="status"
        >
          {connection === 'connecting' ? 'Connexion au serveur…' : 'Connexion perdue, reconnexion…'}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
