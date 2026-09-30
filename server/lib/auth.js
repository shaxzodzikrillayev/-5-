import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { ROLES } from './constants.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** scrypt-хеш пароля в формате: scrypt$N$r$p$salt$hash */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  try {
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function passwordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 6) problems.push('Минимум 6 символов');
  if (typeof password === 'string' && password.length > 200) problems.push('Слишком длинный пароль');
  return problems;
}

/**
 * Формат cookie сессии: `v1.<userId>.<csrf>.<expMs>.<hmac>`.
 *
 * Значение подписано HMAC-ключом SESSION_SECRET, поэтому сессия остаётся валидной
 * даже если запрос попал в другой контейнер serverless-окружения (у каждого
 * своя БД в /tmp). Строка в таблице sessions хранится best-effort: она нужна
 * для аудита и для отзыва всех сессий пользователя.
 */
function signSessionPayload(userId, csrfToken, expiresAtMs) {
  const payload = `v1.${userId}.${csrfToken}.${expiresAtMs}`;
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionSignature(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const [version, userId, csrfToken, expRaw, signature] = parts;
  const payload = `${version}.${userId}.${csrfToken}.${expRaw}`;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return null;
  return { userId, csrfToken, expiresAtMs, sessionId: `${userId}.${csrfToken}` };
}

export async function createSession(userId, { userAgent = null, ip = null } = {}) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
  const token = signSessionPayload(userId, csrfToken, expiresAt.getTime());
  try {
    await db.run(
      `INSERT INTO sessions (id, user_id, csrf_token, user_agent, ip, created_at, last_seen, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${userId}.${csrfToken}`,
        userId,
        csrfToken,
        userAgent,
        ip,
        now.toISOString(),
        now.toISOString(),
        expiresAt.toISOString(),
      ],
    );
  } catch (error) {
    // Таблица сессий недоступна — авторизация всё равно работает по cookie.
    console.error('[auth] не удалось сохранить сессию в БД:', error.message);
  }
  return { id: token, csrfToken, expiresAt };
}

export async function destroySession(sessionId) {
  if (!sessionId) return;
  // Принимаем и «сырой» id из БД, и подписанный токен из cookie.
  const key = String(sessionId).includes('.') ? String(sessionId).split('.').slice(0, 2).join('.') : sessionId;
  await db.run('DELETE FROM sessions WHERE id = ?', [key]).catch(() => {});
}

export async function destroyAllUserSessions(userId) {
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]).catch(() => {});
}

export async function loadSession(sessionId) {
  if (!sessionId) return null;
  const verified = verifySessionSignature(sessionId);
  if (!verified) return null;

  const row = await db.get(
    `SELECT id           AS id,
            first_name   AS first_name,
            last_name    AS last_name,
            email        AS email,
            login        AS login,
            role         AS role,
            student_id   AS student_id,
            is_active    AS is_active
       FROM users
      WHERE id = ?`,
    [verified.userId],
  );
  if (!row || !row.is_active) {
    await destroySession(sessionId);
    return null;
  }

  return {
    sessionId,
    csrfToken: verified.csrfToken,
    user: {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      login: row.login,
      role: row.role,
      studentId: row.student_id,
    },
  };
}

export async function touchSession(sessionId) {
  const key = String(sessionId).includes('.') ? String(sessionId).split('.').slice(0, 2).join('.') : sessionId;
  await db
    .run('UPDATE sessions SET last_seen = ? WHERE id = ?', [new Date().toISOString(), key])
    .catch(() => {});
}

/** Удаляет протухшие сессии (вызывается при старте и раз в час). */
export async function purgeExpiredSessions() {
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]).catch(() => {});
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.secureCookies,
  path: '/',
};

export function setSessionCookie(res, sessionId, expiresAt) {
  res.cookie(config.cookieName, sessionId, { ...COOKIE_OPTIONS, expires: expiresAt });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { ...COOKIE_OPTIONS });
}

/**
 * CSRF: double-submit. Токен хранится в сессии в БД, клиент получает его
 * из /api/auth/csrf и обязан отправлять в заголовке X-CSRF-Token.
 */
export function isCsrfValid(session, providedToken) {
  if (!session) return false;
  if (!providedToken) return false;
  const a = Buffer.from(String(session.csrfToken));
  const b = Buffer.from(String(providedToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isManager(role) {
  return role === ROLES.STAROSTA || role === ROLES.KURATOR;
}

export function isKurator(role) {
  return role === ROLES.KURATOR;
}