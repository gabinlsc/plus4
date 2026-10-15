import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_PREFIX } from '@uno/shared';

export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    const code = `${ROOM_CODE_PREFIX}${suffix}`;
    if (!isTaken(code)) return code;
  }
  throw new Error('Unable to allocate a room code');
}

const BOT_NAMES = [
  'Robo Rita',
  'Captain Card',
  'Mister Plus4',
  'Lady Reverse',
  'Plus Quatro',
  'Skipper',
  'Wild Willy',
  'Deckard',
];

export function pickBotName(taken: ReadonlySet<string>): string {
  const free = BOT_NAMES.find((n) => !taken.has(n));
  if (free) return free;
  let i = 2;
  while (taken.has(`Bot ${i}`)) i++;
  return `Bot ${i}`;
}

/** Appends " 2", " 3"… so that every seat name is unique in a room. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}
