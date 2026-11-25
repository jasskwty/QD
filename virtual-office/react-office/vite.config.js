import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, calls to /n8n/* are proxied to your n8n instance so the browser never hits CORS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.N8N_ORIGIN || 'https://q8kwt.app.n8n.cloud';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/n8n': { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/n8n/, '') }
      }
    }
  };
});
