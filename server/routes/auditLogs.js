import express from 'express';
import { db } from '../db/index.js';
import { serializeAudit } from '../lib/serialize.js';
import { requireAuth, requireManager } from '../middleware.js';
import { isDateString } from '../lib/dates.js';

const router = express.Router();
router.use(requireAuth);

/** GET /api/audit-logs — журнал изменений (староста и куратор). */
router.get('/', requireManager, async (req, res, next) => {
  try {
    const params = [];
    const clauses = [];
    if (req.query.action) {
      clauses.push('action LIKE ?');
      params.push(`${String(req.query.action)}%`);
    }
    if (req.query.actorId) {
      clauses.push('actor_id = ?');
      params.push(String(req.query.actorId));
    }
    if (req.query.entityType) {
      clauses.push('entity_type = ?');
      params.push(String(req.query.entityType));
    }
    if (isDateString(req.query.from || '')) {
      clauses.push('SUBSTR(created_at, 1, 10) >= ?');
      params.push(String(req.query.from));
    }
    if (isDateString(req.query.to || '')) {
      clauses.push('SUBSTR(created_at, 1, 10) <= ?');
      params.push(String(req.query.to));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const rows = await db.all(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const totalRow = await db.get(`SELECT COUNT(*) AS n FROM audit_logs ${where}`, params);

    const actionRows = await db.all('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC');

    res.json({
      logs: rows.map(serializeAudit),
      total: Number(totalRow?.n || 0),
      limit,
      offset,
      actions: actionRows.map((r) => r.action),
    });
  } catch (error) {
    next(error);
  }
});

export default router;