import { ReportButton } from './components/ReportButton';
import { ConnectionBanner, Toasts } from './components/Toasts';
import { useApp } from './net/context';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { RoomLobby } from './screens/RoomLobby';

export function App() {
  const session = useApp((s) => s.session);
  const lobby = useApp((s) => s.lobby);
  const game = useApp((s) => s.game);
  const resuming = useApp((s) => s.resuming);

  let screen;
  if (session && lobby && lobby.inGame && game) screen = <Game update={game} />;
  else if (session && lobby) screen = <RoomLobby lobby={lobby} />;
  else if (session && resuming) screen = null;
  else screen = <Home />;

  const phase = session && lobby ? (lobby.inGame ? 'GAME' : 'LOBBY') : 'HOME';
  return (
    <>
      {screen}
      <ReportButton game="plus4" context={{ room: session?.code, phase }} />
      <Toasts />
      <ConnectionBanner />
    </>
  );
}
