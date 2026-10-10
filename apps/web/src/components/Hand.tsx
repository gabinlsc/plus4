import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import type { Card as CardModel } from '@uno/shared';
import { sortHand } from '../lib/cards';
import { useAnchors } from './anchors';
import { Card } from './Card';
import styles from './Hand.module.css';

export interface HandProps {
  readonly cards: readonly CardModel[];
  readonly playableIds: readonly string[];
  readonly jumpInIds: readonly string[];
  readonly selectedIds: readonly string[];
  readonly myTurn: boolean;
  /** Increments on every rejected action. */
  readonly shake: number;
  /** Increments when a new deal happens: cards fly in one by one. */
  readonly dealSeq: number;
  readonly colorblind: boolean;
  readonly onCardClick: (card: CardModel) => void;
}

const CARD_RATIO = 0.75;
const DEAL_STAGGER = 0.07;
const NO_DELAYS: ReadonlyMap<string, number> = new Map();

export function Hand({
  cards,
  playableIds,
  jumpInIds,
  selectedIds,
  myTurn,
  shake,
  dealSeq,
  colorblind,
  onCardClick,
}: HandProps) {
  const anchors = useAnchors();
  const controls = useAnimationControls();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(800);
  const [cardWidth, setCardWidth] = useState(96);
  const sorted = sortHand(cards);
  const n = sorted.length;

  // Cards present right after a deal fly in one after the other. Derived
  // during render so the very first frame of each card already has its delay.
  const [deal, setDeal] = useState({ seq: 0, delays: NO_DELAYS, until: 0 });
  if (deal.seq !== dealSeq) {
    setDeal({
      seq: dealSeq,
      delays: new Map(sorted.map((c, i) => [c.id, 0.15 + i * DEAL_STAGGER])),
      until: Date.now() + (0.8 + n * DEAL_STAGGER) * 1000,
    });
  }
  const dealDelays = Date.now() < deal.until ? deal.delays : NO_DELAYS;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      setWidth(el.clientWidth);
      const probe = getComputedStyle(el).getPropertyValue('--card-w');
      const px = parseFloat(probe);
      if (!Number.isNaN(px)) setCardWidth(px);
      else setCardWidth(Math.min(104, Math.max(64, window.innerWidth * 0.09)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (shake > 0)
      void controls.start({ x: [0, -14, 12, -8, 6, 0], transition: { duration: 0.42 } });
  }, [shake, controls]);

  // Overlap cards so the whole hand always fits the available width.
  const step = n > 1 ? Math.min(cardWidth * CARD_RATIO, (width - 24 - cardWidth) / (n - 1)) : 0;
  const overlap = cardWidth - step;
  const mid = (n - 1) / 2;

  const deck = anchors.rect('deck');
  const box = containerRef.current?.getBoundingClientRect();
  const fromDeck =
    deck && box
      ? { x: deck.left + deck.width / 2 - (box.left + box.width / 2), y: deck.top - box.top }
      : { x: 0, y: -260 };

  return (
    <div className={styles.wrap} ref={containerRef}>
      <motion.div
        className={`${styles.hand} ${myTurn ? styles.myTurn : ''}`}
        animate={controls}
        ref={anchors.ref('hand')}
        role="list"
        aria-label="Ta main"
      >
        <AnimatePresence>
          {sorted.map((card, i) => {
            const offset = i - mid;
            const playable = myTurn && playableIds.includes(card.id);
            const jump = !myTurn && jumpInIds.includes(card.id);
            const selected = selectedIds.includes(card.id);
            const rotate = n > 1 ? offset * Math.min(3, 26 / n) : 0;
            const lift = Math.abs(offset) ** 2 * Math.min(1.2, 14 / (n * n)) * 2;
            return (
              <motion.div
                key={card.id}
                role="listitem"
                className={styles.slot}
                style={{ marginLeft: -overlap, zIndex: i }}
                layoutId={`card-${card.id}`}
                initial={{ ...fromDeck, opacity: 0, rotate: -20, scale: 0.7 }}
                animate={{
                  x: 0,
                  y: selected ? -28 + lift : lift,
                  opacity: 1,
                  rotate,
                  scale: 1,
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ y: lift - 22, scale: 1.04, zIndex: 100 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 26,
                  delay: dealDelays.get(card.id) ?? 0,
                }}
              >
                <Card
                  card={card}
                  playable={playable}
                  jumpIn={jump}
                  selected={selected}
                  dimmed={myTurn && !playable && !selected}
                  colorblind={colorblind}
                  onClick={() => onCardClick(card)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
