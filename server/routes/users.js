import express from 'express';
import { db } from '../db/index.js';
import { nowIso } from '../db/migrate.js';
import { serializeUser } from '../lib/serialize.js';
import { requireAuth, requireManager, requireKurator } from '../middleware.js';
import { logAudit, fullName } from '../lib/audit.js';
import { notFound, badRequest } from '../lib/errors.js';
import { ROLES, ROLE_LABELS } from '../lib/constants.js';

const router = express.Router();
router.use(requireAuth);

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

export default router;