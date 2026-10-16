/** Installation de l'appli (PWA) : service worker, bouton « Installer » et consigne iOS. */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** Chrome / Edge / Android : le navigateur peut afficher sa fenêtre d'installation. */
  readonly canPrompt: boolean;
  /** iPhone / iPad (Safari) : pas de fenêtre, il faut passer par « Partager ». */
  readonly ios: boolean;
  /** Déjà lancée comme une appli. */
  readonly installed: boolean;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function installState(): InstallState {
  const installed = isStandalone();
  return { canPrompt: !installed && deferred !== null, ios: !installed && isIos(), installed };
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ouvre la fenêtre d'installation du navigateur ; renvoie true si le joueur accepte. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

/** À appeler une fois au démarrage (en production uniquement : le service worker gêne le rechargement à chaud). */
export function setupPwa(enableServiceWorker: boolean): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
  if (enableServiceWorker && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sans service worker, le jeu fonctionne comme avant */
      });
    });
  }
}
