import { roleLabel, statusMeta, STATUSES } from './constants.js';

export function serializeUser(row) {
  if (!row) return null;
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
  const initials = `${row.first_name?.[0] || ''}${row.last_name?.[0] || ''}`.toUpperCase();
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName,
    initials: initials || '?',
    email: row.email,
    login: row.login || row.email,
    role: row.role,
    roleLabel: roleLabel(row.role),
    studentId: row.student_id || null,
    isActive: Boolean(row.is_active === undefined ? true : row.is_active),
    createdAt: row.created_at,
  };
}

export function serializeStudent(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || null,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    initials: `${row.first_name?.[0] || ''}${row.last_name?.[0] || ''}`.toUpperCase(),
    className: row.class_name || null,
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    stats: extra.stats || undefined,
    today: extra.today || undefined,
  };
}

export function serializeDuty(row, extra = {}) {
  if (!row) return null;
  const meta = statusMeta(row.status);
  return {
    id: row.id,
    date: row.duty_date,
    studentId: row.student_id,
    studentName: row.student_name || null,
    studentInitials: row.student_initials || null,
    status: row.status,
    statusLabel: meta.label,
    statusColor: meta.color,
    comment: row.comment || null,
    assignedBy: row.assigned_by || null,
    assignedByName: row.assigned_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replacedById: extra.replacedById || null,
    replacedByName: extra.replacedByName || null,
    replacementReason: extra.replacementReason || null,
    records: extra.records || undefined,
  };
}

export function serializeAudit(row) {
  let before = null;
  let after = null;
  try {
    before = row.before_json ? JSON.parse(row.before_json) : null;
  } catch {
    before = null;
  }
  try {
    after = row.after_json ? JSON.parse(row.after_json) : null;
  } catch {
    after = null;
  }
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name || 'Система',
    actorRole: row.actor_role,
    actorRoleLabel: row.actor_role ? roleLabel(row.actor_role) : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    before,
    after,
    comment: row.comment,
    createdAt: row.created_at,
    date: row.created_at ? row.created_at.slice(0, 10) : null,
    time: row.created_at ? row.created_at.slice(11, 16) : null,
  };
}

export const DONE_STATUSES = [STATUSES.SERVED];
export const FAILED_STATUSES = [STATUSES.NOT_SERVED, STATUSES.ABSENT];