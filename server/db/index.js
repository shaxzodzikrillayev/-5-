import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ensureDataDir } from '../config.js';

/**
 * Слой доступа к БД.
 *
 * Поддерживаются два драйвера с ОДНИМ И ТЕМ ЖЕ набором SQL-команд:
 *  - SQLite  — встроенный модуль node:sqlite (без нативных зависимостей), режим по умолчанию;
 *  - PostgreSQL — если задан DATABASE_URL (для Vercel и внешних хостингов).
 *
 * Чтобы SQL оставался переносимым:
 *  - все идентификаторы (id) генерируются в приложении (UUID);
 *  - все даты/время хранятся как ISO-8601 строки;
 *  - булевы значения хранятся как INTEGER 0/1;
 *  - параметры передаются позиционно через `?` (для Postgres конвертируются в $1, $2, ...).
 */

const HAS_RETURNING = true;

function normalize(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (value === true) return 1;
    if (value === false) return 0;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  });
}

/** Конвертирует `?` в `$1..$n`, игнорируя содержимое строковых литералов. */
function toDollarPlaceholders(sql) {
  let out = '';
  let index = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '?') {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function createSqliteDriver() {
  ensureDataDir();
  fs.mkdirSync(path.dirname(config.sqliteFile), { recursive: true });
  const database = new DatabaseSync(config.sqliteFile);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');

  let txDepth = 0;

  return {
    name: 'sqlite',
    async get(sql, params = []) {
      const stmt = database.prepare(sql);
      return stmt.get(...normalize(params)) ?? null;
    },
    async all(sql, params = []) {
      const stmt = database.prepare(sql);
      return stmt.all(...normalize(params));
    },
    async run(sql, params = []) {
      const values = normalize(params);
      if (HAS_RETURNING && /returning/i.test(sql)) {
        const row = database.prepare(sql).get(...values) ?? null;
        return { changes: row ? 1 : 0, row };
      }
      const result = database.prepare(sql).run(...values);
      return { changes: Number(result.changes || 0), row: null };
    },
    async exec(sql) {
      database.exec(sql);
    },
    async transaction(fn) {
      const isOuter = txDepth === 0;
      if (isOuter) database.exec('BEGIN IMMEDIATE');
      txDepth += 1;
      try {
        const result = await fn();
        txDepth -= 1;
        if (isOuter) database.exec('COMMIT');
        return result;
      } catch (error) {
        txDepth -= 1;
        if (isOuter) {
          try {
            database.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
        }
        throw error;
      }
    },
    async close() {
      database.close();
    },
  };
}

async function createPostgresDriver() {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    ssl: /sslmode=require|sslmode=verify-full/.test(config.databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const runQuery = async (sql, params) => {
    const res = await pool.query(toDollarPlaceholders(sql), normalize(params));
    return res;
  };

  let txClient = null;

  const execOn = async (sql, params, useTx) => {
    if (txClient && !useTx) return txClient.query(toDollarPlaceholders(sql), normalize(params));
    return runQuery(sql, params);
  };

  return {
    name: 'postgres',
    async get(sql, params = []) {
      const res = await execOn(sql, params, false);
      return res.rows[0] ?? null;
    },
    async all(sql, params = []) {
      const res = await execOn(sql, params, false);
      return res.rows;
    },
    async run(sql, params = []) {
      const res = await execOn(sql, params, false);
      return { changes: res.rowCount ?? 0, row: res.rows[0] ?? null };
    },
    async exec(sql) {
      await runQuery(sql, []);
    },
    async transaction(fn) {
      if (txClient) return fn();
      const client = await pool.connect();
      txClient = client;
      try {
        await client.query('BEGIN');
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw error;
      } finally {
        txClient = null;
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

let driverPromise = null;

export async function getDriver() {
  if (!driverPromise) {
    driverPromise = config.databaseUrl ? createPostgresDriver() : Promise.resolve(createSqliteDriver());
  }
  return driverPromise;
}

async function driver() {
  return getDriver();
}

export const db = {
  async get(sql, params) {
    return (await driver()).get(sql, params);
  },
  async all(sql, params) {
    return (await driver()).all(sql, params);
  },
  async run(sql, params) {
    return (await driver()).run(sql, params);
  },
  async exec(sql) {
    return (await driver()).exec(sql);
  },
  async transaction(fn) {
    return (await driver()).transaction(fn);
  },
  async name() {
    return (await driver()).name;
  },
  async close() {
    const d = await driver();
    await d.close();
  },
};