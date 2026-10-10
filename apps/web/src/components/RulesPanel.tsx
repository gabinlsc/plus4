import { SETTINGS_PRESETS, type GameSettings } from '@uno/shared';
import { HAND_SIZE_OPTIONS, RULE_TOGGLES, SCORE_OPTIONS, TIMER_OPTIONS } from '../lib/rules';
import ui from '../styles/ui.module.css';
import styles from './RulesPanel.module.css';

export interface RulesPanelProps {
  readonly settings: GameSettings;
  /** Absent when the viewer cannot edit (non-host). */
  readonly onChange?: (patch: Partial<GameSettings>) => void;
}

function samePreset(a: GameSettings, b: GameSettings): boolean {
  return RULE_TOGGLES.every((r) => a[r.key] === b[r.key]);
}

export function RulesPanel({ settings, onChange }: RulesPanelProps) {
  const editable = onChange !== undefined;
  const scoreTarget = settings.scoring.mode === 'points' ? settings.scoring.target : null;

  return (
    <div>
      <div className={styles.presets} role="group" aria-label="Préréglages">
        {SETTINGS_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={!editable}
            className={`${styles.preset} ${samePreset(settings, preset.settings) ? styles.presetActive : ''}`}
            onClick={() => {
              const patch: Partial<GameSettings> = {};
              for (const r of RULE_TOGGLES)
                Object.assign(patch, { [r.key]: preset.settings[r.key] });
              onChange?.(patch);
            }}
          >
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {RULE_TOGGLES.filter((r) => !r.requires || settings[r.requires]).map((rule) => {
          const on = settings[rule.key];
          return (
            <div key={rule.key} className={styles.toggle}>
              <div className={styles.toggleText}>
                <strong id={`rule-${rule.key}`}>{rule.title}</strong>
                <span>{rule.description}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`rule-${rule.key}`}
                disabled={!editable}
                className={`${styles.switch} ${on ? styles.switchOn : ''}`}
                onClick={() => onChange?.({ [rule.key]: !on })}
              />
            </div>
          );
        })}
      </div>

      <div className={styles.params}>
        <label>
          <span className={ui.label}>Cartes en main</span>
          <select
            className={styles.select}
            disabled={!editable}
            value={settings.initialHandSize}
            onChange={(e) => onChange?.({ initialHandSize: Number(e.target.value) })}
          >
            {HAND_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} cartes
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ui.label}>Temps par tour</span>
          <select
            className={styles.select}
            disabled={!editable}
            value={settings.turnTimeoutSec ?? 'off'}
            onChange={(e) =>
              onChange?.({
                turnTimeoutSec: e.target.value === 'off' ? null : Number(e.target.value),
              })
            }
          >
            {TIMER_OPTIONS.map((t) => (
              <option key={t ?? 'off'} value={t ?? 'off'}>
                {t === null ? 'Illimité' : `${t} s`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ui.label}>Fin de partie</span>
          <select
            className={styles.select}
            disabled={!editable}
            value={scoreTarget ?? 'single'}
            onChange={(e) =>
              onChange?.({
                scoring:
                  e.target.value === 'single'
                    ? { mode: 'single_round' }
                    : { mode: 'points', target: Number(e.target.value) },
              })
            }
          >
            {SCORE_OPTIONS.map((t) => (
              <option key={t ?? 'single'} value={t ?? 'single'}>
                {t === null ? 'Une manche' : `${t} points`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ui.label}>Oubli du Uno</span>
          <select
            className={styles.select}
            disabled={!editable}
            value={settings.unoPenalty.enabled ? settings.unoPenalty.cards : 0}
            onChange={(e) => {
              const cards = Number(e.target.value);
              onChange?.({
                unoPenalty: cards === 0 ? { enabled: false } : { enabled: true, cards },
              } as Partial<GameSettings>);
            }}
          >
            <option value={0}>Pas de pénalité</option>
            <option value={2}>+2 cartes</option>
            <option value={4}>+4 cartes</option>
          </select>
        </label>
      </div>
    </div>
  );
}
