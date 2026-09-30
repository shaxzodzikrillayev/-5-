export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Требуется авторизация') => new HttpError(401, message);
export const forbidden = (message = 'Недостаточно прав') => new HttpError(403, message);
export const notFound = (message = 'Не найдено') => new HttpError(404, message);
export const conflict = (message = 'Конфликт данных') => new HttpError(409, message);

export function str(value, field, { min = 1, max = 200, required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`Поле «${field}» обязательно`);
    return null;
  }
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    if (required) throw badRequest(`Поле «${field}» обязательно`);
    return null;
  }
  if (trimmed.length < min) throw badRequest(`Поле «${field}»: минимум ${min} символов`);
  if (trimmed.length > max) throw badRequest(`Поле «${field}»: максимум ${max} символов`);
  return trimmed;
}

export function email(value, field = 'Email') {
  const value2 = str(value, field, { max: 160 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value2)) {
    throw badRequest(`${field}: некорректный адрес`);
  }
  return value2.toLowerCase();
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw badRequest(`Поле «${field}»: допустимые значения: ${allowed.join(', ')}`);
  }
  return value;
}