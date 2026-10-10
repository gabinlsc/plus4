import type { LobbyError, RuleViolation } from '@uno/shared';

export type ClientError = 'TIMEOUT' | 'OFFLINE';
export type ErrorReason = RuleViolation | LobbyError | ClientError;

const MESSAGES: Record<ErrorReason, string> = {
  GAME_NOT_RUNNING: 'La partie n’est pas en cours.',
  UNKNOWN_PLAYER: 'Joueur inconnu.',
  NOT_YOUR_TURN: 'Ce n’est pas ton tour.',
  WRONG_PHASE: 'Action impossible pour le moment.',
  STALE_STATE: 'Trop tard, quelqu’un a été plus rapide !',
  CARD_NOT_IN_HAND: 'Cette carte n’est plus dans ta main.',
  ILLEGAL_CARD: 'Cette carte ne peut pas être posée.',
  MUST_STACK_OR_DRAW: 'Empile un +2 / +4 ou ramasse la pénalité.',
  COLOR_REQUIRED: 'Choisis une couleur.',
  MULTIPLE_PLAY_DISABLED: 'La pose multiple est désactivée.',
  MULTIPLE_PLAY_MISMATCH: 'Les cartes doivent avoir la même valeur.',
  JUMP_IN_DISABLED: 'L’interception est désactivée.',
  JUMP_IN_NOT_IDENTICAL: 'Pour couper, il faut exactement la même carte.',
  CANNOT_PASS: 'Tu dois d’abord piocher.',
  INVALID_TARGET: 'Cible invalide.',
  UNO_NOT_ALLOWED: 'Tu ne peux pas annoncer Uno maintenant.',
  NOTHING_TO_CATCH: 'Trop tard, rien à signaler.',
  ROOM_NOT_FOUND: 'Room introuvable. Vérifie le code.',
  ROOM_FULL: 'Cette room est complète.',
  GAME_IN_PROGRESS: 'Une partie est déjà en cours.',
  NOT_HOST: 'Seul l’hôte peut faire ça.',
  INVALID_PAYLOAD: 'Données invalides.',
  NOT_ENOUGH_PLAYERS: 'Il faut au moins 2 joueurs.',
  NOT_IN_ROOM: 'Tu n’es dans aucune room.',
  RATE_LIMITED: 'Doucement !',
  SESSION_EXPIRED: 'Ta session a expiré.',
  TIMEOUT: 'Le serveur ne répond pas.',
  OFFLINE: 'Connexion perdue, reconnexion en cours…',
};

export function errorMessage(reason: ErrorReason): string {
  return MESSAGES[reason];
}
