import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const uiPort = Number(process.env.VITE_PORT || 5173);
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: true,
    port: uiPort,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
