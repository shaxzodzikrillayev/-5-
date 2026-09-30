import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { config, ROOT_DIR } from './config.js';
import { db } from './db/index.js';

const app = await createApp();
const driver = await db.name();
const hasFrontend = fs.existsSync(path.join(ROOT_DIR, 'dist', 'client', 'index.html'));

const server = app.listen(config.port, () => {
  console.log('');
  console.log('  Система управления дежурством класса');
  console.log(`  Режим:        ${config.isProd ? 'production' : 'development'}`);
  console.log(`  API:          http://localhost:${config.port}/api`);
  console.log(`  БД:           ${config.databaseUrl ? 'PostgreSQL' : `SQLite (${driver})`}`);
  console.log(`  Часовой пояс: ${config.timezone}`);
  console.log(hasFrontend ? `  Сайт:         http://localhost:${config.port}/` : '  Frontend:     npm run dev  →  http://localhost:5173');
  console.log('');
});

async function shutdown(signal) {
  console.log(`\n[server] получен ${signal}, останавливаюсь...`);
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});