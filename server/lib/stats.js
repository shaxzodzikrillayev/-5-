import { db } from '../db/index.js';
import { STATUSES } from './constants.js';

const STAT_SQL = `
  SELECT student_id,
         COUNT(*) AS assigned,
         SUM(CASE WHEN status = '${STATUSES.SERVED}' THEN 1 ELSE 0 END)    AS served,
         SUM(CASE WHEN status = '${STATUSES.NOT_SERVED}' THEN 1 ELSE 0 END) AS not_served,
         SUM(CASE WHEN status = '${STATUSES.SICK}' THEN 1 ELSE 0 END)      AS sick,
         SUM(CASE WHEN status = '${STATUSES.EXCUSED}' THEN 1 ELSE 0 END)   AS excused,
         SUM(CASE WHEN status = '${STATUSES.REPLACED}' THEN 1 ELSE 0 END)  AS replaced,
         SUM(CASE WHEN status = '${STATUSES.ABSENT}' THEN 1 ELSE 0 END)    AS absent,
         SUM(CASE WHEN status = '${STATUSES.SCHEDULED}' THEN 1 ELSE 0 END) AS scheduled
    FROM duties
   GROUP BY student_id`;

function emptyStats() {
  return {
    assigned: 0, served: 0, not_served: 0, sick: 0, excused: 0, replaced: 0, absent: 0, scheduled: 0,
  };
}

function toStats(row) {
  if (!row) return emptyStats();
  const stats = emptyStats();
  for (const key of Object.keys(stats)) {
    if (row[key] !== undefined && row[key] !== null) stats[key] = Number(row[key]);
  }
  stats.completed = stats.served;
  stats.failed = stats.not_served + stats.absent;
  stats.attendanceRate = stats.assigned ? Math.round((stats.served / stats.assigned) * 100) : 0;
  return stats;
}

/** Карта статистики "studentId -> stats" по всем дежурствам. */
export async function loadStatsMap() {
  const rows = await db.all(STAT_SQL);
  const map = new Map();
  for (const row of rows) map.set(row.student_id, toStats(row));
  return map;
}

/** Статистика по конкретному ученику (опционально ограничена периодом). */
export async function loadStatsFor(studentId, { from = null, to = null } = {}) {
  const params = [studentId];
  let sql = `SELECT COUNT(*) AS assigned,
                    SUM(CASE WHEN status = '${STATUSES.SERVED}' THEN 1 ELSE 0 END)    AS served,
                    SUM(CASE WHEN status = '${STATUSES.NOT_SERVED}' THEN 1 ELSE 0 END) AS not_served,
                    SUM(CASE WHEN status = '${STATUSES.SICK}' THEN 1 ELSE 0 END)      AS sick,
                    SUM(CASE WHEN status = '${STATUSES.EXCUSED}' THEN 1 ELSE 0 END)   AS excused,
                    SUM(CASE WHEN status = '${STATUSES.REPLACED}' THEN 1 ELSE 0 END)  AS replaced,
                    SUM(CASE WHEN status = '${STATUSES.ABSENT}' THEN 1 ELSE 0 END)    AS absent,
                    SUM(CASE WHEN status = '${STATUSES.SCHEDULED}' THEN 1 ELSE 0 END) AS scheduled
               FROM duties WHERE student_id = ?`;
  if (from) {
    sql += ' AND duty_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND duty_date <= ?';
    params.push(to);
  }
  const row = await db.get(sql, params);
  return toStats(row);
}

export { toStats, emptyStats };