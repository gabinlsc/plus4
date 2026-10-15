import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fileResultSink, type GameRecord } from '../src/results';

const record = (t: number): GameRecord => ({
  v: 1,
  t,
  game: 'uno',
  mode: 'online',
  players: [
    { name: 'Alice', bot: false, rank: 1, won: true, score: 120 },
    { name: 'Bob', bot: false, rank: 2, won: false, score: 0 },
  ],
});

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('fileResultSink', () => {
  it('appends one JSON line per game, in order', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'uno-results-')), 'results.jsonl');
    const sink = fileResultSink(file);
    sink(record(1));
    sink(record(2));
    sink(record(3));
    await settle();
    const lines = (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as GameRecord);
    expect(lines.map((l) => l.t)).toEqual([1, 2, 3]);
    expect(lines[0]).toEqual(record(1));
  });

  it('logs a write error instead of throwing', async () => {
    const log = vi.fn();
    const sink = fileResultSink('/nonexistent-dir/results.jsonl', log);
    expect(() => sink(record(1))).not.toThrow();
    await settle();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('result not saved'));
  });
});
