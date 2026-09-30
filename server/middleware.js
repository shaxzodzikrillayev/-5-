import { config } from './config.js';
import { loadSession, touchSession, isCsrfValid, isManager } from './lib/auth.js';
import { unauthorized, forbidden, HttpError } from './lib/errors.js';
import { ROLES } from './lib/constants.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Достаёт пользователя из httpOnly-cookie. Ничего не требует: GET /api/auth/me должен отвечать 200 с user:null. */
export async function attachUser(req, res, next) {
  try {
    const sessionId = req.cookies?.[config.cookieName];
    const session = await loadSession(sessionId);
    if (session) {
      req.session = session;
      req.user = session.user;
      req.lastSeenAt = Date.now();
      if (!req.lastSeenSent) {
        touchSession(session.id).catch(() => {});
        req.lastSeenSent = true;
      }
      res.setHeader('Vary', 'Cookie');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireManager(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (!isManager(req.user.role)) return next(forbidden('Раздел доступен только старосте и куратору'));
  next();
}

export function requireKurator(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== ROLES.KURATOR) return next(forbidden('Действие доступно только куратору'));
  next();
}

/** CSRF-защита изменяющих запросов. */
export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path === '/auth/login' || req.path === '/auth/register') {
    // Для этих маршрутов проверка выполняется по Origin/Referer (см. sameOriginGuard).
    return next();
  }
  if (!req.session) return next(unauthorized());
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!isCsrfValid(req.session, token)) {
    return next(new HttpError(403, 'Недействительный CSRF-токен. Обновите страницу.'));
  }
  next();
}

/** Список origin, которым сервер доверяет: сам домен, прокси-заголовки и CORS_ORIGINS. */
function allowedOrigins(req) {
  const list = new Set(config.corsOrigins);
  for (const header of ['host', 'x-forwarded-host']) {
    const value = req.get(header);
    if (value) value.split(',').forEach((h) => list.add(h.trim()));
  }
  return list;
}

function isLocalHost(host) {
  try {
    const { hostname } = new URL(`http://${host}`);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Проверка Origin для регистрации/логина (защита от cross-site login CSRF).
 *
 * Учитывается reverse-proxy (Vite dev-сервер, Vercel): Origin сравнивается и с Host,
 * и с X-Forwarded-Host. В dev-режиме дополнительно разрешены локальные адреса,
 * чтобы фронтенд на :5173 мог ходить в API на :5000.
 */
export function sameOriginGuard(req, res, next) {
  const origin = req.get('origin') || (() => {
    const referer = req.get('referer');
    return referer ? safeOrigin(referer) : null;
  })();

  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return next(forbidden('Некорректный Origin'));
  }

  if (allowedOrigins(req).has(originHost)) return next();
  if (!config.isProd && isLocalHost(originHost) && isLocalHost(req.get('host') || '')) return next();

  return next(forbidden('Запрос с чужого домена отклонён'));
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Единый обработчик ошибок. */
export function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  const status = error.status && Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.originalUrl} -> ${status}`, error);
  }
  const body = {
    error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message || 'Ошибка запроса',
    code: error.code || undefined,
  };
  if (error.details) body.details = error.details;
  if (status >= 500 && process.env.NODE_ENV !== 'production') body.debug = error.message;
  res.status(status).json(body);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.path} не найден` });
}