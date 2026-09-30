import { db } from '../db/index.js';
import { newId } from '../db/migrate.js';

export function fullName(person) {
  if (!person) return 'Неизвестно';
  const parts = [person.firstName || person.first_name, person.lastName || person.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : person.email || person.name || 'Без имени';
}

export function shortName(person) {
  if (!person) return '—';
  const last = person.lastName || person.last_name || '';
  const first = person.firstName || person.first_name || '';
  if (!last) return first || '—';
  return `${last} ${String(first).slice(0, 1)}.`;
}

/**
 * Пишет запись в audit_logs. Не бросает исключений: сбой аудита не должен ломать операцию.
 */
export async function logAudit(actor, action, payload = {}) {
  try {
    await db.run(
      `INSERT INTO audit_logs
         (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, before_json, after_json, comment, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        actor?.user?.id || actor?.id || null,
        fullName(actor?.user || actor),
        actor?.user?.role || actor?.role || null,
        action,
        payload.entityType || null,
        payload.entityId || null,
        payload.summary || null,
        payload.before ? JSON.stringify(payload.before) : null,
        payload.after ? JSON.stringify(payload.after) : null,
        payload.comment || null,
        payload.ip || null,
        new Date().toISOString(),
      ],
    );
  } catch (error) {
    console.error('[audit] не удалось записать событие:', error.message);
  }
}