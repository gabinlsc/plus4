import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createGameClient } from './net/client';
import { AppProvider } from './net/context';
import { createSocket } from './net/socket';
import { createAppStore } from './store/store';
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
