import express from 'express';
import { db } from '../db/index.js';
import { newId, nowIso } from '../db/migrate.js';
import { logAudit, fullName } from '../lib/audit.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { requireAuth, requireManager } from '../middleware.js';
import { isDateString, todayISO } from '../lib/dates.js';
import { statusMeta, STATUSES } from '../lib/constants.js';
import { getDutyRow, mapDuty, createDutyRow, applyStatusChange } from './duties.js';

const router = express.Router();
router.use(requireAuth);

function serializeReplacement(row) {
  return {
    id: row.id,
    dutyId: row.duty_id,
    date: row.duty_date,
    originalStudentId: row.original_student_id,
    originalStudentName: row.original_first && row.original_last ? `${row.original_first} ${row.original_last}` : null,
    replacementStudentId: row.replacement_student_id,
    replacementStudentName:
      row.replacement_first && row.replacement_last ? `${row.replacement_first} ${row.replacement_last}` : null,
    reason: row.reason || null,
    createdAt: row.created_at,
    createdByName: row.created_first && row.created_last ? `${row.created_first} ${row.created_last}` : 'Система',
  };
}

const REPLACEMENT_SELECT = `
  SELECT r.*,
         os.first_name AS original_first, os.last_name AS original_last,
         rs.first_name AS replacement_first, rs.last_name AS replacement_last,
         u.first_name AS created_first, u.last_name AS created_last
    FROM replacements r
    JOIN students os ON os.id = r.original_student_id
    JOIN students rs ON rs.id = r.replacement_student_id
    LEFT JOIN users u ON u.id = r.created_by`;

/** GET /api/replacements — журнал замен. */
router.get('/', async (req, res, next) => {
  try {
    const from = isDateString(req.query.from || '') ? String(req.query.from) : null;
    const to = isDateString(req.query.to || '') ? String(req.query.to) : null;
    const params = [];
    const clauses = [];
    if (from) {
      clauses.push('r.duty_date >= ?');
      params.push(from);
    }
    if (to) {
      clauses.push('r.duty_date <= ?');
      params.push(to);
    }
    if (req.query.studentId) {
      clauses.push('(r.original_student_id = ? OR r.replacement_student_id = ?)');
      params.push(String(req.query.studentId), String(req.query.studentId));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await db.all(`${REPLACEMENT_SELECT} ${where} ORDER BY r.duty_date DESC, r.created_at DESC LIMIT 500`, params);
    res.json({ replacements: rows.map(serializeReplacement), total: rows.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/replacements
 * Вместо кого: dutyId (или date + originalStudentId). Дежурит: replacementStudentId. Причина: reason.
 */
router.post('/', requireManager, async (req, res, next) => {
  try {
    const replacementStudentId = String(req.body?.replacementStudentId || req.body?.studentId || '');
    if (!replacementStudentId) throw badRequest('Поле «Кто дежурит вместо» обязательно');

    let duty;
    if (req.body?.dutyId) {
      duty = await getDutyRow(String(req.body.dutyId));
      if (!duty) throw notFound('Дежурство не найдено');
    } else {
      const date = String(req.body?.date || todayISO());
      const originalStudentId = String(req.body?.originalStudentId || '');
      if (!isDateString(date)) throw badRequest('Некорректная дата (YYYY-MM-DD)');
      if (!originalStudentId) throw badRequest('Поле «Вместо кого» обязательно');
      const found = await db.get('SELECT * FROM duties WHERE duty_date = ? AND student_id = ?', [date, originalStudentId]);
      if (!found) throw notFound('Дежурство не найдено');
      duty = await getDutyRow(found.id);
    }

    const replacementStudent = await db.get('SELECT * FROM students WHERE id = ?', [replacementStudentId]);
    if (!replacementStudent) throw badRequest('Заменяющий ученик не найден');
    if (!replacementStudent.is_active) throw badRequest('Заменяющий ученик неактивен');
    if (replacementStudent.id === duty.student_id) {
      throw badRequest('Заменяющий ученик совпадает с исходным дежурным');
    }
    if (duty.replacement_student_id && duty.replacement_student_id !== replacementStudent.id) {
      throw conflict('Замена для этого дежурства уже оформлена');
    }

    const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
    const markServed = req.body?.markServed !== false;

    // Повторная отправка той же замены — обновляем причину, не плодим дубликаты.
    if (duty.replacement_student_id === replacementStudent.id) {
      const existing = await db.get('SELECT * FROM replacements WHERE duty_id = ?', [duty.id]);
      if (existing) {
        await db.run('UPDATE replacements SET reason = ?, created_by = ?, created_at = ? WHERE id = ?',
          [reason, req.user.id, nowIso(), existing.id]);
        const updatedRow = await db.get(`${REPLACEMENT_SELECT} WHERE r.id = ?`, [existing.id]);
        await logAudit(req, 'replacement.updated', {
          entityType: 'replacement',
          entityId: existing.id,
          summary: `${fullName(req.user)} изменил причину замены для (${duty.student_first} ${duty.student_last}, ${duty.duty_date})`,
          before: { reason: existing.reason },
          after: { reason },
        });
        return res.status(200).json({
          replacement: serializeReplacement(updatedRow),
          duty: mapDuty(await getDutyRow(duty.id)),
          newDuty: null,
          updated: true,
        });
      }
    }

    const busy = await db.get(
      'SELECT id FROM duties WHERE duty_date = ? AND student_id = ?',
      [duty.duty_date, replacementStudent.id],
    );
    if (busy) throw conflict(`${replacementStudent.first_name} ${replacementStudent.last_name} уже дежурит в эту дату`);

    const newStatus = markServed ? STATUSES.SERVED : STATUSES.SCHEDULED;
    const replacementId = newId();
    let newDutyId = null;

    await db.transaction(async () => {
      await db.run(
        `INSERT INTO replacements (id, duty_id, duty_date, original_student_id, replacement_student_id, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [replacementId, duty.id, duty.duty_date, duty.student_id, replacementStudent.id, reason, req.user.id, nowIso()],
      );
      await applyStatusChange({
        duty,
        status: STATUSES.REPLACED,
        comment: reason ? `Замена: ${reason}` : 'Замена',
        actor: req,
        source: 'replacement',
        ip: req.ip,
      });
      if (markServed) {
        newDutyId = await createDutyRow({
          date: duty.duty_date,
          studentId: replacementStudent.id,
          status: STATUSES.SERVED,
          comment: `Дежурил вместо: ${duty.student_first} ${duty.student_last}${reason ? ` (${reason})` : ''}`,
          actorId: req.user.id,
        });
        const createdDuty = await getDutyRow(newDutyId);
        await applyStatusChange({
          duty: createdDuty,
          status: STATUSES.SERVED,
          comment: createdDuty.comment,
          actor: req,
          source: 'replacement',
          ip: req.ip,
        });
      }
    });

    await logAudit(req, 'replacement.created', {
      entityType: 'replacement',
      entityId: replacementId,
      summary: `${fullName(req.user)} добавил замену: вместо ${duty.student_first} ${duty.student_last} дежурит ${replacementStudent.first_name} ${replacementStudent.last_name} (${duty.duty_date})${reason ? ` — «${reason}»` : ''}`,
      before: { status: duty.status, statusLabel: statusMeta(duty.status).label },
      after: { status: STATUSES.REPLACED, statusLabel: statusMeta(STATUSES.REPLACED).label, replacementStudentId },
      comment: reason,
    });

    const row = await db.get(`${REPLACEMENT_SELECT} WHERE r.id = ?`, [replacementId]);
    res.status(201).json({
      replacement: serializeReplacement(row),
      duty: mapDuty(await getDutyRow(duty.id)),
      newDuty: newDutyId ? mapDuty(await getDutyRow(newDutyId)) : null,
    });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/replacements/:id — отменить замену (с подтверждением). */
router.delete('/:id', requireManager, async (req, res, next) => {
  try {
    if (req.body?.confirm !== true && req.query.confirm !== 'true') {
      throw badRequest('Отмена замены требует подтверждения (confirm: true)');
    }
    const row = await db.get('SELECT * FROM replacements WHERE id = ?', [String(req.params.id)]);
    if (!row) throw notFound('Замена не найдена');
    const duty = await getDutyRow(row.duty_id);
    if (!duty) throw notFound('Дежурство не найдено');

    let removedDutyId = null;
    await db.transaction(async () => {
      const candidate = await db.get(
        'SELECT * FROM duties WHERE duty_date = ? AND student_id = ?',
        [row.duty_date, row.replacement_student_id],
      );
      if (candidate && candidate.id !== duty.id) {
        await db.run('DELETE FROM duty_records WHERE duty_id = ?', [candidate.id]);
        await db.run('DELETE FROM replacements WHERE duty_id = ?', [candidate.id]);
        await db.run('DELETE FROM duties WHERE id = ?', [candidate.id]);
        removedDutyId = candidate.id;
      }
      await db.run('DELETE FROM replacements WHERE id = ?', [row.id]);
      await applyStatusChange({
        duty,
        status: STATUSES.SCHEDULED,
        comment: null,
        actor: req,
        source: 'replacement',
        ip: req.ip,
      });
    });

    await logAudit(req, 'replacement.cancelled', {
      entityType: 'replacement',
      entityId: row.id,
      summary: `${fullName(req.user)} отменил замену для ${duty.student_first} ${duty.student_last} (${row.duty_date})`,
      before: { status: STATUSES.REPLACED },
      after: { status: STATUSES.SCHEDULED, removedDutyId },
    });

    res.json({ ok: true, duty: mapDuty(await getDutyRow(duty.id)), removedDutyId });
  } catch (error) {
    next(error);
  }
});

export default router;