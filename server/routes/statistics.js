import express from 'express';
import { db } from '../db/index.js';
import { STATUSES, statusMeta, MARKABLE_STATUSES } from '../lib/constants.js';
import { requireAuth } from '../middleware.js';
import { todayISO, isDateString, isMonthString, weekBounds, monthBounds, addDays } from '../lib/dates.js';
import { loadStatsMap } from '../lib/stats.js';

const router = express.Router();
router.use(requireAuth);

function countsFromRows(rows) {
  const counts = { total: rows.length, scheduled: 0, served: 0, not_served: 0, sick: 0, excused: 0, replaced: 0, absent: 0 };
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status] += 1;
  }
  counts.failed = counts.not_served + counts.absent;
  counts.attendanceRate = counts.total ? Math.round((counts.served / counts.total) * 100) : 0;
  return counts;
}

async function countsInRange(from, to) {
  const rows = await db.all(
    `SELECT duty_date, status FROM duties WHERE duty_date >= ? AND duty_date <= ?`,
    [from, to],
  );
  return countsFromRows(rows);
}

function breakdown(counts) {
  // «Назначено» тоже показываем: иначе график пустой сразу после генерации расписания.
  return ['scheduled', ...MARKABLE_STATUSES]
    .map((status) => ({
      status,
      label: statusMeta(status).label,
      color: statusMeta(status).color,
      count: counts[status] || 0,
    }))
    .filter((item) => item.count > 0);
}

/**
 * GET /api/statistics
 * Сводка: сегодня / неделя / месяц + динамика по дням + рейтинг учеников.
 */
router.get('/', async (req, res, next) => {
  try {
    const date = isDateString(req.query.date || '') ? String(req.query.date) : todayISO();
    const month = isMonthString(req.query.month || '') ? String(req.query.month) : date.slice(0, 7);
    const week = weekBounds(date);
    const monthRange = monthBounds(month);

    const [todayCounts, weekCounts, monthCounts] = await Promise.all([
      countsInRange(date, date),
      countsInRange(week.start, week.end),
      countsInRange(monthRange.start, monthRange.end),
    ]);

    // Динамика по дням месяца (для графика).
    const dailyRows = await db.all(
      'SELECT duty_date, status FROM duties WHERE duty_date >= ? AND duty_date <= ? ORDER BY duty_date ASC',
      [monthRange.start, monthRange.end],
    );
    const dailyMap = new Map();
    for (const row of dailyRows) {
      if (!dailyMap.has(row.duty_date)) {
        dailyMap.set(row.duty_date, {
          date: row.duty_date,
          total: 0, scheduled: 0, served: 0, not_served: 0, sick: 0, excused: 0, replaced: 0, absent: 0,
        });
      }
      const bucket = dailyMap.get(row.duty_date);
      bucket.total += 1;
      if (bucket[row.status] !== undefined) bucket[row.status] += 1;
    }
    const series = Array.from(dailyMap.values()).map((b) => ({
      ...b,
      failed: b.not_served + b.absent,
    }));

    // Недельная динамика за последние 8 недель.
    const weekly = [];
    for (let i = 7; i >= 0; i -= 1) {
      const start = addDays(week.start, -7 * i);
      const end = addDays(start, 6);
      const rows = await db.all('SELECT status FROM duties WHERE duty_date >= ? AND duty_date <= ?', [start, end]);
      const c = countsFromRows(rows);
      weekly.push({ start, end, total: c.total, served: c.served, failed: c.failed, sick: c.sick, replaced: c.replaced });
    }

    // Рейтинг учеников за месяц.
    const monthParams = [monthRange.start, monthRange.end];
    const studentRows = await db.all(
      `SELECT s.id, s.first_name, s.last_name,
              COUNT(d.id) AS assigned,
              SUM(CASE WHEN d.status = '${STATUSES.SERVED}' THEN 1 ELSE 0 END)    AS served,
              SUM(CASE WHEN d.status = '${STATUSES.NOT_SERVED}' THEN 1 ELSE 0 END) AS not_served,
              SUM(CASE WHEN d.status = '${STATUSES.SICK}' THEN 1 ELSE 0 END)      AS sick,
              SUM(CASE WHEN d.status = '${STATUSES.REPLACED}' THEN 1 ELSE 0 END)  AS replaced
         FROM students s
         LEFT JOIN duties d ON d.student_id = s.id AND d.duty_date >= ? AND d.duty_date <= ?
        WHERE s.is_active = 1
        GROUP BY s.id, s.first_name, s.last_name
        ORDER BY assigned DESC, s.sort_order ASC`,
      monthParams,
    );

    const overallStats = await loadStatsMap();

    res.json({
      date,
      month,
      ranges: {
        week: { start: week.start, end: week.end },
        month: { start: monthRange.start, end: monthRange.end },
      },
      today: { ...todayCounts, breakdown: breakdown(todayCounts) },
      week: { ...weekCounts, breakdown: breakdown(weekCounts) },
      month: { ...monthCounts, breakdown: breakdown(monthCounts) },
      series,
      weekly,
      students: studentRows.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: `${row.first_name} ${row.last_name}`,
        initials: `${row.first_name?.[0] || ''}${row.last_name?.[0] || ''}`.toUpperCase(),
        assigned: Number(row.assigned || 0),
        served: Number(row.served || 0),
        notServed: Number(row.not_served || 0),
        sick: Number(row.sick || 0),
        replaced: Number(row.replaced || 0),
        attendanceRate: row.assigned ? Math.round((Number(row.served) / Number(row.assigned)) * 100) : 0,
        total: overallStats.get(row.id) || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
export { countsFromRows, countsInRange };