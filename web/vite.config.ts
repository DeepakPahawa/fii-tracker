import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' so the build works from any sub-path (e.g. GitHub Pages /fii-tracker/).
// ETF_PROXY_TARGET (env or .env): dev-only proxy for the /etf page's live feed (see etf-proxy/README.md).
export default defineConfig(({ mode }) => {
  const etfProxy = loadEnv(mode, '.', '').ETF_PROXY_TARGET;
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    server: etfProxy ? { proxy: { '/api/etf': etfProxy } } : undefined,
  };
});
