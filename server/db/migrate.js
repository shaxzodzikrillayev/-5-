import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from './index.js';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, 'schema.sql');

export const newId = () => crypto.randomUUID();

/**
 * Детерминированный UUID (v5-подобный) из строки.
 *
 * Нужен для демо-данных: каждый «холодный старт» serverless-контейнера создаёт
 * свою БД, и если id отличаются, то подписанная cookie сессии не найдёт
 * пользователя в другом контейнере. С одинаковыми id данные идентичны везде.
 */
export function stableId(key) {
  const hash = crypto.createHash('sha1').update(String(key)).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

export async function runMigrations({ log = false } = {}) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(sql);
  const driverName = await db.name();
  if (log) console.log(`[db] миграции применены (драйвер: ${driverName})`);
  return driverName;
}

export function newSessionId() {
  return `${crypto.randomBytes(32).toString('hex')}`;
}

export function newCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export async function getSetting(key, fallback = null) {
  const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await db.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value, nowIso()],
  );
}

export async function dropAll() {
  const tables = ['audit_logs', 'replacements', 'duty_records', 'duties', 'sessions', 'students', 'users', 'app_settings'];
  for (const table of tables) {
    await db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const force = process.argv.includes('--force');
  if (force) {
    await dropAll();
    console.log('[db] таблицы удалены');
  }
  const driverName = await runMigrations({ log: true });
  if (config.databaseUrl) {
    console.log('[db] подключение: PostgreSQL');
  } else {
    console.log(`[db] подключение: SQLite -> ${config.sqliteFile} (${driverName})`);
  }
  await db.close();
}