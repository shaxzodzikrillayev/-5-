import express from 'express';
import { db } from '../db/index.js';
import { newId, nowIso } from '../db/migrate.js';
import { serializeDuty } from '../lib/serialize.js';
import { statusMeta, MARKABLE_STATUSES, STATUSES, ROLES } from '../lib/constants.js';
import { logAudit, fullName } from '../lib/audit.js';
import { badRequest, notFound, forbidden, conflict } from '../lib/errors.js';
import { requireAuth, requireManager } from '../middleware.js';
import { isDateString, isMonthString, todayISO, monthBounds, listDays, isWeekend } from '../lib/dates.js';

const router = express.Router();
router.use(requireAuth);

const DUTY_SELECT = `
  SELECT d.id, d.duty_date, d.student_id, d.status, d.comment, d.assigned_by, d.created_at, d.updated_at,
         s.first_name AS student_first, s.last_name AS student_last,
         au.first_name AS assigned_first, au.last_name AS assigned_last,
         r.replacement_student_id AS replacement_student_id, r.reason AS replacement_reason,
         rs.first_name AS replacement_first, rs.last_name AS replacement_last
    FROM duties d
    JOIN students s ON s.id = d.student_id
    LEFT JOIN users au ON au.id = d.assigned_by
    LEFT JOIN replacements r ON r.duty_id = d.id
    LEFT JOIN students rs ON rs.id = r.replacement_student_id`;

function mapDuty(row) {
  if (!row) return null;
  return serializeDuty(
    {
      id: row.id,
      duty_date: row.duty_date,
      student_id: row.student_id,
      status: row.status,
      comment: row.comment,
      assigned_by: row.assigned_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      student_name: `${row.student_first} ${row.student_last}`,
      student_initials: `${row.student_first?.[0] || ''}${row.student_last?.[0] || ''}`,
      assigned_by_name: row.assigned_first ? `${row.assigned_first} ${row.assigned_last}` : null,
    },
    {
      replacedById: row.replacement_student_id || null,
      replacedByName: row.replacement_first ? `${row.replacement_first} ${row.replacement_last}` : null,
      replacementReason: row.replacement_reason || null,
    },
  );
}

async function getDutyRow(id) {
  const row = await db.get(`${DUTY_SELECT} WHERE d.id = ?`, [id]);
  return row || null;
}

async function activeStudents() {
  return db.all(`SELECT * FROM students WHERE is_active = 1 ORDER BY sort_order ASC, last_name ASC`);
}

async function requireStudent(studentId) {
  const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) throw badRequest('Ученик не найден');
  return student;
}

/**
 * Центральная операция смены статуса:
 *  1. обновляет текущее состояние в duties;
 *  2. пишет неизменяемую запись в duty_records;
 *  3. пишет событие в audit_logs.
 */
export async function applyStatusChange({ duty, status, comment, actor, source = 'manual', ip = null }) {
  const ts = nowIso();
  const nextComment = comment === undefined ? duty.comment : comment;

  await db.run(
    'UPDATE duties SET status = ?, comment = ?, updated_at = ? WHERE id = ?',
    [status, nextComment || null, ts, duty.id],
  );
  await db.run(
    `INSERT INTO duty_records (id, duty_id, student_id, duty_date, status, comment, changed_by, changed_by_role, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(), duty.id, duty.student_id, duty.duty_date, status, nextComment || null,
      actor?.user?.id || actor?.id || null, actor?.user?.role || actor?.role || null, source, ts,
    ],
  );

  const student = await db.get('SELECT * FROM students WHERE id = ?', [duty.student_id]);
  const fromLabel = statusMeta(duty.status).label;
  const toLabel = statusMeta(status).label;
  const who = fullName(actor?.user || actor);
  const target = student ? `${student.first_name} ${student.last_name}` : 'ученик';

  let summary = `${who} изменил статус (${target}): «${fromLabel}» → «${toLabel}»`;
  if (source === 'replacement') summary = `${who} оформил замену для (${target}) — статус «${toLabel}»`;
  if (nextComment) summary += ` — комментарий: «${nextComment}»`;

  await logAudit(actor, `duty.status.${status}`, {
    entityType: 'duty',
    entityId: duty.id,
    summary,
    comment: nextComment || null,
    before: { status: duty.status, statusLabel: fromLabel, date: duty.duty_date },
    after: { status, statusLabel: toLabel, date: duty.duty_date },
    ip,
  });
}

async function createDutyRow({ date, studentId, status = STATUSES.SCHEDULED, comment = null, actorId = null }) {
  const ts = nowIso();
  const id = newId();
  await db.run(
    `INSERT INTO duties (id, duty_date, student_id, status, comment, assigned_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, date, studentId, status, comment || null, actorId, ts, ts],
  );
  await db.run(
    `INSERT INTO duty_records (id, duty_id, student_id, duty_date, status, comment, changed_by, changed_by_role, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'schedule', ?)`,
    [newId(), id, studentId, date, status, comment || null, actorId, null, ts],
  );
  return id;
}

/* ------------------------------------------------------------------ */
/*  Чтение                                                             */
/* ------------------------------------------------------------------ */

router.get('/today', async (req, res, next) => {
  try {
    const date = isDateString(req.query.date || '') ? String(req.query.date) : todayISO();
    const rows = await db.all(`${DUTY_SELECT} WHERE d.duty_date = ? ORDER BY s.sort_order ASC, s.last_name ASC`, [date]);
    res.json({ date, duties: rows.map(mapDuty) });
  } catch (error) {
    next(error);
  }
});

router.get('/month', async (req, res, next) => {
  try {
    const month = isMonthString(req.query.month || '') ? String(req.query.month) : todayISO().slice(0, 7);
    const { start, end, days } = monthBounds(month);
    const rows = await db.all(
      `${DUTY_SELECT} WHERE d.duty_date >= ? AND d.duty_date <= ? ORDER BY d.duty_date ASC, s.sort_order ASC`,
      [start, end],
    );
    res.json({ month, range: { start, end }, days, duties: rows.map(mapDuty) });
  } catch (error) {
    next(error);
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    if (!req.user.studentId) {
      return res.json({ studentId: null, duties: [], replacements: [], stats: null });
    }
    const from = isDateString(req.query.from || '') ? String(req.query.from) : null;
    const to = isDateString(req.query.to || '') ? String(req.query.to) : null;
    const params = [req.user.studentId];
    let where = 'WHERE d.student_id = ?';
    if (from) {
      where += ' AND d.duty_date >= ?';
      params.push(from);
    }
    if (to) {
      where += ' AND d.duty_date <= ?';
      params.push(to);
    }
    const rows = await db.all(`${DUTY_SELECT} ${where} ORDER BY d.duty_date DESC`, params);
    const asReplacement = await db.all(
      `SELECT d.id, d.duty_date, d.status, d.comment,
              s.first_name AS student_first, s.last_name AS student_last,
              r.reason AS replacement_reason
         FROM replacements r
         JOIN duties d ON d.id = r.duty_id
         JOIN students s ON s.id = d.student_id
        WHERE r.replacement_student_id = ?
        ORDER BY d.duty_date DESC`,
      [req.user.studentId],
    );
    res.json({
      studentId: req.user.studentId,
      duties: rows.map(mapDuty),
      replacements: asReplacement.map((row) => ({
        id: row.id,
        date: row.duty_date,
        forStudent: `${row.student_first} ${row.student_last}`,
        reason: row.replacement_reason || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const from = isDateString(req.query.from || '') ? String(req.query.from) : null;
    const to = isDateString(req.query.to || '') ? String(req.query.to) : null;
    const params = [];
    const clauses = [];
    if (from) {
      clauses.push('d.duty_date >= ?');
      params.push(from);
    }
    if (to) {
      clauses.push('d.duty_date <= ?');
      params.push(to);
    }
    if (req.query.studentId) {
      clauses.push('d.student_id = ?');
      params.push(String(req.query.studentId));
    }
    if (req.query.status) {
      clauses.push('d.status = ?');
      params.push(String(req.query.status));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const rows = await db.all(`${DUTY_SELECT} ${where} ORDER BY d.duty_date DESC, s.sort_order ASC LIMIT ?`, [...params, limit]);
    res.json({ duties: rows.map(mapDuty), total: rows.length });
  } catch (error) {
    next(error);
  }
});

router.get('/date/:date', async (req, res, next) => {
  try {
    const date = String(req.params.date);
    if (!isDateString(date)) throw badRequest('Дата указывается в формате YYYY-MM-DD');
    const rows = await db.all(`${DUTY_SELECT} WHERE d.duty_date = ? ORDER BY s.sort_order ASC`, [date]);
    res.json({ date, duties: rows.map(mapDuty) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await getDutyRow(String(req.params.id));
    if (!row) throw notFound('Дежурство не найдено');
    if (req.user.role === ROLES.STUDENT) {
      const own = req.user.studentId;
      const involved =
        row.student_id === own || row.replacement_student_id === own;
      if (!involved) throw notFound('Дежурство не найдено');
    }
    const records = await db.all(
      `SELECT dr.*, u.first_name AS changed_first, u.last_name AS changed_last
         FROM duty_records dr LEFT JOIN users u ON u.id = dr.changed_by
        WHERE dr.duty_id = ? ORDER BY dr.created_at ASC`,
      [row.id],
    );
    res.json({
      duty: mapDuty(row),
      records: records.map((r) => ({
        id: r.id,
        status: r.status,
        statusLabel: statusMeta(r.status).label,
        comment: r.comment,
        source: r.source,
        changedBy: r.changed_first ? `${r.changed_first} ${r.changed_last}` : 'Система',
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/*  Изменение (только староста / куратор)                               */
/* ------------------------------------------------------------------ */

router.post('/', requireManager, async (req, res, next) => {
  try {
    const date = String(req.body?.date || '');
    if (!isDateString(date)) throw badRequest('Поле «Дата» (YYYY-MM-DD) обязательно');
    const studentId = String(req.body?.studentId || '');
    if (!studentId) throw badRequest('Поле «Ученик» обязательно');
    await requireStudent(studentId);

    const existing = await db.get('SELECT id FROM duties WHERE duty_date = ? AND student_id = ?', [date, studentId]);
    if (existing) throw conflict('Этот ученик уже назначен на дежурство в эту дату');

    const status = MARKABLE_STATUSES.includes(req.body?.status) || req.body?.status === STATUSES.SCHEDULED
      ? req.body.status
      : STATUSES.SCHEDULED;
    const comment = req.body?.comment ? String(req.body.comment).slice(0, 500) : null;

    const id = await db.transaction(async () => {
      const dutyId = await createDutyRow({ date, studentId, status, comment, actorId: req.user.id });
      if (status !== STATUSES.SCHEDULED) {
        const duty = await getDutyRow(dutyId);
        await applyStatusChange({ duty, status, comment, actor: req, source: 'manual', ip: req.ip });
      }
      return dutyId;
    });

    const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
    await logAudit(req, 'duty.created', {
      entityType: 'duty',
      entityId: id,
      summary: `${fullName(req.user)} назначил дежурным: ${student.first_name} ${student.last_name} на ${date}`,
      after: { date, studentId, status },
    });

    res.status(201).json({ duty: mapDuty(await getDutyRow(id)) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/duties/bulk — массовое назначение (несколько учеников на один или несколько дней). */
router.post('/bulk', requireManager, async (req, res, next) => {
  try {
    const dates = Array.isArray(req.body?.dates) ? req.body.dates.map(String) : [];
    const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : [];
    if (!dates.length || !studentIds.length) throw badRequest('Нужны списки dates и studentIds');
    dates.forEach((d) => {
      if (!isDateString(d)) throw badRequest(`Некорректная дата: ${d}`);
    });
    for (const id of studentIds) await requireStudent(id);

    let created = 0;
    let skipped = 0;
    const ids = [];
    await db.transaction(async () => {
      for (const date of dates) {
        for (const studentId of studentIds) {
          const existing = await db.get('SELECT id FROM duties WHERE duty_date = ? AND student_id = ?', [date, studentId]);
          if (existing) {
            skipped += 1;
            continue;
          }
          ids.push(await createDutyRow({ date, studentId, actorId: req.user.id }));
          created += 1;
        }
      }
    });

    await logAudit(req, 'duty.bulk_created', {
      entityType: 'duty',
      summary: `${fullName(req.user)} добавил назначения: ${created} (пропущено дубликатов: ${skipped})`,
      after: { dates, studentIds },
    });

    const rows = ids.length ? await db.all(`${DUTY_SELECT} WHERE d.id IN (${ids.map(() => '?').join(',')})`, ids) : [];
    res.status(201).json({ created, skipped, duties: rows.map(mapDuty) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/duties/generate — автосоставление расписания по кругу. */
router.post('/generate', requireManager, async (req, res, next) => {
  try {
    const from = String(req.body?.from || todayISO());
    const to = String(req.body?.to || from);
    if (!isDateString(from) || !isDateString(to)) throw badRequest('Некорректные даты (нужен формат YYYY-MM-DD)');
    if (from > to) throw badRequest('Начальная дата позже конечной');
    const perDay = Math.max(1, Math.min(Number(req.body?.perDay) || 2, 10));
    const skipWeekends = req.body?.skipWeekends !== false;
    const replaceExisting = req.body?.replaceExisting === true;

    const students = await activeStudents();
    if (students.length < perDay) throw badRequest(`Активных учеников (${students.length}) меньше, чем дежурных в день (${perDay})`);

    const days = listDays(from, to).filter((d) => (skipWeekends ? !isWeekend(d) : true));
    if (!days.length) throw badRequest('В выбранном диапазоне нет подходящих дней');

    let cursor = Number(req.body?.startIndex) || 0;
    let created = 0;
    let skipped = 0;
    let removed = 0;

    await db.transaction(async () => {
      for (const date of days) {
        for (let k = 0; k < perDay; k += 1) {
          const student = students[cursor % students.length];
          cursor += 1;
          const existing = await db.get('SELECT * FROM duties WHERE duty_date = ? AND student_id = ?', [date, student.id]);
          if (existing) {
            if (replaceExisting && existing.status === STATUSES.SCHEDULED) {
              await db.run('DELETE FROM duty_records WHERE duty_id = ?', [existing.id]);
              await db.run('DELETE FROM duties WHERE id = ?', [existing.id]);
              removed += 1;
            } else {
              skipped += 1;
              continue;
            }
          }
          await createDutyRow({ date, studentId: student.id, actorId: req.user.id });
          created += 1;
        }
      }
    });

    await logAudit(req, 'duty.generated', {
      entityType: 'duty',
      summary: `${fullName(req.user)} сгенерировал расписание: ${created} назначений за ${days.length} дн. (по ${perDay} чел./день)`,
      after: { from, to, perDay, skipWeekends, created, skipped, removed },
    });

    const rows = await db.all(
      `${DUTY_SELECT} WHERE d.duty_date >= ? AND d.duty_date <= ? ORDER BY d.duty_date ASC, s.sort_order ASC`,
      [from, to],
    );
    res.status(201).json({ created, skipped, removed, days: days.length, duties: rows.map(mapDuty) });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/duties/:id — изменить назначение (ученик, дата, комментарий). */
router.patch('/:id', requireManager, async (req, res, next) => {
  try {
    const row = await getDutyRow(String(req.params.id));
    if (!row) throw notFound('Дежурство не найдено');

    const newDate = req.body?.date !== undefined ? String(req.body.date) : row.duty_date;
    if (!isDateString(newDate)) throw badRequest('Некорректная дата (YYYY-MM-DD)');
    const newStudentId = req.body?.studentId !== undefined ? String(req.body.studentId) : row.student_id;
    await requireStudent(newStudentId);
    const newComment = req.body?.comment !== undefined ? (req.body.comment ? String(req.body.comment).slice(0, 500) : null) : row.comment;

    const conflictRow = await db.get(
      'SELECT id FROM duties WHERE duty_date = ? AND student_id = ? AND id <> ?',
      [newDate, newStudentId, row.id],
    );
    if (conflictRow) throw conflict('В эту дату у выбранного ученика уже есть дежурство');

    const movedDate = newDate !== row.duty_date;
    const changedStudent = newStudentId !== row.student_id;

    await db.transaction(async () => {
      await db.run(
        'UPDATE duties SET duty_date = ?, student_id = ?, comment = ?, updated_at = ? WHERE id = ?',
        [newDate, newStudentId, newComment, nowIso(), row.id],
      );
      await db.run('UPDATE duty_records SET duty_date = ?, student_id = ? WHERE duty_id = ?',
        [newDate, newStudentId, row.id]);
      if (movedDate || changedStudent) {
        const student = await db.get('SELECT * FROM students WHERE id = ?', [newStudentId]);
        const parts = [];
        if (movedDate) parts.push(`дата ${row.duty_date} → ${newDate}`);
        if (changedStudent) parts.push(`дежурный ${row.student_first} ${row.student_last} → ${student.first_name} ${student.last_name}`);
        await logAudit(req, movedDate ? 'duty.rescheduled' : 'duty.reassigned', {
          entityType: 'duty',
          entityId: row.id,
          summary: `${fullName(req.user)} изменил назначение: ${parts.join('; ')}`,
          before: { date: row.duty_date, studentId: row.student_id },
          after: { date: newDate, studentId: newStudentId },
          comment: newComment,
        });
      }
    });

    res.json({ duty: mapDuty(await getDutyRow(row.id)) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/duties/:id/status — установить статус дежурства. */
router.post('/:id/status', requireManager, async (req, res, next) => {
  try {
    const row = await getDutyRow(String(req.params.id));
    if (!row) throw notFound('Дежурство не найдено');

    const status = String(req.body?.status || '');
    if (!MARKABLE_STATUSES.includes(status)) {
      throw badRequest(`Недопустимый статус. Разрешены: ${MARKABLE_STATUSES.join(', ')}`);
    }
    const comment = req.body?.comment !== undefined
      ? (req.body.comment ? String(req.body.comment).slice(0, 500) : null)
      : row.comment;

    await db.transaction(async () => {
      await applyStatusChange({ duty: row, status, comment, actor: req, source: 'manual', ip: req.ip });
    });

    res.json({ duty: mapDuty(await getDutyRow(row.id)) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/duties/:id/comment — добавить/изменить комментарий без смены статуса. */
router.post('/:id/comment', requireManager, async (req, res, next) => {
  try {
    const row = await getDutyRow(String(req.params.id));
    if (!row) throw notFound('Дежурство не найдено');
    const comment = req.body?.comment ? String(req.body.comment).slice(0, 500) : null;
    await db.run('UPDATE duties SET comment = ?, updated_at = ? WHERE id = ?', [comment, nowIso(), row.id]);
    const student = await db.get('SELECT * FROM students WHERE id = ?', [row.student_id]);
    await logAudit(req, 'duty.comment', {
      entityType: 'duty',
      entityId: row.id,
      summary: `${fullName(req.user)} оставил комментарий к дежурству (${student?.first_name} ${student?.last_name}, ${row.duty_date})`,
      before: { comment: row.comment },
      after: { comment },
      comment,
    });
    res.json({ duty: mapDuty(await getDutyRow(row.id)) });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/duties/:id — удалить назначение (с подтверждением). */
router.delete('/:id', requireManager, async (req, res, next) => {
  try {
    if (req.body?.confirm !== true && req.query.confirm !== 'true') {
      throw badRequest('Удаление требует подтверждения (confirm: true)');
    }
    const row = await getDutyRow(String(req.params.id));
    if (!row) throw notFound('Дежурство не найдено');
    if (row.status !== STATUSES.SCHEDULED && req.user.role !== ROLES.KURATOR) {
      throw forbidden('Удалить отмеченное дежурство может только куратор');
    }

    await db.transaction(async () => {
      await db.run('DELETE FROM duty_records WHERE duty_id = ?', [row.id]);
      await db.run('DELETE FROM replacements WHERE duty_id = ?', [row.id]);
      await db.run('DELETE FROM duties WHERE id = ?', [row.id]);
    });

    await logAudit(req, 'duty.deleted', {
      entityType: 'duty',
      entityId: row.id,
      summary: `${fullName(req.user)} удалил дежурство: ${row.student_first} ${row.student_last}, ${row.duty_date} (статус «${statusMeta(row.status).label}»)`,
      before: { date: row.duty_date, studentId: row.student_id, status: row.status, comment: row.comment },
    });

    res.json({ ok: true, deletedId: row.id });
  } catch (error) {
    next(error);
  }
});

export default router;
export { mapDuty, getDutyRow, createDutyRow, DUTY_SELECT, activeStudents };