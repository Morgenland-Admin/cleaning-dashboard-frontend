import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted: no request to Google Fonts (privacy).
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@/index.css';
import { App } from '@/App';
import { reloadForNewBuild } from '@/lib/chunk-reload';
import { trackScrollActivity } from '@/lib/scroll-activity';

trackScrollActivity();

// A deploy deletes the old hashed chunks; a tab on the old build reloads once to get the new one.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
