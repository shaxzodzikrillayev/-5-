import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireManager } from '../middleware.js';
import { isMonthString, monthBounds, todayISO } from '../lib/dates.js';
import { statusMeta, STATUSES } from '../lib/constants.js';
import { serializeStudent } from '../lib/serialize.js';

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/reports/month?month=YYYY-MM
 * Таблица: Ученик | Назначено | Дежурил | Не дежурил | Болел | Освобождён | Замены | Неявки
 */
router.get('/month', requireManager, async (req, res, next) => {
  try {
    const month = isMonthString(req.query.month || '') ? String(req.query.month) : todayISO().slice(0, 7);
    const { start, end, days } = monthBounds(month);

    const rows = await db.all(
      `SELECT s.id, s.first_name, s.last_name, s.user_id, s.class_name, s.sort_order, s.is_active, s.created_at, s.updated_at,
              COUNT(d.id) AS assigned,
              SUM(CASE WHEN d.status = '${STATUSES.SERVED}' THEN 1 ELSE 0 END)    AS served,
              SUM(CASE WHEN d.status = '${STATUSES.NOT_SERVED}' THEN 1 ELSE 0 END) AS not_served,
              SUM(CASE WHEN d.status = '${STATUSES.SICK}' THEN 1 ELSE 0 END)      AS sick,
              SUM(CASE WHEN d.status = '${STATUSES.EXCUSED}' THEN 1 ELSE 0 END)   AS excused,
              SUM(CASE WHEN d.status = '${STATUSES.REPLACED}' THEN 1 ELSE 0 END)  AS replaced,
              SUM(CASE WHEN d.status = '${STATUSES.ABSENT}' THEN 1 ELSE 0 END)    AS absent,
              SUM(CASE WHEN d.status = '${STATUSES.SCHEDULED}' THEN 1 ELSE 0 END) AS scheduled
         FROM students s
         LEFT JOIN duties d ON d.student_id = s.id AND d.duty_date >= ? AND d.duty_date <= ?
        GROUP BY s.id, s.first_name, s.last_name, s.user_id, s.class_name, s.sort_order, s.is_active, s.created_at, s.updated_at
        ORDER BY s.sort_order ASC, s.last_name ASC`,
      [start, end],
    );

    const includeInactive = req.query.includeInactive === 'true';
    const filtered = includeInactive ? rows : rows.filter((r) => Boolean(r.is_active));

    const table = filtered.map((row) => {
      const assigned = Number(row.assigned || 0);
      const served = Number(row.served || 0);
      const notServed = Number(row.not_served || 0);
      const absent = Number(row.absent || 0);
      const detail = {
        assigned,
        served,
        notServed,
        sick: Number(row.sick || 0),
        excused: Number(row.excused || 0),
        replaced: Number(row.replaced || 0),
        absent,
        scheduled: Number(row.scheduled || 0),
        failed: notServed + absent,
        attendanceRate: assigned ? Math.round((served / assigned) * 100) : 0,
      };
      return {
        student: serializeStudent(row),
        detail,
      };
    });

    // Детализация по конкретному ученику за месяц (для раскрытия строки).
    let detail = null;
    if (req.query.studentId) {
      const studentId = String(req.query.studentId);
      const history = await db.all(
        `SELECT d.id, d.duty_date, d.status, d.comment,
                rs.first_name AS replacement_first, rs.last_name AS replacement_last, r.reason AS replacement_reason
           FROM duties d
           LEFT JOIN replacements r ON r.duty_id = d.id
           LEFT JOIN students rs ON rs.id = r.replacement_student_id
          WHERE d.student_id = ? AND d.duty_date >= ? AND d.duty_date <= ?
          ORDER BY d.duty_date ASC`,
        [studentId, start, end],
      );
      const asReplacement = await db.all(
        `SELECT d.id, d.duty_date, d.status, d.comment,
                os.first_name AS original_first, os.last_name AS original_last, r.reason
           FROM replacements r
           JOIN duties d ON d.id = r.duty_id
           JOIN students os ON os.id = r.original_student_id
          WHERE r.replacement_student_id = ? AND r.duty_date >= ? AND r.duty_date <= ?
          ORDER BY r.duty_date ASC`,
        [studentId, start, end],
      );
      detail = {
        studentId,
        entries: [
          ...history.map((h) => ({
            id: h.id,
            date: h.duty_date,
            status: h.status,
            statusLabel: statusMeta(h.status).label,
            color: statusMeta(h.status).color,
            comment: h.comment || null,
            replacement: h.replacement_first ? `${h.replacement_first} ${h.replacement_last}` : null,
            replacementReason: h.replacement_reason || null,
          })),
          ...asReplacement.map((h) => ({
            id: h.id,
            date: h.duty_date,
            status: STATUSES.REPLACED,
            statusLabel: 'Замена (дежурил вместо)',
            color: statusMeta(STATUSES.REPLACED).color,
            comment: h.reason || null,
            replacement: `${h.original_first} ${h.original_last}`,
            replacementReason: h.reason || null,
          })),
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };
    }

    const totals = table.reduce(
      (acc, row) => ({
        assigned: acc.assigned + row.detail.assigned,
        served: acc.served + row.detail.served,
        notServed: acc.notServed + row.detail.notServed,
        sick: acc.sick + row.detail.sick,
        excused: acc.excused + row.detail.excused,
        replaced: acc.replaced + row.detail.replaced,
        absent: acc.absent + row.detail.absent,
        scheduled: acc.scheduled + row.detail.scheduled,
      }),
      { assigned: 0, served: 0, notServed: 0, sick: 0, excused: 0, replaced: 0, absent: 0, scheduled: 0 },
    );

    res.json({
      month,
      range: { start, end, days },
      table,
      detail,
      totals: {
        ...totals,
        failed: totals.notServed + totals.absent,
        attendanceRate: totals.assigned ? Math.round((totals.served / totals.assigned) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** GET /api/reports/months — список месяцев, за которые есть данные. */
router.get('/months', requireManager, async (req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT DISTINCT SUBSTR(duty_date, 1, 7) AS month, COUNT(*) AS duties
         FROM duties ORDER BY month DESC LIMIT 36`,
    );
    res.json({ months: rows.map((r) => ({ month: r.month, duties: Number(r.duties) })) });
  } catch (error) {
    next(error);
  }
});

/** GET /api/reports/export?month= — выгрузка CSV. */
router.get('/export', requireManager, async (req, res, next) => {
  try {
    const month = isMonthString(req.query.month || '') ? String(req.query.month) : todayISO().slice(0, 7);
    const { start, end } = monthBounds(month);
    const rows = await db.all(
      `SELECT s.first_name, s.last_name,
              COUNT(d.id) AS assigned,
              SUM(CASE WHEN d.status = '${STATUSES.SERVED}' THEN 1 ELSE 0 END)    AS served,
              SUM(CASE WHEN d.status = '${STATUSES.NOT_SERVED}' THEN 1 ELSE 0 END) AS not_served,
              SUM(CASE WHEN d.status = '${STATUSES.SICK}' THEN 1 ELSE 0 END)      AS sick,
              SUM(CASE WHEN d.status = '${STATUSES.EXCUSED}' THEN 1 ELSE 0 END)   AS excused,
              SUM(CASE WHEN d.status = '${STATUSES.REPLACED}' THEN 1 ELSE 0 END)  AS replaced,
              SUM(CASE WHEN d.status = '${STATUSES.ABSENT}' THEN 1 ELSE 0 END)    AS absent
         FROM students s
         LEFT JOIN duties d ON d.student_id = s.id AND d.duty_date >= ? AND d.duty_date <= ?
        WHERE s.is_active = 1
        GROUP BY s.id, s.first_name, s.last_name
        ORDER BY s.sort_order ASC`,
      [start, end],
    );
    const header = ['Ученик', 'Назначено', 'Дежурил', 'Не дежурил', 'Болел', 'Освобождён', 'Замены', 'Отсутствовал'];
    const lines = [header.join(';')];
    for (const row of rows) {
      lines.push(
        [
          `${row.first_name} ${row.last_name}`,
          Number(row.assigned || 0),
          Number(row.served || 0),
          Number(row.not_served || 0),
          Number(row.sick || 0),
          Number(row.excused || 0),
          Number(row.replaced || 0),
          Number(row.absent || 0),
        ].join(';'),
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="duty-report-${month}.csv"`);
    res.send(`\uFEFF${lines.join('\r\n')}`);
  } catch (error) {
    next(error);
  }
});

export default router;