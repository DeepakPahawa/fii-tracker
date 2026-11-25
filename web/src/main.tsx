import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import EtfPage from './etf/EtfPage';

/** /etf (dev server, or a host with SPA fallback) and #/etf (static hosting such as GitHub Pages) both open the ETF tracker. */
const isEtfRoute = () => /\/etf\/?$/.test(window.location.pathname) || /^#\/etf\/?$/.test(window.location.hash);

function Root() {
  const [etf, setEtf] = useState(isEtfRoute);
  useEffect(() => {
    const on = () => setEtf(isEtfRoute());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return etf ? <EtfPage /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
