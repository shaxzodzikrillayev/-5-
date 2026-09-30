import express from 'express';
import { db } from '../db/index.js';
import { newId, nowIso } from '../db/migrate.js';
import { serializeStudent } from '../lib/serialize.js';
import { loadStatsMap, loadStatsFor, emptyStats } from '../lib/stats.js';
import { logAudit } from '../lib/audit.js';
import { str, badRequest, notFound, forbidden } from '../lib/errors.js';
import { requireAuth, requireManager, requireKurator } from '../middleware.js';
import { isDateString } from '../lib/dates.js';

const router = express.Router();
router.use(requireAuth);

/** GET /api/students — список учеников класса со статистикой. */
router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true' && req.user.role !== 'student';
    const where = includeInactive ? '' : 'WHERE s.is_active = 1';
    const rows = await db.all(
      `SELECT s.* FROM students s ${where} ORDER BY s.sort_order ASC, s.last_name ASC, s.first_name ASC`,
    );
    const statsMap = await loadStatsMap();
    const today = req.query.today ? String(req.query.today) : null;

    let todayMap = new Map();
    if (isDateString(today || '')) {
      const todayRows = await db.all('SELECT * FROM duties WHERE duty_date = ?', [today]);
      todayMap = new Map(todayRows.map((d) => [d.student_id, d]));
    }

    res.json({
      students: rows.map((row) =>
        serializeStudent(row, {
          stats: statsMap.get(row.id) || emptyStats(),
          today: todayMap.get(row.id)
            ? {
                id: todayMap.get(row.id).id,
                date: todayMap.get(row.id).duty_date,
                status: todayMap.get(row.id).status,
                comment: todayMap.get(row.id).comment,
              }
            : null,
        }),
      ),
      total: rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/** GET /api/students/:id — карточка ученика. */
router.get('/:id', async (req, res, next) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) throw notFound('Ученик не найден');
    if (!student.is_active && req.user.role === 'student' && student.user_id !== req.user.id) {
      throw notFound('Ученик не найден');
    }
    const stats = await loadStatsFor(student.id);
    res.json({ student: serializeStudent(student, { stats }) });
  } catch (error) {
    next(error);
  }
});

/** GET /api/students/:id/history — подробная история дежурств ученика. */
router.get('/:id/history', async (req, res, next) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) throw notFound('Ученик не найден');

    const limit = Math.min(Number(req.query.limit) || 400, 1000);
    const params = [student.id];
    let where = 'WHERE (d.student_id = ? OR r.original_student_id = ? OR r.replacement_student_id = ?)';
    params.push(student.id, student.id);

    if (isDateString(req.query.from || '')) {
      where += ' AND d.duty_date >= ?';
      params.push(req.query.from);
    }
    if (isDateString(req.query.to || '')) {
      where += ' AND d.duty_date <= ?';
      params.push(req.query.to);
    }

    const rows = await db.all(
      `SELECT d.id, d.duty_date, d.status, d.comment, d.updated_at,
              u.first_name AS student_name,
              rp.first_name AS replacement_first, rp.last_name AS replacement_last,
              r.reason AS replacement_reason
         FROM duties d
         JOIN students u ON u.id = d.student_id
         LEFT JOIN replacements r ON r.duty_id = d.id
         LEFT JOIN students rp ON rp.id = r.replacement_student_id
        ${where}
        ORDER BY d.duty_date DESC, d.created_at DESC
        LIMIT ?`,
      [...params, limit],
    );

    const history = rows.map((row) => ({
      id: row.id,
      date: row.duty_date,
      status: row.status,
      comment: row.comment,
      updatedAt: row.updated_at,
      replacement: row.replacement_first
        ? {
            id: null,
            name: `${row.replacement_first} ${row.replacement_last}`,
            reason: row.replacement_reason || null,
          }
        : null,
    }));

    const stats = await loadStatsFor(student.id);
    const records = await db.all(
      `SELECT dr.*, u.first_name AS changed_first, u.last_name AS changed_last
         FROM duty_records dr
         LEFT JOIN users u ON u.id = dr.changed_by
        WHERE dr.student_id = ?
        ORDER BY dr.created_at DESC
        LIMIT ?`,
      [student.id, Math.min(limit, 300)],
    );

    res.json({
      student: serializeStudent(student, { stats }),
      history,
      changes: records.map((row) => ({
        id: row.id,
        dutyId: row.duty_id,
        date: row.duty_date,
        status: row.status,
        comment: row.comment,
        source: row.source,
        changedBy: row.changed_first ? `${row.changed_first} ${row.changed_last}` : 'Система',
        changedAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/** POST /api/students — создать ученика (староста/куратор). */
router.post('/', requireManager, async (req, res, next) => {
  try {
    const firstName = str(req.body?.firstName, 'Имя', { min: 2, max: 60 });
    const lastName = str(req.body?.lastName, 'Фамилия', { min: 2, max: 60 });
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
    const password = req.body?.password ? String(req.body.password) : null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest('Некорректный email');
    if (password && password.length < 6) throw badRequest('Пароль: минимум 6 символов');

    if (email) {
      const existingUser = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
      if (existingUser) throw badRequest('Пользователь с таким email уже зарегистрирован');
    }

    const orderRow = await db.get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM students');
    const studentId = newId();
    const ts = nowIso();
    let userId = null;

    await db.transaction(async () => {
      if (email && password) {
        const { hashPassword } = await import('../lib/auth.js');
        userId = newId();
        await db.run(
          `INSERT INTO users (id, first_name, last_name, email, login, password_hash, role, student_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'student', ?, 1, ?, ?)`,
          [userId, firstName, lastName, email, email, await hashPassword(password), studentId, ts, ts],
        );
      }
      await db.run(
        `INSERT INTO students (id, user_id, first_name, last_name, class_name, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [studentId, userId, firstName, lastName, req.body?.className ? String(req.body.className) : null,
          Number(orderRow?.next || 1), ts, ts],
      );
    });

    await logAudit(req, 'student.created', {
      entityType: 'student',
      entityId: studentId,
      summary: `Добавлен ученик: ${firstName} ${lastName}`,
      after: { firstName, lastName, email },
    });

    const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
    res.status(201).json({ student: serializeStudent(student) });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/students/:id — изменить данные ученика. */
router.patch('/:id', requireManager, async (req, res, next) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) throw notFound('Ученик не найден');

    const firstName = req.body?.firstName !== undefined ? str(req.body.firstName, 'Имя', { min: 2, max: 60 }) : student.first_name;
    const lastName = req.body?.lastName !== undefined ? str(req.body.lastName, 'Фамилия', { min: 2, max: 60 }) : student.last_name;
    const isActive = req.body?.isActive !== undefined ? (req.body.isActive ? 1 : 0) : student.is_active;
    const className =
      req.body?.className !== undefined ? (req.body.className ? String(req.body.className) : null) : student.class_name;
    const sortOrder = req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) || 0 : student.sort_order;

    if (!isActive && req.user.role !== 'kurator') throw forbidden('Деактивировать ученика может только куратор');

    await db.transaction(async () => {
      await db.run(
        `UPDATE students SET first_name = ?, last_name = ?, is_active = ?, class_name = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        [firstName, lastName, isActive, className, sortOrder, nowIso(), student.id],
      );
      if (student.user_id) {
        await db.run('UPDATE users SET first_name = ?, last_name = ?, is_active = ?, updated_at = ? WHERE id = ?',
          [firstName, lastName, isActive, nowIso(), student.user_id]);
      }
    });

    await logAudit(req, 'student.updated', {
      entityType: 'student',
      entityId: student.id,
      summary: `Изменён ученик: ${firstName} ${lastName}`,
      before: { firstName: student.first_name, lastName: student.last_name, isActive: Boolean(student.is_active) },
      after: { firstName, lastName, isActive: Boolean(isActive) },
    });

    const updated = await db.get('SELECT * FROM students WHERE id = ?', [student.id]);
    res.json({ student: serializeStudent(updated) });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/students/:id — мягкое удаление (требуется подтверждение). */
router.delete('/:id', requireKurator, async (req, res, next) => {
  try {
    if (req.body?.confirm !== true && req.query.confirm !== 'true') {
      throw badRequest('Удаление требует подтверждения (confirm: true)');
    }
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) throw notFound('Ученик не найден');

    const dutiesCount = await db.get('SELECT COUNT(*) AS n FROM duties WHERE student_id = ?', [student.id]);
    const historyKept = Number(dutiesCount?.n || 0) > 0;

    await db.transaction(async () => {
      await db.run('UPDATE students SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), student.id]);
      if (student.user_id) {
        await db.run('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), student.user_id]);
      }
    });

    await logAudit(req, 'student.archived', {
      entityType: 'student',
      entityId: student.id,
      summary: `Ученик архивирован: ${student.first_name} ${student.last_name}. История дежурств сохранена (${historyKept ? dutiesCount.n : 0}).`,
      before: { firstName: student.first_name, lastName: student.last_name, isActive: true },
      after: { isActive: false },
    });

    res.json({ ok: true, historyKept });
  } catch (error) {
    next(error);
  }
});

/** POST /api/students/:id/restore — вернуть ученика (куратор). */
router.post('/:id/restore', requireKurator, async (req, res, next) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) throw notFound('Ученик не найден');
    await db.transaction(async () => {
      await db.run('UPDATE students SET is_active = 1, updated_at = ? WHERE id = ?', [nowIso(), student.id]);
      if (student.user_id) {
        await db.run('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?', [nowIso(), student.user_id]);
      }
    });
    await logAudit(req, 'student.restored', {
      entityType: 'student', entityId: student.id,
      summary: `Ученик восстановлен: ${student.first_name} ${student.last_name}`,
    });
    const updated = await db.get('SELECT * FROM students WHERE id = ?', [student.id]);
    res.json({ student: serializeStudent(updated) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/students/:id/link — привязать существующего пользователя к карточке ученика. */
router.post('/:id/link', requireManager, async (req, res, next) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) throw notFound('Ученик не найден');
    if (student.user_id) throw badRequest('Карточка уже привязана к пользователю');
    const email = str(req.body?.email, 'Email', { max: 160 }).toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [email]);
    if (!user) throw notFound('Пользователь с таким email не найден');
    if (user.student_id) throw badRequest('Пользователь уже привязан к другому ученику');

    await db.transaction(async () => {
      await db.run('UPDATE students SET user_id = ?, updated_at = ? WHERE id = ?', [user.id, nowIso(), student.id]);
      await db.run('UPDATE users SET student_id = ?, updated_at = ? WHERE id = ?', [student.id, nowIso(), user.id]);
    });
    await logAudit(req, 'student.linked', {
      entityType: 'student', entityId: student.id,
      summary: `${student.first_name} ${student.last_name} привязан к аккаунту ${email}`,
    });
    const updated = await db.get('SELECT * FROM students WHERE id = ?', [student.id]);
    res.json({ student: serializeStudent(updated) });
  } catch (error) {
    next(error);
  }
});

export default router;
