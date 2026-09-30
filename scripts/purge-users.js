/**
 * Удаление зарегистрированных пользователей.
 *
 *   node scripts/purge-users.js                       показать список
 *   node scripts/purge-users.js --yes                 удалить всех
 *   node scripts/purge-users.js --yes --keep a@b.c    удалить всех, кроме указанных (через запятую)
 *
 * Скрипт работает с той же БД, что и приложение: SQLite из DATABASE_FILE
 * или PostgreSQL из DATABASE_URL. На Vercel достаточно задать DATABASE_URL
 * и выполнить команду — тогда удалятся аккаунты из рабочей базы.
 *
 * Что удаляется: users и их sessions (все активные входы сразу разлогиниваются).
 * Что сохраняется: список учеников (students) — у удалённых учеников просто
 * сбрасывается привязка user_id, чтобы карточки дежурств остались в истории.
 */

import { db } from '../server/db/index.js';
import { config } from '../server/config.js';

const args = process.argv.slice(2);
const confirmed = args.includes('--yes') || args.includes('-y');
const keepArgIndex = args.findIndex((a) => a === '--keep' || a === '-k');
const keepRaw = keepArgIndex === -1 ? '' : args[keepArgIndex + 1] || '';
const keep = keepRaw
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const users = await db.all(
  'select id, first_name, last_name, email, login, role, is_active, created_at from users order by created_at',
);

if (users.length === 0) {
  console.log(`БД (${await db.name()}): пользователей нет — удалять нечего.`);
  await db.close();
  process.exit(0);
}

console.log(`БД: ${await db.name()}${config.databaseUrl ? ' (DATABASE_URL)' : ` (${config.sqliteFile})`}`);
console.log(`Всего пользователей: ${users.length}\n`);

const format = (u) =>
  [
    u.role.padEnd(9),
    (u.login || u.email).padEnd(28),
    `${u.first_name} ${u.last_name}`.padEnd(26),
    `id=${u.id}`,
    `создан=${u.created_at}`,
    u.is_active ? '' : '[неактивен]',
  ]
  .filter(Boolean)
  .join('  ');

const toDelete = users.filter(
  (u) => !keep.includes(String(u.login || u.email).toLowerCase()) && !keep.includes(u.email.toLowerCase()),
);

for (const u of users) console.log(`  ${format(u)}`);

const kept = users.filter((u) => !toDelete.includes(u));
if (kept.length) {
  console.log(`\nСохраняются:`);
  for (const u of kept) console.log(`  ${format(u)}`);
}

if (!confirmed) {
  console.log(`\nНичего не удалено. Повторите с --yes, чтобы удалить ${toDelete.length} аккаунт(ов).`);
  await db.close();
  process.exit(0);
}

if (toDelete.length === 0) {
  console.log('\nУдалять нечего: все пользователи в списке --keep.');
  await db.close();
  process.exit(0);
}

const ids = toDelete.map((u) => u.id);
const placeholders = ids.map(() => '?').join(', ');

await db.transaction(async () => {
  await db.run(`delete from sessions where user_id in (${placeholders})`, ids);
  await db.run(`update students set user_id = null where user_id in (${placeholders})`, ids);
  await db.run(`delete from users where id in (${placeholders})`, ids);
});

console.log(`\nУдалено аккаунтов: ${toDelete.length}`);
for (const u of toDelete) console.log(`  ${u.role}  ${u.login || u.email}`);

if (toDelete.length === users.length) {
  console.log('\nПользователей больше нет: следующая регистрация снова станет куратором'
    + ' (ALLOW_FIRST_KURATOR_BOOTSTRAP=true, иначе потребуется CODE_KURATOR).');
}

await db.close();
