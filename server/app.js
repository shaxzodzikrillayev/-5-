import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config, ROOT_DIR } from './config.js';
import { runMigrations } from './db/migrate.js';
import { db } from './db/index.js';
import { purgeExpiredSessions } from './lib/auth.js';
import {
  attachUser,
  csrfGuard,
  sameOriginGuard,
  errorHandler,
  notFoundHandler,
} from './middleware.js';

import authRoutes from './routes/auth.js';
import studentRoutes from './routes/students.js';
import dutyRoutes from './routes/duties.js';
import replacementRoutes from './routes/replacements.js';
import statisticsRoutes from './routes/statistics.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/auditLogs.js';
import settingsRoutes from './routes/settings.js';
import userRoutes from './routes/users.js';

/**
 * В serverless каждый «холодный старт» — это новый контейнер, поэтому схема
 * (и, если разрешено, демо-данные) должны подниматься автоматически.
 */
async function seedIfEmpty() {
  if (!config.seedOnEmpty) return;
  try {
    const row = await db.get('SELECT COUNT(*) AS c FROM users');
    if (Number(row?.c || 0) > 0) return;
    const { seed } = await import('./db/seed.js');
    await seed({ quiet: true });
    console.log('[db] база была пуста — загружены демо-данные');
  } catch (error) {
    // Демо-данные не критичны: лучше подняться с пустой БД, чем падать.
    console.error('[db] не удалось загрузить демо-данные:', error.message);
  }
}

export async function createApp() {
  await runMigrations();
  await purgeExpiredSessions().catch(() => {});
  await seedIfEmpty();
  setInterval(() => {
    purgeExpiredSessions().catch(() => {});
  }, 60 * 60 * 1000).unref?.();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());

  // CORS: разрешаем явные origins (для отдельного фронтенда), по умолчанию — только same-origin.
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      const sameHost = (() => {
        try {
          return new URL(origin).host === req.get('host');
        } catch {
          return false;
        }
      })();
      if (sameHost || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
    return next();
  });

  app.use(attachUser);

  // --- API ---
  const api = express.Router();
  api.use('/auth', sameOriginGuard, authRoutes);
  api.use(csrfGuard);
  api.use('/students', studentRoutes);
  api.use('/duties', dutyRoutes);
  api.use('/replacements', replacementRoutes);
  api.use('/statistics', statisticsRoutes);
  api.use('/reports', reportRoutes);
  api.use('/audit-logs', auditRoutes);
  api.use('/settings', settingsRoutes);
  api.use('/users', userRoutes);

  api.get('/health', (req, res) => {
    res.json({ ok: true, service: 'dezhurstvo-api', time: new Date().toISOString() });
  });

  app.use('/api', api);

  app.use('/api', notFoundHandler);

  // --- Frontend (production) ---
  const clientDir = path.join(ROOT_DIR, 'dist', 'client');
  if (fs.existsSync(clientDir)) {
    app.use(
      express.static(clientDir, {
        index: false,
        maxAge: config.isProd ? '1h' : 0,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get(/.*/, (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.type('html').send(
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Сервер работает</title>
        <style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0}
        div{max-width:520px;padding:32px;background:#1e293b;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
        code{background:#0f172a;padding:3px 7px;border-radius:6px}</style></head>
        <body><div><h1>API работает</h1>
        <p>Фронтенд не собран. Выполните <code>npm run build</code> или запустите dev-режим командой <code>npm run dev</code>.</p>
        <p>Проверка: <code>GET /api/health</code></p></div></body></html>`,
      );
    });
  }

  app.use(errorHandler);
  return app;
}

export default createApp;