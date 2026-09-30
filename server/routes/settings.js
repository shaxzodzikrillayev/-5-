import express from 'express';
import { getSetting, setSetting } from '../db/migrate.js';
import { db } from '../db/index.js';
import { requireAuth, requireKurator } from '../middleware.js';
import { logAudit, fullName } from '../lib/audit.js';
import { str } from '../lib/errors.js';
import { ROLES, ROLE_LABELS } from '../lib/constants.js';

const router = express.Router();

/** GET /api/settings — публичные настройки системы (название класса, наличие кода регистрации). */
router.get('/', async (req, res, next) => {
  try {
    const className = (await getSetting('class_name', '')) || '';
    const classCity = (await getSetting('class_city', '')) || '';
    const kuratorExists = await db.get('SELECT id FROM users WHERE role = ? LIMIT 1', [ROLES.KURATOR]);
    res.json({
      className,
      classCity,
      kuratorExists: Boolean(kuratorExists),
      requiresCode: { starosta: true, kurator: Boolean(kuratorExists) },
      roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
    });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/settings — изменить название класса (только куратор). */
router.patch('/', requireAuth, requireKurator, async (req, res, next) => {
  try {
    const before = {
      className: (await getSetting('class_name', '')) || '',
      classCity: (await getSetting('class_city', '')) || '',
    };
    if (req.body?.className !== undefined) {
      await setSetting('class_name', str(req.body.className, 'Название класса', { required: false, max: 120 }) || '');
    }
    if (req.body?.classCity !== undefined) {
      await setSetting('class_city', str(req.body.classCity, 'Город/школа', { required: false, max: 120 }) || '');
    }
    const after = {
      className: (await getSetting('class_name', '')) || '',
      classCity: (await getSetting('class_city', '')) || '',
    };
    await logAudit(req, 'settings.updated', {
      entityType: 'settings',
      summary: `${fullName(req.user)} изменил настройки класса`,
      before,
      after,
    });
    res.json({ className: after.className, classCity: after.classCity });
  } catch (error) {
    next(error);
  }
});

export default router;