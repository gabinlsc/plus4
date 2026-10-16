/**
 * Profil du joueur (games.glsc.fr/profil) : le cookie de session est posé sur *.glsc.fr, donc il arrive aussi ici.
 * Le serveur de jeu vérifie lui-même l'identité ; cette lecture sert seulement à l'affichage (pseudo imposé).
 */
const API = 'https://games.glsc.fr/api/profile';
export const PROFILE_PAGE = 'https://games.glsc.fr/profil/';

export interface Profile {
  readonly name: string;
}

export async function fetchProfile(): Promise<Profile | null> {
  if (!window.location.hostname.endsWith('glsc.fr')) return null; // développement local : invité
  try {
    const res = await fetch(`${API}/me`, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { profile?: { name?: unknown } | null };
    const name = body.profile?.name;
    return typeof name === 'string' && name ? { name } : null;
  } catch {
    return null;
  }
}
