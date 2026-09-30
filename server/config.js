import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');

// Минимальный загрузчик .env (без зависимостей). Переменные из process.env имеют приоритет.
function loadEnvFile() {
  const candidates = [
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '.env.local'),
    path.join(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
loadEnvFile();

const isProd = process.env.NODE_ENV === 'production';

let sessionSecret = process.env.SESSION_SECRET || '';
if (!sessionSecret) {
  // Раньше здесь был process.exit(1): на Vercel без переменной окружения это давало
  // 500 на каждый запрос. Теперь приложение поднимается, но предупреждает loudly.
  sessionSecret = crypto.randomBytes(48).toString('hex');
  console.warn(
    isProd
      ? '[config] ВНИМАНИЕ: SESSION_SECRET не задан. Сессии сбросятся при смене контейнера. Задайте SESSION_SECRET в переменных окружения.'
      : '[config] SESSION_SECRET не задан — используется временный секрет (сессии сбросятся при перезапуске).',
  );
}

const dataDir = path.resolve(ROOT_DIR, 'data');
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

// В serverless-окружении файловая система доступна только для чтения (кроме каталога
// temp), поэтому SQLite обязан лежать во временной папке — иначе ЛЮБОЙ запрос к БД
// падает с «unable to open database file».
const tmpDir = path.resolve(os.tmpdir());
const serverlessSqliteFile = path.join(tmpDir, 'dezhurstvo.db');
const defaultSqliteFile = isServerless ? serverlessSqliteFile : './data/dezhurstvo.db';

function resolveSqliteFile() {
  const resolved = path.resolve(ROOT_DIR, process.env.DATABASE_FILE || defaultSqliteFile);
  if (isServerless && !process.env.DATABASE_URL && !resolved.startsWith(tmpDir)) {
    console.warn(
      `[config] файловая система serverless доступна только для чтения: ${resolved} → используется ${serverlessSqliteFile}`,
    );
    return serverlessSqliteFile;
  }
  return resolved;
}

const sqliteFile = resolveSqliteFile();

export const config = {
  isProd,
  isServerless,
  port: Number(process.env.PORT || 5000),
  sessionSecret,
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  sqliteFile,
  dataDir,
  /**
   * Заполнять ли БД демо-данными при пустой базе.
   * По умолчанию — только в serverless без PostgreSQL, чтобы опубликованный
   * проект сразу выглядел рабочим. Локально остаётся пустая система.
   */
  seedOnEmpty:
    String(
      process.env.SEED_ON_EMPTY ??
        (process.env.VERCEL && !process.env.DATABASE_URL ? 'true' : 'false'),
    ) !== 'false',
  timezone: process.env.APP_TIMEZONE || 'Asia/Tashkent',
  codes: {
    starosta: (process.env.CODE_STAROSTA || 'STAROSTA').trim(),
    kurator: (process.env.CODE_KURATOR || 'KURATOR').trim(),
  },
  allowFirstKuratorBootstrap: String(process.env.ALLOW_FIRST_KURATOR_BOOTSTRAP ?? 'true') !== 'false',
  cookieName: 'dz_session',
  csrfCookieName: 'dz_csrf',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
  secureCookies: isProd,
  /** Дополнительные доверенные origin через CORS_ORIGINS (без схемы). */
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^https?:\/\//, '').replace(/\/$/, '')),
};

export function ensureDataDir() {
  // В serverless-режиме каталог проекта может быть read-only — это не ошибка.
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  } catch (error) {
    if (!config.isServerless) throw error;
  }
}

export { isProd };