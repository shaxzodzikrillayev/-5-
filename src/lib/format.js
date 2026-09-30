export const STATUSES = {
  scheduled: 'scheduled',
  served: 'served',
  not_served: 'not_served',
  sick: 'sick',
  excused: 'excused',
  replaced: 'replaced',
  absent: 'absent',
};

export const STATUS_META = {
  scheduled: { label: 'Назначено', emoji: '📌', color: '#94a3b8' },
  served: { label: 'Дежурил', emoji: '🟢', color: '#16a34a' },
  not_served: { label: 'Не дежурил', emoji: '🔴', color: '#dc2626' },
  sick: { label: 'Болел', emoji: '🟡', color: '#f59e0b' },
  excused: { label: 'Освобождён', emoji: '🔵', color: '#2563eb' },
  replaced: { label: 'Замена', emoji: '🟣', color: '#9333ea' },
  absent: { label: 'Отсутствовал', emoji: '⚫', color: '#475569' },
};

/** Статусы, доступные для выставления старостой/куратором (в порядке отображения). */
export const MARKABLE_STATUSES = ['served', 'not_served', 'sick', 'excused', 'replaced', 'absent'];

export const ROLES = { student: 'student', starosta: 'starosta', kurator: 'kurator' };

export const ROLE_META = {
  student: { label: 'Ученик', emoji: '🎒', badge: 'badge-role-student' },
  starosta: { label: 'Староста', emoji: '⭐', badge: 'badge-role-starosta' },
  kurator: { label: 'Куратор', emoji: '🧑‍🏫', badge: 'badge-role-kurator' },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.scheduled;
}

export function roleMeta(role) {
  return ROLE_META[role] || ROLE_META.student;
}

const MONTHS_GEN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_ACC = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function parseDate(dateISO) {
  return new Date(`${dateISO}T00:00:00`);
}

/** Локальный YYYY-MM-DD (без сдвига часового пояса, в отличие от toISOString). */
function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toLocalISO(new Date());
}

export function addDays(dateISO, days) {
  const d = parseDate(dateISO);
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

export function currentMonthISO() {
  return todayISO().slice(0, 7);
}

export function monthBounds(monthISO) {
  const [year, month] = monthISO.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  return {
    start: `${monthISO}-01`,
    end: `${monthISO}-${String(days).padStart(2, '0')}`,
    days,
  };
}

export function shiftMonth(monthISO, delta) {
  const [year, month] = monthISO.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDate(dateISO) {
  if (!dateISO) return '';
  const d = parseDate(dateISO);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(dateISO) {
  if (!dateISO) return '';
  const d = parseDate(dateISO);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDateWithWeekday(dateISO) {
  if (!dateISO) return '';
  const d = parseDate(dateISO);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
}

export function formatMonth(monthISO) {
  if (!monthISO) return '';
  const [year, month] = monthISO.split('-').map(Number);
  return `${MONTHS_GEN[month - 1][0].toUpperCase()}${MONTHS_GEN[month - 1].slice(1)} ${year}`;
}

export function formatMonthShort(monthISO) {
  const [, month] = monthISO.split('-').map(Number);
  return MONTHS_GEN[month - 1].slice(0, 3);
}

export function weekdayShort(dateISO) {
  return WEEKDAYS_SHORT[parseDate(dateISO).getDay()];
}

export function weekdayFull(dateISO) {
  return WEEKDAYS[parseDate(dateISO).getDay()];
}

export function isWeekend(dateISO) {
  const day = parseDate(dateISO).getDay();
  return day === 0 || day === 6;
}

/** Строит сетку календаря (6 недель × 7 дней) для месяца. */
export function calendarGrid(monthISO) {
  const { start, end } = monthBounds(monthISO);
  const first = parseDate(start);
  const offset = first.getDay() === 0 ? 6 : first.getDay() - 1; // неделя с понедельника
  const cells = [];
  let cursor = addDays(start, -offset);
  const last = parseDate(end);
  while (cells.length < 42) {
    const d = parseDate(cursor);
    const isCurrentMonth = d.getMonth() === first.getMonth();
    cells.push({
      date: cursor,
      inMonth: isCurrentMonth,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: cursor === todayISO(),
      day: d.getDate(),
      beyondLast: d > last,
    });
    cursor = addDays(cursor, 1);
  }
  return cells;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} дн назад`;
  return formatDateTime(iso);
}

/** Стабильный цвет аватара по имени. */
export function avatarTint(name = '') {
  const s = String(name);
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return `avatar-tint-${(hash % 5) + 1}`;
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function dutiesWord(n) {
  return plural(n, 'дежурство', 'дежурства', 'дежурств');
}

export function studentsWord(n) {
  return plural(n, 'ученик', 'ученика', 'учеников');
}

export function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export { MONTHS_GEN, MONTHS_ACC };