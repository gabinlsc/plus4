/**
 * Signalement d'un bug (bouton « Un bug ? ») : envoyé au service de profils de games.glsc.fr, qui prévient sur Discord.
 * Le message, le jeu, le code du salon et la phase partent ; jamais l'adresse IP (le serveur ne l'enregistre pas).
 */
const API = 'https://games.glsc.fr/api/profile';

export interface ReportContext {
  readonly room?: string | undefined;
  readonly phase?: string | undefined;
}

export type ReportResult = 'sent' | 'offline' | 'too_many' | 'invalid' | 'error';

export async function sendReport(
  game: string,
  message: string,
  context: ReportContext,
): Promise<ReportResult> {
  if (!window.location.hostname.endsWith('glsc.fr')) return 'offline'; // développement local : pas de service
  try {
    const res = await fetch(`${API}/report`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game,
        message,
        context: { ...context, page: window.location.pathname },
      }),
    });
    if (res.status === 201) return 'sent';
    if (res.status === 429) return 'too_many';
    if (res.status === 422) return 'invalid';
    return 'error';
  } catch {
    return 'error';
  }
}
