import { useEffect, useRef, useState } from 'react';
import { sendReport, type ReportContext, type ReportResult } from '../lib/report';
import ui from '../styles/ui.module.css';
import styles from './ReportButton.module.css';

const TEXT: Record<ReportResult, string> = {
  sent: 'Merci ! Ton signalement est bien arrivé.',
  offline: 'Le signalement marche sur la version en ligne.',
  too_many: 'Déjà plusieurs signalements : merci, on regarde.',
  invalid: 'Décris le problème en quelques mots.',
  error: 'Envoi impossible pour le moment, réessaie plus tard.',
};

/** Petit bouton flottant : « Un bug ? » → une zone de texte, et c'est parti sur le Discord de l'équipe. */
export function ReportButton({ game, context }: { game: string; context: ReportContext }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    if (result === 'sent') setText('');
    setResult(null);
  };
  const submit = async () => {
    setBusy(true);
    setResult(await sendReport(game, text, context));
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen(true)}
        aria-label="Signaler un bug"
      >
        <span aria-hidden="true">🐞</span>
        <span className={styles.label}>Un bug ?</span>
      </button>
      {open ? (
        <div className={styles.backdrop} onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Signaler un bug"
            className={`${ui.panel} ${styles.dialog}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.title}>Un bug ? Dis-nous tout</h2>
            <textarea
              ref={area}
              className={`${ui.input} ${styles.area}`}
              value={text}
              maxLength={600}
              rows={5}
              placeholder="Qu’est-ce qui s’est passé ? Qu’est-ce que tu attendais ?"
              onChange={(e) => setText(e.target.value)}
            />
            <p className={ui.muted}>
              On joint le jeu, le code du salon et ton navigateur. Jamais ton adresse IP. (
              {text.length}/600)
            </p>
            {result ? (
              <p role="status" className={styles.result}>
                {TEXT[result]}
              </p>
            ) : null}
            <div className={styles.actions}>
              <button type="button" className={`${ui.button} ${ui.ghost}`} onClick={close}>
                {result === 'sent' ? 'Fermer' : 'Annuler'}
              </button>
              {result === 'sent' ? null : (
                <button
                  type="button"
                  className={`${ui.button} ${ui.primary}`}
                  disabled={busy || text.trim().length < 3}
                  onClick={() => void submit()}
                >
                  Envoyer
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
