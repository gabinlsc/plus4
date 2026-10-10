import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameEvent, PlayerId } from '@uno/shared';
import { useAnchors } from './anchors';
import { Card } from './Card';

interface Flight {
  readonly id: string;
  readonly from: DOMRect;
  readonly to: DOMRect;
  readonly delay: number;
}

const MAX_PER_TARGET = 7;

/**
 * Card backs flying from the draw pile to opponents' seats when they are
 * dealt or draw cards. The local player's own cards animate inside the hand.
 */
export function FlyingCards({
  seq,
  events,
  meId,
}: {
  seq: number;
  events: readonly GameEvent[];
  meId: PlayerId;
}) {
  const anchors = useAnchors();
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const launched = useRef(seq);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (launched.current === seq) return undefined;
    launched.current = seq;
    const deck = anchors.rect('deck');
    if (!deck) return undefined;
    const next: Flight[] = [];
    const launch = (playerId: PlayerId, count: number, baseDelay: number, stagger: number) => {
      if (playerId === meId) return;
      const to = anchors.rect(`seat:${playerId}`);
      if (!to) return;
      for (let i = 0; i < Math.min(count, MAX_PER_TARGET); i++) {
        next.push({
          id: `${seq}-${playerId}-${i}`,
          from: deck,
          to,
          delay: baseDelay + i * stagger,
        });
      }
    };
    for (const event of events) {
      if (event.type === 'CARDS_DEALT') {
        Object.entries(event.perPlayer).forEach(([playerId, count], seat) =>
          launch(playerId, count, 0.15 + seat * 0.03, 0.18),
        );
      } else if (event.type === 'CARDS_DRAWN' && event.count > 0) {
        launch(event.playerId, event.count, 0, 0.08);
      }
    }
    if (next.length === 0) return undefined;
    setFlights((f) => [...f, ...next]);
    const longest = Math.max(...next.map((f) => f.delay)) + 0.7;
    // Each batch cleans itself up, even if newer batches arrive meanwhile.
    timers.current.push(
      setTimeout(() => setFlights((f) => f.filter((x) => !next.includes(x))), longest * 1000),
    );
    return undefined;
    // Only new event batches launch flights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}
      aria-hidden="true"
    >
      <AnimatePresence>
        {flights.map((f) => (
          <motion.div
            key={f.id}
            style={{ position: 'fixed', left: f.from.left, top: f.from.top, width: f.from.width }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
            animate={{
              x: f.to.left + f.to.width / 2 - (f.from.left + f.from.width / 2),
              y: f.to.top + f.to.height / 2 - (f.from.top + f.from.height / 2),
              scale: 0.35,
              opacity: [1, 1, 0],
              rotate: 200,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, delay: f.delay, ease: [0.3, 0.7, 0.4, 1] }}
          >
            <Card card={null} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
