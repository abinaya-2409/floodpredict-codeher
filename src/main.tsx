import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { SplashScreen } from './components/SplashScreen';
import './index.css';

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
