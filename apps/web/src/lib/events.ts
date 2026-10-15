import type { GameEvent, PlayerId } from '@uno/shared';
import { COLOR_LABEL } from './cards';
import type { ToastTone } from '../store/store';

export interface EventToast {
  readonly text: string;
  readonly tone: ToastTone;
}

/** Turns notable game events into short French notifications. */
export function describeEvent(
  event: GameEvent,
  nameOf: (id: PlayerId) => string,
  meId: PlayerId,
): EventToast | null {
  const who = (id: PlayerId) => (id === meId ? 'Tu' : nameOf(id));
  switch (event.type) {
    case 'CARD_PLAYED':
      return event.jumpIn
        ? {
            text: `${who(event.playerId)} ${event.playerId === meId ? 'coupes' : 'coupe'} !`,
            tone: 'alert',
          }
        : null;
    case 'UNO_CALLED':
      return { text: `${nameOf(event.playerId)} : Dernière !`, tone: 'alert' };
    case 'UNO_CAUGHT':
      return {
        text:
          event.target === meId
            ? `${nameOf(event.by)} t’a pris sans annonce !`
            : `${nameOf(event.by)} a pris ${nameOf(event.target)} sans annonce !`,
        tone: event.target === meId ? 'error' : 'info',
      };
    case 'CHALLENGE_RESOLVED':
      return event.bluff
        ? { text: `Bluff démasqué ! ${nameOf(event.accusedId)} pioche.`, tone: 'success' }
        : { text: `Contestation ratée, ${nameOf(event.challengerId)} pioche +6.`, tone: 'info' };
    case 'HANDS_SWAPPED':
      return { text: `${nameOf(event.a)} échange sa main avec ${nameOf(event.b)}`, tone: 'info' };
    case 'HANDS_ROTATED':
      return { text: 'Rotation des mains !', tone: 'info' };
    case 'DECK_RESHUFFLED':
      return { text: 'La défausse est remélangée', tone: 'info' };
    case 'COLOR_CHOSEN':
      return event.playerId === meId
        ? null
        : {
            text: `${nameOf(event.playerId)} choisit le ${COLOR_LABEL[event.color]}`,
            tone: 'info',
          };
    case 'CARDS_DRAWN':
      return event.reason === 'penalty' && event.count >= 4
        ? { text: `${nameOf(event.playerId)} ramasse +${event.count} !`, tone: 'alert' }
        : null;
    default:
      return null;
  }
}
