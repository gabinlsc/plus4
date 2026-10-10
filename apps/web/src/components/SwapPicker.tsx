import type { PlayerId, PublicPlayerState } from '@uno/shared';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import styles from './Modal.module.css';
import ui from '../styles/ui.module.css';

export function SwapPicker({
  opponents,
  onPick,
}: {
  opponents: readonly PublicPlayerState[];
  onPick: (id: PlayerId) => void;
}) {
  return (
    <Modal title="Échange de main">
      <p>Avec qui veux-tu échanger ta main ?</p>
      <div className={styles.targets}>
        {opponents.map((o) => (
          <button key={o.id} type="button" className={styles.target} onClick={() => onPick(o.id)}>
            <Avatar name={o.name} isBot={o.isBot} size={36} />
            <span className={styles.targetName}>{o.name}</span>
            <span className={ui.chip}>
              {o.handCount} carte{o.handCount > 1 ? 's' : ''}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
