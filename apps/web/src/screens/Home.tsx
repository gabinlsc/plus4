import { useMemo, useState } from 'react';
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
import { Card } from '../components/Card';
import { RulesPanel } from '../components/RulesPanel';
import { useApp, useClient, useStoreApi } from '../net/context';
import { setPrefs } from '../store/store';
import ui from '../styles/ui.module.css';
import styles from './Home.module.css';

const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Facile',
  normal: 'Normal',
  hard: 'Difficile',
};

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
    <div className={styles.page}>
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
        <h1 className={styles.title}>UNO</h1>
        <p className={styles.subtitle}>En solo contre des bots ou en ligne entre amis.</p>
      </header>

      <main className={styles.main}>
        <section className={ui.panel}>
          <div className={styles.row}>
            <label className={styles.grow}>
              <span className={ui.label}>Ton pseudo</span>
              <input
                className={ui.input}
                value={name}
                maxLength={LIMITS.playerNameMaxLength}
                placeholder="Ex : Gabin"
                autoComplete="nickname"
                onChange={(e) => setName(e.target.value)}
              />
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
            <h2>Partie solo</h2>
            <p className={ui.muted}>Affronte de 1 à 4 bots, chacun avec son niveau.</p>
            <div className={ui.segmented} role="group" aria-label="Nombre de bots">
              {Array.from({ length: LIMITS.maxBots }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${ui.segment} ${bots.length === n ? ui.segmentActive : ''}`}
                  onClick={() =>
                    setBots((b) =>
                      n > b.length
                        ? [...b, ...Array<BotDifficulty>(n - b.length).fill('normal')]
                        : b.slice(0, n),
                    )
                  }
                >
                  {n} bot{n > 1 ? 's' : ''}
                </button>
              ))}
            </div>
            <div className={styles.bots}>
              {bots.map((difficulty, i) => (
                <div key={i} className={styles.bot}>
                  <span>🤖 Bot {i + 1}</span>
                  <div className={ui.segmented}>
                    {(Object.keys(DIFFICULTY_LABEL) as BotDifficulty[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`${ui.segment} ${difficulty === d ? ui.segmentActive : ''}`}
                        onClick={() => setBots((b) => b.map((x, j) => (j === i ? d : x)))}
                      >
                        {DIFFICULTY_LABEL[d]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {rules}
            <button
              type="button"
              className={`${ui.button} ${ui.primary} ${styles.full}`}
              disabled={!nameOk || busy}
              onClick={() => void playSolo()}
            >
              Lancer la partie
            </button>
          </section>
        ) : (
          <div className={styles.columns}>
            <section className={`${ui.panel} ${styles.section}`}>
              <h2>Créer une room</h2>
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
              <h2>Rejoindre</h2>
              <p className={ui.muted}>Entre le code reçu, par exemple UNO-8F2A.</p>
              <label>
                <span className={ui.label}>Code de la room</span>
                <input
                  className={`${ui.input} ${styles.codeInput}`}
                  value={code}
                  maxLength={8}
                  placeholder="UNO-XXXX"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && codeOk && nameOk) void join();
                  }}
                />
              </label>
              <div style={{ height: 16 }} />
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
        <label>
          <input
            type="checkbox"
            checked={prefs.colorblind}
            onChange={(e) => setPrefs(store, { colorblind: e.target.checked })}
          />{' '}
          Mode daltonien (symboles sur les cartes)
        </label>
      </footer>
    </div>
  );
}
