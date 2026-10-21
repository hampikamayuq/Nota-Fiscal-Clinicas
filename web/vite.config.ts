import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    // A API fica no mesmo "site" para o cookie de sessão valer sem CORS.
    proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:3100', changeOrigin: false } },
  },
});
