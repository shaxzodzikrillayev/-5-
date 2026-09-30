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

export async function createSession(userId, { userAgent = null, ip = null } = {}) {
  const id = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
  await db.run(
    `INSERT INTO sessions (id, user_id, csrf_token, user_agent, ip, created_at, last_seen, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, csrfToken, userAgent, ip, now.toISOString(), now.toISOString(), expiresAt.toISOString()],
  );
  return { id, csrfToken, expiresAt };
}

export async function destroySession(sessionId) {
  if (!sessionId) return;
  await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

export async function destroyAllUserSessions(userId) {
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export async function loadSession(sessionId) {
  if (!sessionId) return null;
  const row = await db.get(
    `SELECT s.id           AS session_id,
            s.csrf_token   AS csrf_token,
            s.expires_at   AS expires_at,
            u.id           AS id,
            u.first_name   AS first_name,
            u.last_name    AS last_name,
            u.email        AS email,
            u.login        AS login,
            u.role         AS role,
            u.student_id   AS student_id,
            u.is_active    AS is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    [sessionId],
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(row.id);
    return null;
  }
  if (!row.is_active) {
    await destroySession(row.id);
    return null;
  }
  return {
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
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
  await db.run('UPDATE sessions SET last_seen = ? WHERE id = ?', [new Date().toISOString(), sessionId]);
}

/** Удаляет протухшие сессии (вызывается при старте и раз в час). */
export async function purgeExpiredSessions() {
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]);
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