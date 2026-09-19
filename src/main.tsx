import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { SplashScreen } from './components/SplashScreen';
import './index.css';
import { armOnFirstGesture } from './utils/alertSound';

/*
 * Registering the service worker is what makes the installed app open with
 * no network. It is deliberately deferred until after load: registration
 * competes with the first paint for the same main thread, and a flood map
 * that renders half a second later is a worse trade than a cache that is
 * ready half a second later.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      // Registration fails on an insecure origin or with storage blocked.
      // The app still works; it just will not work offline.
      console.warn('[pwa] service worker registration failed:', error);
    });
  });
}

// Browsers refuse to make a sound before the user has interacted with the
// page, so the chat's alert tone is unlocked on the first touch anywhere.
armOnFirstGesture();

function Root() {
  const [booting, setBooting] = useState(true);
  return (
    <>
      {booting && <SplashScreen onDone={() => setBooting(false)} />}
      <App />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
