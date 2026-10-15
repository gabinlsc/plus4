import { appendFile } from 'node:fs/promises';
import type { RoomMode } from '@uno/shared';

/** One player in a finished game, best rank first. Humans who left or ended on autopilot are not listed. */
export interface ResultPlayer {
  readonly name: string;
  readonly bot: boolean;
  /** 1 = winner, then by score, then by cards left in hand. */
  readonly rank: number;
  readonly won: boolean;
  readonly score: number;
}

/**
 * A finished game, as written to RESULTS_FILE (one JSON object per line).
 * Read by the glsc.fr probe to build the public leaderboard of games.glsc.fr.
 */
export interface GameRecord {
  readonly v: 1;
  /** Unix time, seconds. */
  readonly t: number;
  readonly game: 'uno';
  readonly mode: RoomMode;
  readonly players: readonly ResultPlayer[];
}

export type ResultSink = (record: GameRecord) => void;

/** Appends each record to `file`, in order. A write error is logged and never reaches the game. */
export function fileResultSink(
  file: string,
  log: (message: string) => void = console.error,
): ResultSink {
  let queue: Promise<void> = Promise.resolve();
  return (record) => {
    const line = `${JSON.stringify(record)}\n`;
    queue = queue
      .then(() => appendFile(file, line, { mode: 0o640 }))
      .catch((e: unknown) =>
        log(`[uno] result not saved: ${e instanceof Error ? e.message : String(e)}`),
      );
  };
}
