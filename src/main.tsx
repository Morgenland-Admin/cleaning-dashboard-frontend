import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted: no request to Google Fonts (privacy).
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@/index.css';
import { App } from '@/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
