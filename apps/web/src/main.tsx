import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createGameClient } from './net/client';
import { AppProvider } from './net/context';
import { createSocket } from './net/socket';
import { createAppStore } from './store/store';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles/global.css';

const store = createAppStore();
const client = createGameClient(createSocket(), store);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <AppProvider store={store} client={client}>
      <App />
    </AppProvider>
  </StrictMode>,
);
