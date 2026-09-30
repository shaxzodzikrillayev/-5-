export const ROLES = {
  STUDENT: 'student',
  STAROSTA: 'starosta',
  KURATOR: 'kurator',
};

export const ROLE_LABELS = {
  [ROLES.STUDENT]: 'Ученик',
  [ROLES.STAROSTA]: 'Староста',
  [ROLES.KURATOR]: 'Куратор',
};

export const STATUSES = {
  SCHEDULED: 'scheduled',
  SERVED: 'served',
  NOT_SERVED: 'not_served',
  SICK: 'sick',
  EXCUSED: 'excused',
  REPLACED: 'replaced',
  ABSENT: 'absent',
};

export const STATUS_META = {
  [STATUSES.SCHEDULED]: { label: 'Назначено', short: 'Назначено', color: '#94a3b8', emoji: '📌' },
  [STATUSES.SERVED]: { label: 'Дежурил', short: 'Дежурил', color: '#16a34a', emoji: '🟢' },
  [STATUSES.NOT_SERVED]: { label: 'Не дежурил', short: 'Не деж.', color: '#dc2626', emoji: '🔴' },
  [STATUSES.SICK]: { label: 'Болел', short: 'Болел', color: '#f59e0b', emoji: '🟡' },
  [STATUSES.EXCUSED]: { label: 'Освобождён', short: 'Освобождён', color: '#2563eb', emoji: '🔵' },
  [STATUSES.REPLACED]: { label: 'Замена', short: 'Замена', color: '#9333ea', emoji: '🟣' },
  [STATUSES.ABSENT]: { label: 'Отсутствовал', short: 'Отсутств.', color: '#475569', emoji: '⚫' },
};

export const ALL_STATUSES = Object.values(STATUSES);

/** Статусы, которые староста/куратор выставляют ученику после дня дежурства. */
export const MARKABLE_STATUSES = [
  STATUSES.SERVED,
  STATUSES.NOT_SERVED,
  STATUSES.SICK,
  STATUSES.EXCUSED,
  STATUSES.REPLACED,
  STATUSES.ABSENT,
];

export const STATUS_VALUES = ALL_STATUSES;

export function isStatus(value) {
  return ALL_STATUSES.includes(value);
}

export function statusMeta(value) {
  return STATUS_META[value] || STATUS_META[STATUSES.SCHEDULED];
}

export function roleLabel(value) {
  return ROLE_LABELS[value] || value;
}