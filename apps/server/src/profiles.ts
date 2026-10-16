/**
 * Player profiles (https://games.glsc.fr/profil): who is behind a connection.
 *
 * The browser sends its session cookie (`glsc_sid`, valid on *.glsc.fr) with the WebSocket handshake. We never read it
 * ourselves: the profiles service decides, over the internal network, and tells us the profile or whether a guest
 * may use the pseudo they typed. Any failure (service down, slow, absent) means "guest": the game never depends on it.
 */

export interface Identity {
  /** Profile id when the cookie is valid, otherwise null (guest). */
  readonly pid: string | null;
  /** Profile pseudo (only with `pid`). */
  readonly name: string | null;
  /** Guests only: false when the pseudo belongs to a profile. */
  readonly guestNameOk: boolean;
}

export type Identify = (cookieHeader: string | undefined, name: string) => Promise<Identity>;

const GUEST: Identity = { pid: null, name: null, guestNameOk: true };

/** No profiles service configured: everyone is a guest. */
export const guestsOnly: Identify = () => Promise.resolve(GUEST);

export function createIdentify(baseUrl: string | undefined, timeoutMs = 1000): Identify {
  if (!baseUrl) return guestsOnly;
  const url = `${baseUrl.replace(/\/+$/, '')}/identify`;
  return async (cookieHeader, name) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cookie: cookieHeader ?? '', name }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return GUEST;
      const body = (await res.json()) as Record<string, unknown>;
      if (typeof body.pid === 'string' && /^[0-9a-f]{16}$/.test(body.pid)) {
        const profileName = typeof body.name === 'string' ? body.name.trim() : '';
        return profileName.length >= 1 && profileName.length <= 16
          ? { pid: body.pid, name: profileName, guestNameOk: true }
          : GUEST;
      }
      return { pid: null, name: null, guestNameOk: body.guestNameOk !== false };
    } catch {
      return GUEST;
    }
  };
}
