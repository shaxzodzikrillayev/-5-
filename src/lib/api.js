/**
 * Клиент API.
 *
 * - База: /api (тот же домен). Переопределяется VITE_API_URL для отдельного бэкенда.
 * - Сессия — в httpOnly cookie (браузер сам присылает её), пароль/токен в localStorage не хранятся.
 * - CSRF-токен хранится в памяти и подставляется в заголовок X-CSRF-Token.
 */

const RAW_BASE = (import.meta.env.VITE_API_URL || '').trim();
export const API_BASE = RAW_BASE ? `${RAW_BASE.replace(/\/+$/, '')}/api` : '/api';

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export function getCsrfToken() {
  return csrfToken;
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload || {};
  }
}

async function request(method, path, body, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRF-Token'] = csrfToken;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Нет связи с сервером. Проверьте подключение к интернету.', 0, null);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      payload = { text: await response.text() };
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.error
      || (response.status === 404 ? 'Запрашиваемый ресурс не найден' : null)
      || (response.status === 401 ? 'Требуется авторизация' : null)
      || (response.status === 403 ? 'Недостаточно прав' : null)
      || `Ошибка запроса (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body ?? {}, options),
  patch: (path, body, options) => request('PATCH', path, body ?? {}, options),
  del: (path, body, options) => request('DELETE', path, body ?? {}, options),
  base: API_BASE,
};