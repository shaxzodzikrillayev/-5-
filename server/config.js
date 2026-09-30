import fs from 'node:fs';
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
  if (isProd) {
    console.error(
      '[config] SESSION_SECRET обязателен в production. Сгенерируйте: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[config] SESSION_SECRET не задан — используется временный секрет (сессии сбросятся при перезапуске).');
}

const dataDir = path.resolve(ROOT_DIR, 'data');
const sqliteFile = path.resolve(ROOT_DIR, process.env.DATABASE_FILE || './data/dezhurstvo.db');

export const config = {
  isProd,
  port: Number(process.env.PORT || 5000),
  sessionSecret,
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  sqliteFile,
  dataDir,
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
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export { isProd };