import { config } from '../config.js';

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

export const MONTH_NAMES_GEN = MONTH_NAMES;
export const MONTH_NAMES_ACC = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** Текущая дата в формате YYYY-MM-DD в часовом поясе класса. */
export function todayISO() {
  return formatter(config.timezone).format(new Date());
}

/** Текущий месяц в формате YYYY-MM. */
export function currentMonthISO() {
  return todayISO().slice(0, 7);
}

export function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isMonthString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

export function addDays(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthBounds(monthISO) {
  const [year, month] = monthISO.split('-').map(Number);
  const start = `${monthISO}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${monthISO}-${String(daysInMonth).padStart(2, '0')}`;
  return { start, end, days: daysInMonth, year, month };
}

export function listDays(startISO, endISO) {
  const days = [];
  let cursor = startISO;
  let guard = 0;
  while (cursor <= endISO && guard < 1000) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

/** Неделя (понедельник..воскресенье), содержащая дату. */
export function weekBounds(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = вс
  const offset = day === 0 ? -6 : 1 - day;
  const start = addDays(dateISO, offset);
  return { start, end: addDays(start, 6) };
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAY_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function weekdayShort(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return WEEKDAY_SHORT[d.getUTCDay()];
}

export function weekdayFull(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return WEEKDAY_FULL[d.getUTCDay()];
}

export function isWeekend(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function formatHuman(dateISO) {
  if (!isDateString(dateISO)) return dateISO || '';
  const d = new Date(`${dateISO}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_NAMES_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatMonthHuman(monthISO) {
  if (!isMonthString(monthISO)) return monthISO || '';
  const [year, month] = monthISO.split('-').map(Number);
  const title = MONTH_NAMES[month - 1];
  return `${title[0].toUpperCase()}${title.slice(1)} ${year}`;
}

export function monthLabelShort(monthISO) {
  const [, month] = monthISO.split('-').map(Number);
  return MONTH_NAMES_GEN[month - 1].slice(0, 3);
}