# UNO — multijoueur temps réel

Plateforme web de Uno : **solo contre 1 à 4 bots** ou **en ligne jusqu’à 6 joueurs** dans des rooms privées (`UNO-8F2A`), avec des **règles maison configurables** (interception, empilement des +2/+4, 7 et 0, contestation du +4…).

- Serveur **autoritaire** (Node.js + Socket.IO) : il est la seule source de vérité, les clients n’envoient que des intentions.
- Moteur de jeu **pur et déterministe**, développé en TDD.
- Interface **React + Framer Motion** : cartes SVG, distribution animée, carte qui vole de la main au centre, secousse sur action invalide, compteur de pénalité « +N ».

## Démarrage rapide

Prérequis : Node.js ≥ 22 et pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # serveur sur :3001 + client Vite sur http://localhost:5173
```

Ouvre <http://localhost:5173>, choisis un pseudo et lance une partie solo, ou crée une room en ligne et partage le lien d’invitation.

### Production

```bash
pnpm build        # compile le client web dans apps/web/dist
pnpm start        # un seul processus : API + WebSocket + client sur :3001
```

Ou avec Docker :

```bash
docker build -t uno .
docker run -p 3001:3001 uno
```

| Variable                   | Défaut                  | Rôle                                             |
| -------------------------- | ----------------------- | ------------------------------------------------ |
| `PORT`                     | `3001`                  | Port HTTP + Socket.IO                            |
| `CORS_ORIGIN`              | `http://localhost:5173` | Origines autorisées (séparées par des virgules)  |
| `STATIC_DIR`               | _(aucun)_               | Dossier du client compilé à servir               |
| `VITE_SERVER_URL` (client) | _(même origine)_        | URL du serveur si le client est hébergé ailleurs |

## Scripts

| Commande         | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `pnpm dev`       | Serveur (`tsx watch`) + client (Vite) en parallèle          |
| `pnpm test`      | Tests unitaires et d’intégration (Vitest, tous les paquets) |
| `pnpm e2e`       | Tests de bout en bout Playwright (build + serveur réel)     |
| `pnpm typecheck` | TypeScript strict sur tout le dépôt                         |
| `pnpm lint`      | ESLint                                                      |
| `pnpm format`    | Prettier                                                    |
| `pnpm check`     | typecheck + lint + format + tests                           |

## Architecture

```
packages/
  shared/   @uno/shared   Types partagés (Card, GameSettings, GameState, protocole), schémas zod
  engine/   @uno/engine   Moteur de règles pur : applyIntent(state, joueur, intention) → état + événements
  bot/      @uno/bot      IA des bots, qui ne voit que la vue d’un joueur (aucune triche possible)
apps/
  server/   @uno/server   Rooms, sessions, bots, minuteurs, Socket.IO, service du client compilé
  web/      @uno/web      Client React (lobby, table de jeu, animations)
e2e/                      Scénarios Playwright (solo, deux navigateurs en ligne)
```

### Flux d’une action

```
Client ──intention {type, expectedVersion}──▶ Room ──▶ Engine.applyIntent
   ▲                                                       │
   └──── game:update {vue privée, événements, échéance} ◀──┘ (un envoi par joueur)
```

- **Machine d’état** : `AWAITING_PLAY`, `AWAITING_PLAY_DRAWN`, `AWAITING_COLOR`, `AWAITING_SWAP_TARGET`, `AWAITING_CHALLENGE`, `ROUND_OVER`, `GAME_OVER`. Dans chaque phase, seul le joueur courant peut agir ; les actions hors tour (interception, Uno, contre-Uno) sont validées séparément.
- **Concurrence** : chaque intention porte la version de l’état. Si deux joueurs coupent en même temps, le premier gagne et le second reçoit `STALE_STATE`.
- **Information cachée** : `projectForPlayer` n’expose que ta main ; les adversaires ne sont qu’un nombre de cartes.
- **Déterminisme** : mélanges par PRNG à graine (mulberry32) stockée dans l’état, donc parties rejouables et tests stables.
- **Reconnexion** : jeton de session (stocké dans le navigateur). Un joueur déconnecté garde sa place 30 s, puis un bot joue pour lui jusqu’à son retour.

## Règles

Uno classique (108 cartes) plus les variantes suivantes, activables par l’hôte (`GameSettings`) :

| Règle                         | Clé                                            | Effet                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interception                  | `allowJumpIn`                                  | Jouer hors tour une carte **strictement identique** (couleur et valeur) à celle du dessus. Le jeu reprend après celui qui coupe. Les jokers ne peuvent pas couper. |
| Empilement                    | `allowStackingDrawCards`                       | +2 et +4 s’empilent entre eux ; le premier qui ne peut pas répondre ramasse tout et passe son tour.                                                                |
| +2 sur +4 de la bonne couleur | `stackingRequiresColorMatch`                   | Pour répondre à un +4 avec un +2, celui-ci doit suivre la couleur annoncée.                                                                                        |
| Contester un +4               | `allowWildDraw4Challenge`                      | Bluff démasqué : l’accusé pioche. Sinon le contestataire pioche la pénalité + 2.                                                                                   |
| 7 : échange                   | `sevenSwapHands`                               | Échanger sa main avec un adversaire.                                                                                                                               |
| 0 : rotation                  | `zeroRotateHands`                              | Toutes les mains tournent dans le sens du jeu.                                                                                                                     |
| Pose multiple                 | `allowMultiplePlay`                            | Poser plusieurs cartes de même valeur en une fois.                                                                                                                 |
| Pioche jusqu’à jouer          | `drawUntilPlayable`                            | On pioche tant qu’aucune carte jouable ne sort.                                                                                                                    |
| Jouer la carte piochée        | `allowPlayAfterDraw`                           | La carte piochée peut être posée immédiatement.                                                                                                                    |
| Oubli du Uno                  | `unoPenalty`                                   | Pénalité (2 ou 4 cartes) si un adversaire te signale avant la prochaine action.                                                                                    |
| Partie                        | `initialHandSize`, `turnTimeoutSec`, `scoring` | Taille de main, minuteur par tour, manche unique ou partie en points.                                                                                              |

Préréglages : **Classique**, **Maison** (interception + empilement), **Chaos** (tout activé).

Choix d’arbitrage documentés et testés :

- À 2 joueurs, l’Inversion agit comme un Passe ton tour.
- Un +4 retourné en début de manche est remis dans la pioche.
- Sans la règle de contestation, le +4 se joue librement.
- Une dernière carte +2/+4 fait piocher le joueur suivant avant le décompte des points.

## Tests

- **Moteur** : chaque règle a ses tests, plus une simulation de 120 parties aléatoires qui vérifie à chaque coup que les 108 cartes sont conservées et que l’état reste cohérent.
- **Bots** : 75 parties complètes bot contre bot à travers le vrai moteur, sans aucune décision refusée.
- **Serveur** : cycle de vie des rooms avec horloge simulée (bots, minuteurs, reconnexion, pilote automatique), tests Socket.IO réels, service des fichiers statiques.
- **Client** : store, client réseau, composants et interactions de jeu (Testing Library).
- **Bout en bout** : partie solo avec rechargement de page, et partie en ligne à deux navigateurs (Playwright, desktop et mobile).
