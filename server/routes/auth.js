import express from 'express';
import { db } from '../db/index.js';
import { newId, nowIso } from '../db/migrate.js';
import { config } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  passwordProblems,
  createSession,
  destroySession,
  destroyAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
} from '../lib/auth.js';
import { serializeUser } from '../lib/serialize.js';
import { logAudit } from '../lib/audit.js';
import { str, email as emailField, badRequest, conflict, unauthorized, forbidden } from '../lib/errors.js';
import { ROLES, ROLE_LABELS } from '../lib/constants.js';

const router = express.Router();

const REGISTER_ROLES = [ROLES.STUDENT, ROLES.STAROSTA, ROLES.KURATOR];

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function expectedCode(role) {
  if (role === ROLES.STAROSTA) return normalizeCode(config.codes.starosta);
  if (role === ROLES.KURATOR) return normalizeCode(config.codes.kurator);
  return null;
}

async function hasKurator() {
  const row = await db.get(`SELECT id FROM users WHERE role = ? LIMIT 1`, [ROLES.KURATOR]);
  return Boolean(row);
}

async function getUserById(id) {
  return db.get('SELECT * FROM users WHERE id = ?', [id]);
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * POST /api/auth/register
 * Ученик регистрируется свободно. Староста и куратор — только со специальным кодом.
 */
router.post('/register', async (req, res, next) => {
  try {
    const firstName = str(req.body?.firstName, 'Имя', { min: 2, max: 60 });
    const lastName = str(req.body?.lastName, 'Фамилия', { min: 2, max: 60 });
    const email = emailField(req.body?.email);
    const password = String(req.body?.password || '');
    const role = REGISTER_ROLES.includes(req.body?.role) ? req.body.role : ROLES.STUDENT;

    const problems = passwordProblems(password);
    if (problems.length) throw badRequest(`Пароль: ${problems.join(', ')}`);

    // --- Защита ролей: код обязателен для старосты и куратора ---
    const code = normalizeCode(req.body?.code);
    const need = expectedCode(role);
    if (need) {
      const bootstrap =
        role === ROLES.KURATOR && config.allowFirstKuratorBootstrap && !(await hasKurator());
      if (!bootstrap && code !== need) {
        await logAudit(null, 'auth.register.rejected', {
          entityType: 'user',
          summary: `Отклонена регистрация с ролью «${ROLE_LABELS[role]}» (неверный код)`,
          ip: clientIp(req),
        });
        throw forbidden(
          role === ROLES.KURATOR
            ? 'Для регистрации куратора нужен правильный код доступа'
            : 'Для регистрации старосты нужен правильный код доступа',
        );
      }
    }

    const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (existing) throw conflict('Пользователь с таким email уже зарегистрирован');

    const passwordHash = await hashPassword(password);
    const userId = newId();
    const ts = nowIso();

    const studentId = role === ROLES.KURATOR ? null : newId();
    const orderRow = await db.get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM students');

    await db.transaction(async () => {
      await db.run(
        `INSERT INTO users (id, first_name, last_name, email, login, password_hash, role, student_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [userId, firstName, lastName, email, email, passwordHash, role, studentId, ts, ts],
      );
      if (studentId) {
        await db.run(
          `INSERT INTO students (id, user_id, first_name, last_name, class_name, sort_order, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [studentId, userId, firstName, lastName, null, Number(orderRow?.next || 1), ts, ts],
        );
      }
    });

    const user = await getUserById(userId);
    const session = await createSession(userId, { userAgent: req.get('user-agent'), ip: clientIp(req) });
    setSessionCookie(res, session.id, session.expiresAt);

    await logAudit({ id: userId, first_name: firstName, last_name: lastName, role }, 'auth.register', {
      entityType: 'user',
      entityId: userId,
      summary: `Регистрация: ${firstName} ${lastName} — ${ROLE_LABELS[role]}`,
      ip: clientIp(req),
    });

    res.status(201).json({ user: serializeUser(user), csrfToken: session.csrfToken });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login  (email или логин + пароль)
 */
router.post('/login', async (req, res, next) => {
  try {
    const identifier = str(req.body?.email || req.body?.login, 'Email или логин', { max: 160 });
    const password = String(req.body?.password || '');
    if (!password) throw badRequest('Поле «Пароль» обязательно');

    const user = await db.get(
      `SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(login) = ?`,
      [identifier.toLowerCase(), identifier.toLowerCase()],
    );

    const genericError = () => unauthorized('Неверный email/логин или пароль');
    if (!user) {
      await hashPassword(password); // защита от тайминг-атак по существованию email
      throw genericError();
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await logAudit({ id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role },
        'auth.login.failed', { entityType: 'user', entityId: user.id, summary: 'Неудачная попытка входа', ip: clientIp(req) });
      throw genericError();
    }
    if (!user.is_active) throw forbidden('Учётная запись отключена');

    await db.run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), user.id]);
    const session = await createSession(user.id, { userAgent: req.get('user-agent'), ip: clientIp(req) });
    setSessionCookie(res, session.id, session.expiresAt);

    await logAudit({ id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role },
      'auth.login', { entityType: 'user', entityId: user.id, summary: 'Вход в систему', ip: clientIp(req) });

    res.json({ user: serializeUser(user), csrfToken: session.csrfToken });
  } catch (error) {
    next(error);
  }
});

/** POST /api/auth/logout */
router.post('/logout', async (req, res, next) => {
  try {
    const sessionId = req.session?.sessionId;
    if (sessionId) {
      await destroySession(sessionId);
      await logAudit(req, 'auth.logout', { summary: 'Выход из системы', ip: clientIp(req) });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/** GET /api/auth/me — всегда 200, user может быть null. */
router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) return res.json({ user: null, authenticated: false, csrfToken: null });
    const user = await getUserById(req.user.id);
    res.json({ user: serializeUser(user), authenticated: true, csrfToken: req.session.csrfToken });
  } catch (error) {
    next(error);
  }
});

/** GET /api/auth/csrf — выдаёт CSRF-токен текущей сессии. */
router.get('/csrf', async (req, res, next) => {
  try {
    if (!req.session) {
      return res.json({ authenticated: false, csrfToken: null });
    }
    res.json({ authenticated: true, csrfToken: req.session.csrfToken });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/auth/password — смена собственного пароля. */
router.patch('/password', async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!newPassword) throw badRequest('Поле «Новый пароль» обязательно');
    const problems = passwordProblems(newPassword);
    if (problems.length) throw badRequest(`Пароль: ${problems.join(', ')}`);

    const user = await getUserById(req.user.id);
    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) throw badRequest('Текущий пароль указан неверно');

    const hash = await hashPassword(newPassword);
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), user.id]);
    await destroyAllUserSessions(user.id);
    const session = await createSession(user.id, { userAgent: req.get('user-agent'), ip: clientIp(req) });
    setSessionCookie(res, session.id, session.expiresAt);

    await logAudit(req, 'auth.password_changed', { entityType: 'user', entityId: user.id, summary: 'Пароль изменён' });
    res.json({ ok: true, csrfToken: session.csrfToken });
  } catch (error) {
    next(error);
  }
});

/** GET /api/auth/config — публичная информация для формы регистрации. */
router.get('/config', async (req, res, next) => {
  try {
    const kuratorExists = await hasKurator();
    res.json({
      roles: REGISTER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role], requiresCode: role !== ROLES.STUDENT })),
      needsCodes: {
        starosta: REGISTER_ROLES.includes(ROLES.STAROSTA),
        kurator: REGISTER_ROLES.includes(ROLES.KURATOR),
      },
      firstKuratorBootstrap: !kuratorExists && config.allowFirstKuratorBootstrap,
    });
  } catch (error) {
    next(error);
  }
});

export default router;