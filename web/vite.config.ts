import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' so the build works from any sub-path (e.g. GitHub Pages /fii-tracker/).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
