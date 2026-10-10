import { CARD_COLORS, type CardColor } from '@uno/shared';
import { COLOR_HEX, COLOR_LABEL } from '../lib/cards';
import ui from '../styles/ui.module.css';
import { Modal } from './Modal';
import styles from './Modal.module.css';

export function ColorPicker({
  onPick,
  onCancel,
}: {
  onPick: (c: CardColor) => void;
  onCancel?: () => void;
}) {
  return (
    <Modal title="Choisis une couleur">
      <p>La couleur que les autres devront suivre.</p>
      <div className={styles.colors}>
        {CARD_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={styles.color}
            style={{ background: COLOR_HEX[color] }}
            onClick={() => onPick(color)}
          >
            {COLOR_LABEL[color].toUpperCase()}
          </button>
        ))}
      </div>
      {onCancel ? (
        <button
          type="button"
          className={`${ui.button} ${ui.ghost} ${styles.cancel}`}
          onClick={onCancel}
        >
          Annuler
        </button>
      ) : null}
    </Modal>
  );
}
