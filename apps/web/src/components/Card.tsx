import { motion, type HTMLMotionProps } from 'framer-motion';
import type { MouseEventHandler } from 'react';
import type { Card as CardModel } from '@uno/shared';
import { cardLabel } from '../lib/cards';
import styles from './Card.module.css';
import { CardBackFace, CardFace } from './CardFace';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children' | 'onClick'> {
  /** `null` renders the back of a card. */
  readonly card: CardModel | null;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly playable?: boolean;
  readonly dimmed?: boolean;
  readonly selected?: boolean;
  readonly jumpIn?: boolean;
  readonly colorblind?: boolean;
  /** Makes the card an interactive button. */
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}

export function Card({
  card,
  size = 'md',
  playable = false,
  dimmed = false,
  selected = false,
  jumpIn = false,
  colorblind = false,
  onClick,
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    size !== 'md' ? styles[size] : '',
    onClick ? styles.clickable : '',
    dimmed ? styles.dimmed : '',
    playable ? styles.playable : '',
    selected ? styles.selected : '',
    jumpIn ? styles.jumpIn : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = card ? cardLabel(card) : 'Carte face cachée';
  const face = card ? <CardFace card={card} colorblind={colorblind} /> : <CardBackFace />;
  if (onClick) {
    return (
      <motion.button
        type="button"
        className={classes}
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        {...(rest as HTMLMotionProps<'button'>)}
      >
        {face}
      </motion.button>
    );
  }
  return (
    <motion.div className={classes} role="img" aria-label={label} {...rest}>
      {face}
    </motion.div>
  );
}
