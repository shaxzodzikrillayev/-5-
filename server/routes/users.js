import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { nowIso } from '../db/migrate.js';
import { serializeUser } from '../lib/serialize.js';
import { requireAuth, requireManager, requireKurator } from '../middleware.js';
import { logAudit, fullName } from '../lib/audit.js';
import { notFound, badRequest, forbidden } from '../lib/errors.js';
import { ROLES, ROLE_LABELS } from '../lib/constants.js';
import { config } from '../config.js';

const router = express.Router();
router.use(requireAuth);

/** Сравнение строк за постоянное время — чтобы по коду нельзя было подбирать по одному символу. */
function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** GET /api/users — список учётных записей (староста / куратор). */
router.get('/', requireManager, async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.role) {
      where = 'WHERE role = ?';
      params.push(String(req.query.role));
    }
    if (req.query.includeInactive !== 'true') where = where ? `${where} AND is_active = 1` : 'WHERE is_active = 1';
    const rows = await db.all(`SELECT * FROM users ${where} ORDER BY role ASC, last_name ASC`, params);
    res.json({ users: rows.map(serializeUser), total: rows.length });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/users/:id/role — смена роли (только куратор). */
router.patch('/:id/role', requireKurator, async (req, res, next) => {
  try {
    const role = String(req.body?.role || '');
    if (![ROLES.STUDENT, ROLES.STAROSTA, ROLES.KURATOR].includes(role)) throw badRequest('Некорректная роль');
    const user = await db.get('SELECT * FROM users WHERE id = ?', [String(req.params.id)]);
    if (!user) throw notFound('Пользователь не найден');
    if (user.id === req.user.id) throw badRequest('Нельзя изменить собственную роль');
    if (role === user.role) throw badRequest('Роль уже такая же');

    if (role === ROLES.KURATOR) {
      const hasKurator = await db.get('SELECT id FROM users WHERE role = ? AND id <> ? LIMIT 1', [ROLES.KURATOR, user.id]);
      if (!hasKurator) throw badRequest('В системе должен остаться хотя бы один куратор');
    }

    await db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, nowIso(), user.id]);
    await logAudit(req, 'user.role_changed', {
      entityType: 'user',
      entityId: user.id,
      summary: `${fullName(req.user)} изменил роль пользователя ${user.first_name} ${user.last_name}: ${ROLE_LABELS[user.role]} → ${ROLE_LABELS[role]}`,
      before: { role: user.role },
      after: { role },
    });
    const updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ user: serializeUser(updated) });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/users/:id/status — блокировка/разблокировка аккаунта (куратор). */
router.patch('/:id/status', requireKurator, async (req, res, next) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [String(req.params.id)]);
    if (!user) throw notFound('Пользователь не найден');
    if (user.id === req.user.id) throw badRequest('Нельзя заблокировать самого себя');
    const isActive = req.body?.isActive ? 1 : 0;
    await db.run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', [isActive, nowIso(), user.id]);
    if (!isActive) {
      await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    }
    await logAudit(req, isActive ? 'user.activated' : 'user.deactivated', {
      entityType: 'user',
      entityId: user.id,
      summary: `${fullName(req.user)} ${isActive ? 'разблокировал' : 'заблокировал'} пользователя ${user.first_name} ${user.last_name}`,
      before: { isActive: Boolean(user.is_active) },
      after: { isActive: Boolean(isActive) },
    });
    const updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ user: serializeUser(updated) });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/:id — безвозвратное удаление аккаунта.
 *
 * Для учеников код не нужен, для старосты и куратора — обязателен код
 * доступа (config.codes.deleteManager). Удаляет аккаунт, сессии, привязанную
 * карточку ученика и все его дежурства/отметки/замены.
 */
router.delete('/:id', requireManager, async (req, res, next) => {
  try {
    if (req.body?.confirm !== true || req.body?.permanent !== true) {
      throw badRequest('Безвозвратное удаление требует confirm: true и permanent: true');
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [String(req.params.id)]);
    if (!user) throw notFound('Пользователь не найден');
    if (user.id === req.user.id) throw badRequest('Нельзя удалить собственный аккаунт');

    const isManagerRole = user.role === ROLES.STAROSTA || user.role === ROLES.KURATOR;
    if (isManagerRole) {
      const submitted = String(req.body?.code || '').trim();
      const expected = config.codes.deleteManager;
      if (!expected) throw forbidden('Удаление старосты/куратора отключено (не задан CODE_DELETE_MANAGER)');
      if (!submitted || !timingSafeEqual(submitted, expected)) {
        await logAudit(req, 'user.delete_rejected', {
          entityType: 'user',
          entityId: user.id,
          summary: `Отклонено удаление пользователя ${user.first_name} ${user.last_name} (неверный код)`,
        });
        throw forbidden('Неверный код удаления');
      }
    }

    const student = user.student_id ? await db.get('SELECT * FROM students WHERE id = ?', [user.student_id]) : null;

    if (user.role === ROLES.KURATOR) {
      const other = await db.get('SELECT id FROM users WHERE role = ? AND id <> ? LIMIT 1', [ROLES.KURATOR, user.id]);
      if (!other) throw badRequest('В системе должен остаться хотя бы один куратор');
    }

    const removed = { account: true, duties: 0, records: 0, replacements: 0, studentCard: false };
    if (student) {
      const [duties, records, replacements] = await Promise.all([
        db.get('SELECT COUNT(*) AS n FROM duties WHERE student_id = ?', [student.id]),
        db.get('SELECT COUNT(*) AS n FROM duty_records WHERE student_id = ?', [student.id]),
        db.get(
          'SELECT COUNT(*) AS n FROM replacements WHERE original_student_id = ? OR replacement_student_id = ?',
          [student.id, student.id],
        ),
      ]);
      removed.duties = Number(duties?.n || 0);
      removed.records = Number(records?.n || 0);
      removed.replacements = Number(replacements?.n || 0);
      removed.studentCard = true;
    }

    await db.transaction(async () => {
      if (student) {
        await db.run('DELETE FROM duty_records WHERE student_id = ?', [student.id]);
        await db.run(
          'DELETE FROM replacements WHERE original_student_id = ? OR replacement_student_id = ?',
          [student.id, student.id],
        );
        await db.run('DELETE FROM duties WHERE student_id = ?', [student.id]);
        await db.run('DELETE FROM students WHERE id = ?', [student.id]);
      }
      await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      await db.run('DELETE FROM users WHERE id = ?', [user.id]);
    });

    await logAudit(req, 'user.deleted', {
      entityType: 'user',
      entityId: user.id,
      summary: `Пользователь удалён безвозвратно: ${user.first_name} ${user.last_name} (${ROLE_LABELS[user.role]})${student ? `, карточка ученика и дежурств: ${removed.duties}` : ''}`,
      before: { firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role },
      after: { deleted: true, ...removed },
    });

    res.json({ ok: true, removed });
  } catch (error) {
    next(error);
  }
});

export default router;