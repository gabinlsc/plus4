import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';

/**
 * Registry of on-screen anchors (draw pile, discard pile, seats, hand) so that
 * animations can fly cards between them using real DOM positions.
 */
export interface Anchors {
  ref(id: string): (el: HTMLElement | null) => void;
  rect(id: string): DOMRect | null;
}

const AnchorsContext = createContext<Anchors | null>(null);

export function AnchorsProvider({ children }: { children: ReactNode }) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const ref = useCallback((id: string) => {
    let callback = refs.current.get(id);
    if (!callback) {
      callback = (el) => {
        if (el) nodes.current.set(id, el);
        else nodes.current.delete(id);
      };
      refs.current.set(id, callback);
    }
    return callback;
  }, []);

  const rect = useCallback(
    (id: string) => nodes.current.get(id)?.getBoundingClientRect() ?? null,
    [],
  );

  return <AnchorsContext.Provider value={{ ref, rect }}>{children}</AnchorsContext.Provider>;
}

export function useAnchors(): Anchors {
  const ctx = useContext(AnchorsContext);
  if (!ctx) throw new Error('AnchorsProvider missing');
  return ctx;
}

/** Offset (in px) from the center of anchor `to` to the center of anchor `from`. */
export function offsetBetween(
  anchors: Anchors,
  from: string,
  to: string,
): { x: number; y: number } | null {
  const a = anchors.rect(from);
  const b = anchors.rect(to);
  if (!a || !b) return null;
  return {
    x: a.left + a.width / 2 - (b.left + b.width / 2),
    y: a.top + a.height / 2 - (b.top + b.height / 2),
  };
}
