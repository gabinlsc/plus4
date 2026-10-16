import { useEffect, useState } from 'react';
import { installState, onInstallChange, promptInstall } from '../lib/pwa';
import ui from '../styles/ui.module.css';

/** « Installer l'appli » : fenêtre native sur Android / ordinateur, consigne « Partager » sur iPhone ; rien si déjà installée. */
export function InstallButton() {
  const [state, setState] = useState(installState);
  const [hint, setHint] = useState(false);
  useEffect(() => onInstallChange(() => setState(installState())), []);
  if (!state.canPrompt && !state.ios) return null;
  return (
    <span>
      <button
        type="button"
        className={`${ui.button} ${ui.ghost}`}
        onClick={() => (state.canPrompt ? void promptInstall() : setHint((h) => !h))}
      >
        Installer l’appli
      </button>
      {hint && state.ios && (
        <span role="status" className={ui.muted}>
          {' '}
          Touche « Partager » puis « Sur l’écran d’accueil ».
        </span>
      )}
    </span>
  );
}
