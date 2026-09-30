import { db } from './index.js';
import { newId, nowIso, runMigrations, getSetting, setSetting } from './migrate.js';
import { hashPassword } from '../lib/auth.js';
import { ROLES } from '../lib/constants.js';
import { config } from '../config.js';
import {
  todayISO, addDays, listDays, monthBounds, isWeekend, formatMonthHuman,
} from '../lib/dates.js';

/**
 * Демо-данные: реальный рабочий класс, куратор, староста, ученики,
 * расписание за 6 недель (назад) + 3 недели вперёд и проставленные статусы.
 */

const KURATOR = { firstName: 'Нурбек', lastName: 'Рахимов', email: 'kurator@school.uz', password: 'kurator123', role: ROLES.KURATOR };
const STAROSTA = { firstName: 'Шахзод', lastName: 'Зикриллаев', email: 'starosta@school.uz', password: 'starosta123', role: ROLES.STAROSTA };

const STUDENTS = [
  ['Шахзод', 'Зикриллаев'],
  ['Дильфуза', 'Расулова'],
  ['Бекзод', 'Нурматов'],
  ['Азиза', 'Тухтаева'],
  ['Жасур', 'Отажонов'],
  ['Мадина', 'Юсупова'],
  ['Олим', 'Салихов'],
  ['Сарвиноза', 'Ибрагимова'],
  ['Имрон', 'Тўраев'],
  ['Камила', 'Рустамова'],
  ['Бекдор', 'Алимов'],
  ['Зилола', 'Хамидова'],
  ['Санжар', 'Эшонов'],
  ['Нилуфар', 'Каримова'],
  ['Рустам', 'Усманов'],
  ['Дилара', 'Сафарова'],
  ['Абдулло', 'Мирзаев'],
  ['Шоҳруҳ', 'Беков'],
].map(([firstName, lastName], index) => ({
  firstName,
  lastName,
  email: `student${index + 1}@school.uz`,
  password: 'student123',
  sortOrder: index + 1,
}));

const COMMENTS = {
  not_served: ['Не пришёл на дежурство', 'Опоздал на 20 минут', 'Забыл про дежурство'],
  sick: ['Болел, справка', 'Температура, не пришёл', 'Болел'],
  excused: ['Освобождён по заявлению', 'Участие в олимпиаде', 'Секретарь на собрании'],
  absent: ['Не пришёл, предупредил', 'Отсутствовал без причины'],
};

const REASONS = ['Заболел', 'Освобождён', 'Контрольная работа', 'Участник олимпиады', 'Пропуск по семейным обстоятельствам'];

async function existingUsers() {
  return Number((await db.get('SELECT COUNT(*) AS n FROM users'))?.n || 0);
}

export async function seed({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  await runMigrations();

  const already = await existingUsers();
  if (already > 0 && !process.argv.includes('--force')) {
    log(`[seed] в базе уже есть пользователи (${already}). Пропускаю. Для пересоздания: npm run db:reset`);
    return { skipped: true };
  }

  const ts = nowIso();

  // --- Настройки класса ---
  await setSetting('class_name', (await getSetting('class_name', '')) || '10 «А»');
  await setSetting('class_city', (await getSetting('class_city', '')) || 'Ташкент');

  const accounts = [KURATOR, STAROSTA, ...STUDENTS];
  const userIdByEmail = new Map();
  const studentIdByEmail = new Map();

  log('[seed] создание пользователей...');
  for (const account of accounts) {
    const existing = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [account.email.toLowerCase()]);
    if (existing) {
      userIdByEmail.set(account.email.toLowerCase(), existing.id);
      if (existing.student_id) studentIdByEmail.set(account.email.toLowerCase(), existing.student_id);
      continue;
    }
    const userId = newId();
    const isKurator = account.role === ROLES.KURATOR;
    const studentId = isKurator ? null : newId();
    const hash = await hashPassword(account.password);

    await db.run(
      `INSERT INTO users (id, first_name, last_name, email, login, password_hash, role, student_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [userId, account.firstName, account.lastName, account.email.toLowerCase(), account.email.toLowerCase(),
        hash, account.role || ROLES.STUDENT, studentId, ts, ts],
    );
    userIdByEmail.set(account.email.toLowerCase(), userId);

    if (studentId) {
      await db.run(
        `INSERT INTO students (id, user_id, first_name, last_name, class_name, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [studentId, userId, account.firstName, account.lastName, '10 «А»', account.sortOrder || 0, ts, ts],
      );
      studentIdByEmail.set(account.email.toLowerCase(), studentId);
    }
  }

  const students = await db.all('SELECT * FROM students WHERE is_active = 1 ORDER BY sort_order ASC');
  if (!students.length) {
    log('[seed] нет учеников — нечего заполнять');
    return { skipped: true };
  }

  const starostaUserId = userIdByEmail.get(STAROSTA.email.toLowerCase());
  const kuratorUserId = userIdByEmail.get(KURATOR.email.toLowerCase());

  // --- Расписание и статусы ---
  const today = todayISO();
  const from = addDays(today, -42);
  const to = addDays(today, 21);
  const days = listDays(from, to).filter((d) => !isWeekend(d));

  log(`[seed] расписание с ${from} по ${to} (${days.length} дней, по 2 дежурных)...`);

  let cursor = 0;
  let createdDuties = 0;
  let replacements = 0;

  for (const date of days) {
    for (let k = 0; k < 2; k += 1) {
      const student = students[cursor % students.length];
      cursor += 1;
      const dutyId = newId();
      const isPast = date < today;
      const isToday = date === today;

      let status = 'scheduled';
      if (isPast) {
        const roll = Math.random();
        if (roll < 0.78) status = 'served';
        else if (roll < 0.86) status = 'not_served';
        else if (roll < 0.93) status = 'sick';
        else if (roll < 0.97) status = 'excused';
        else status = 'absent';
      } else if (isToday) {
        status = Math.random() < 0.5 ? 'served' : 'scheduled';
      }

      const comment = COMMENTS[status] ? COMMENTS[status][Math.floor(Math.random() * COMMENTS[status].length)] : null;
      const createdAt = `${date}T07:${String(10 + k).padStart(2, '0')}:00.000Z`;

      await db.run(
        `INSERT INTO duties (id, duty_date, student_id, status, comment, assigned_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [dutyId, date, student.id, status, comment, starostaUserId, createdAt, createdAt],
      );
      await db.run(
        `INSERT INTO duty_records (id, duty_id, student_id, duty_date, status, comment, changed_by, changed_by_role, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'schedule', ?)`,
        [newId(), dutyId, student.id, date, status, comment, starostaUserId, ROLES.STAROSTA, createdAt],
      );
      if (isPast || isToday) {
        await db.run(
          `INSERT INTO duty_records (id, duty_id, student_id, duty_date, status, comment, changed_by, changed_by_role, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
          [newId(), dutyId, student.id, date, status, comment, starostaUserId, ROLES.STAROSTA, `${date}T13:20:00.000Z`],
        );
      }
      createdDuties += 1;
    }
  }

  // --- Замены на прошедших днях ---
  log('[seed] оформление замен...');
  const pastDuties = await db.all(
    `SELECT * FROM duties WHERE duty_date < ? AND status = 'not_served' ORDER BY duty_date DESC LIMIT 6`,
    [today],
  );
  for (const duty of pastDuties) {
    const candidates = students.filter((s) => s.id !== duty.student_id);
    const replacement = candidates[Math.floor(Math.random() * candidates.length)];
    const alreadyBusy = await db.get('SELECT id FROM duties WHERE duty_date = ? AND student_id = ?', [duty.duty_date, replacement.id]);
    if (alreadyBusy) continue;
    const reason = REASONS[Math.floor(Math.random() * REASONS.length)];
    const createdAt = `${duty.duty_date}T09:00:00.000Z`;

    await db.run(
      `INSERT INTO replacements (id, duty_id, duty_date, original_student_id, replacement_student_id, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), duty.id, duty.duty_date, duty.student_id, replacement.id, reason, starostaUserId, createdAt],
    );
    await db.run('UPDATE duties SET status = ?, comment = ?, updated_at = ? WHERE id = ?',
      ['replaced', `Замена: ${reason}`, createdAt, duty.id]);
    await db.run(
      `INSERT INTO duty_records (id, duty_id, student_id, duty_date, status, comment, changed_by, changed_by_role, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'replacement', ?)`,
      [newId(), duty.id, duty.student_id, duty.duty_date, 'replaced', `Замена: ${reason}`, starostaUserId, ROLES.STAROSTA, createdAt],
    );
    const newDutyId = newId();
    await db.run(
      `INSERT INTO duties (id, duty_date, student_id, status, comment, assigned_by, created_at, updated_at)
       VALUES (?, ?, ?, 'served', ?, ?, ?, ?)`,
      [newDutyId, duty.duty_date, replacement.id, `Дежурил вместо (замена: ${reason})`, starostaUserId, createdAt, createdAt],
    );
    await db.run(
      `INSERT INTO duty_records (id, duty_id, student_id, duty_date, status, comment, changed_by, changed_by_role, source, created_at)
       VALUES (?, ?, ?, ?, 'served', ?, ?, ?, 'replacement', ?)`,
      [newId(), newDutyId, replacement.id, duty.duty_date, `Дежурил вместо (замена: ${reason})`,
        starostaUserId, ROLES.STAROSTA, createdAt],
    );
    replacements += 1;
  }

  // --- Журнал изменений ---
  log('[seed] журнал изменений...');
  const auditSamples = [
    { action: 'duty.status.served', entityType: 'duty', summary: `${STAROSTA.firstName} ${STAROSTA.lastName} изменил статус (Дильфуза Расулова): «Не дежурил» → «Дежурил»`, before: { status: 'not_served' }, after: { status: 'served' }, daysAgo: 0 },
    { action: 'duty.status.sick', entityType: 'duty', summary: `${STAROSTA.firstName} ${STAROSTA.lastName} изменил статус (Бекзод Нурматов): «Не дежурил» → «Болел»`, before: { status: 'not_served' }, after: { status: 'sick' }, daysAgo: 1 },
    { action: 'replacement.created', entityType: 'replacement', summary: `${STAROSTA.firstName} ${STAROSTA.lastName} добавил замену: вместо Олим Салихов дежурит Камила Рустамова`, before: { status: 'not_served' }, after: { status: 'replaced' }, daysAgo: 2 },
    { action: 'duty.created', entityType: 'duty', summary: `${KURATOR.firstName} ${KURATOR.lastName} назначил дежурным: Азиза Тухтаева`, before: null, after: { status: 'scheduled' }, daysAgo: 3 },
    { action: 'student.created', entityType: 'student', summary: `${KURATOR.firstName} ${KURATOR.lastName} добавил ученика: Рустам Усманов`, before: null, after: null, daysAgo: 12 },
    { action: 'duty.status.excused', entityType: 'duty', summary: `${STAROSTA.firstName} ${STAROSTA.lastName} изменил статус (Сарвиноза Ибрагимова): «Не дежурил» → «Освобождён» — комментарий: «Освобождён по заявлению»`, before: { status: 'not_served' }, after: { status: 'excused' }, daysAgo: 5 },
  ];
  for (const sample of auditSamples) {
    const actorIsKurator = sample.action === 'duty.created' || sample.action === 'student.created';
    await db.run(
      `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, before_json, after_json, comment, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        actorIsKurator ? kuratorUserId : starostaUserId,
        actorIsKurator ? `${KURATOR.firstName} ${KURATOR.lastName}` : `${STAROSTA.firstName} ${STAROSTA.lastName}`,
        actorIsKurator ? ROLES.KURATOR : ROLES.STAROSTA,
        sample.action,
        sample.entityType,
        newId(),
        sample.summary,
        sample.before ? JSON.stringify(sample.before) : null,
        sample.after ? JSON.stringify(sample.after) : null,
        null,
        '127.0.0.1',
        new Date(Date.now() - sample.daysAgo * 86400000 - Math.floor(Math.random() * 8) * 3600000).toISOString(),
      ],
    );
  }

  const month = formatMonthHuman(today.slice(0, 7));
  log('');
  log('[seed] готово:');
  log(`  Учеников:  ${students.length}`);
  log(`  Дежурств:  ${createdDuties}`);
  log(`  Замен:     ${replacements}`);
  log(`  Месяц:     ${month}`);
  log('');
  log('  Учётные записи:');
  log(`    Куратор:  ${KURATOR.email} / ${KURATOR.password}`);
  log(`    Староста: ${STAROSTA.email} / ${STAROSTA.password}`);
  log(`    Ученик:   ${STUDENTS[1].email} / ${STUDENTS[1].password}`);
  log('');

  return { students: students.length, createdDuties, replacements };
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  try {
    await seed();
  } finally {
    await db.close();
  }
}