import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  normalizeRoomCode,
  resolveSettings,
  ROOM_CODE_REGEX,
  type BotDifficulty,
  type Card as CardModel,
  type GameSettings,
} from '@uno/shared';
import { BotPicker } from '../components/BotPicker';
import { Card } from '../components/Card';
import { Decor } from '../components/Decor';
import { InstallButton } from '../components/InstallButton';
import { RulesPanel } from '../components/RulesPanel';
import { fetchProfile, PROFILE_PAGE, type Profile } from '../lib/profile';
import { useApp, useClient, useStoreApi } from '../net/context';
import { setPrefs } from '../store/store';
import ui from '../styles/ui.module.css';
import styles from './Home.module.css';

const LOGO_CARDS: readonly CardModel[] = [
  { id: 'logo-1', kind: 'colored', color: 'blue', value: 7 },
  { id: 'logo-2', kind: 'wild', color: null, value: 'wild_draw4' },
  { id: 'logo-3', kind: 'colored', color: 'red', value: 'reverse' },
];

function initialRoomCode(): string {
  const param = new URLSearchParams(window.location.search).get('room');
  return param ? normalizeRoomCode(param) : '';
}

export function Home() {
  const client = useClient();
  const store = useStoreApi();
  const prefs = useApp((s) => s.prefs);
  const [mode, setMode] = useState<'solo' | 'online'>(initialRoomCode() ? 'online' : 'solo');
  const [name, setName] = useState(prefs.name);
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchProfile().then((p) => {
      if (cancelled || !p) return;
      setProfile(p);
      setName(p.name);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [bots, setBots] = useState<BotDifficulty[]>(['normal', 'normal', 'normal']);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [code, setCode] = useState(initialRoomCode);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0 && trimmed.length <= LIMITS.playerNameMaxLength;
  const codeOk = useMemo(() => ROOM_CODE_REGEX.test(normalizeRoomCode(code)), [code]);

  const updateSettings = (patch: Partial<GameSettings>) =>
    setSettings((s) => resolveSettings(patch, s));

  const run = async (action: () => Promise<boolean>) => {
    setPrefs(store, { name: trimmed });
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const playSolo = () =>
    run(async () => {
      const created = await client.createRoom({
        playerName: trimmed,
        mode: 'solo',
        settings,
        bots: bots.map((difficulty) => ({ difficulty })),
      });
      return created && client.start();
    });

  const createOnline = () =>
    run(() => client.createRoom({ playerName: trimmed, mode: 'online', settings }));

  const join = () => run(() => client.joinRoom(normalizeRoomCode(code), trimmed));

  const rules = (
    <details className={styles.details}>
      <summary>Règles de la partie</summary>
      <div className={styles.detailsBody}>
        <RulesPanel settings={settings} onChange={updateSettings} />
      </div>
    </details>
  );

  return (
    <>
      <Decor />
      <div className={styles.page}>
        <nav className={styles.topbar} aria-label="Navigation">
          <a className={`${ui.button} ${ui.ghost}`} href="https://games.glsc.fr">
            ← Salle de jeux
          </a>
        </nav>

        <header className={styles.hero}>
          <div className={styles.logo} aria-hidden="true">
            {LOGO_CARDS.map((card, i) => (
              <motion.div
                key={card.id}
                className={styles.logoCard}
                initial={{ y: 60, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: (i - 1) * 14, x: (i - 1) * 46 }}
                transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 220, damping: 18 }}
              >
                <Card card={card} colorblind={prefs.colorblind} />
              </motion.div>
            ))}
          </div>
          <h1 className={styles.title}>
            <span className={styles.titleHl}>+4</span>
          </h1>
          <p className={styles.subtitle}>En solo contre des bots ou en ligne entre amis.</p>
        </header>

        <main className={styles.main}>
          <section className={`${ui.panel} ${styles.identity}`}>
            <div className={styles.row}>
              <label className={styles.grow}>
                <span className={ui.label}>Ton pseudo</span>
                <input
                  className={ui.input}
                  value={name}
                  maxLength={LIMITS.playerNameMaxLength}
                  placeholder="Ex : Gabin"
                  autoComplete="nickname"
                  readOnly={profile !== null}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className={ui.muted}>
                  {profile ? (
                    <>
                      Profil connecté ✓ · <a href={PROFILE_PAGE}>Mon profil</a>
                    </>
                  ) : (
                    <>
                      Pseudo libre · <a href={PROFILE_PAGE}>Réserver mon pseudo</a>
                    </>
                  )}
                </span>
              </label>
              <div className={`${ui.segmented} ${styles.modeTabs}`} role="tablist">
                {(['solo', 'online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    className={`${ui.segment} ${mode === m ? ui.segmentActive : ''}`}
                    onClick={() => setMode(m)}
                  >
                    {m === 'solo' ? 'Solo' : 'En ligne'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {mode === 'solo' ? (
            <section className={`${ui.panel} ${styles.section}`}>
              <h2>
                <span className={styles.sectionIcon} aria-hidden="true">
                  🤖
                </span>
                Partie solo
              </h2>
              <p className={ui.muted}>
                Installe jusqu’à {LIMITS.maxBots} bots autour de la table et choisis leur niveau.
              </p>
              <BotPicker bots={bots} onChange={setBots} />
              {rules}
              <button
                type="button"
                className={`${ui.button} ${ui.primary} ${styles.full} ${styles.cta}`}
                disabled={!nameOk || busy}
                onClick={() => void playSolo()}
              >
                Lancer la partie
              </button>
              {!nameOk ? <p className={styles.hint}>Entre ton pseudo pour commencer.</p> : null}
            </section>
          ) : (
            <div className={styles.columns}>
              <section className={`${ui.panel} ${styles.section}`}>
                <h2>
                  <span className={styles.sectionIcon} aria-hidden="true">
                    🏠
                  </span>
                  Créer une room
                </h2>
                <p className={ui.muted}>Jusqu’à 6 joueurs. Partage le code à tes amis.</p>
                {rules}
                <button
                  type="button"
                  className={`${ui.button} ${ui.primary} ${styles.full}`}
                  disabled={!nameOk || busy}
                  onClick={() => void createOnline()}
                >
                  Créer la room
                </button>
              </section>
              <section className={`${ui.panel} ${styles.section}`}>
                <h2>
                  <span className={styles.sectionIcon} aria-hidden="true">
                    🔑
                  </span>
                  Rejoindre
                </h2>
                <p className={ui.muted}>Entre le code reçu, par exemple P4-8F2A.</p>
                <label>
                  <span className={ui.label}>Code de la room</span>
                  <input
                    className={`${ui.input} ${styles.codeInput}`}
                    value={code}
                    maxLength={8}
                    placeholder="P4-XXXX"
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && codeOk && nameOk) void join();
                    }}
                  />
                </label>
                <div style={{ height: 18 }} />
                <button
                  type="button"
                  className={`${ui.button} ${styles.full}`}
                  disabled={!nameOk || !codeOk || busy}
                  onClick={() => void join()}
                >
                  Rejoindre la room
                </button>
              </section>
            </div>
          )}
        </main>

        <footer className={styles.footer}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.colorblind}
              onChange={(e) => setPrefs(store, { colorblind: e.target.checked })}
            />
            Mode daltonien (symboles sur les cartes)
          </label>
          <InstallButton />
          <span>
            Un jeu de <a href="https://glsc.fr">glsc.fr</a>
          </span>
        </footer>
      </div>
    </>
  );
}
