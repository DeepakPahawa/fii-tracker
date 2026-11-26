import { defineConfig, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { etfHandler } from './etf-proxy/nseEtf.mjs';
import { historyHandler } from './etf-proxy/history.mjs';

const mount = (m: Connect.Server) => {
  m.use('/api/etf/quotes', (req, res) => void etfHandler({ url: (req as { url?: string }).url }, res));
  m.use('/api/etf/history', (req, res) => void historyHandler({ url: (req as { url?: string }).url }, res));
};

// base './' so the build works from any sub-path (e.g. GitHub Pages /fii-tracker/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      // Serves real NSE ETF quotes to the /etf page in `dev` and `preview` (see etf-proxy/README.md).
      name: 'etf-nse-proxy',
      configureServer(server) {
        mount(server.middlewares);
      },
      configurePreviewServer(server) {
        mount(server.middlewares);
      },
    },
  ],
});
