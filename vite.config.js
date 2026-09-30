import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        // Сохраняем Origin клиента, но добавляем исходный Host — сервер сверяет Origin с Host/X-Forwarded-Host.
        headers: {
          'x-forwarded-host': 'localhost:5173',
        },
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            if (!proxyReq.getHeader('origin')) return;
            proxyReq.setHeader('x-forwarded-host', proxyReq.getHeader('host') || 'localhost:5173');
          });
          // Без этого обработчика Vite отдаёт пустой 500, когда API не запущен.
          proxy.on('error', (err, _req, res) => {
            const message = `API недоступен (${err.code || err.message}). Запустите сервер: npm run dev:server`;
            console.error(`[proxy] ${message}`);
            if (!res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: message }));
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
  },
});