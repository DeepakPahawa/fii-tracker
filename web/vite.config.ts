import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { etfHandler } from './etf-proxy/nseEtf.mjs';

// base './' so the build works from any sub-path (e.g. GitHub Pages /fii-tracker/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      // Serves real NSE ETF quotes to the /etf page during dev (see etf-proxy/README.md).
      name: 'etf-nse-proxy',
      configureServer(server) {
        server.middlewares.use('/api/etf/quotes', (req, res) => void etfHandler({ url: (req as { url?: string }).url }, res));
      },
    },
  ],
});
