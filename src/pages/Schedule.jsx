import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading, StatusBadge } from '../components/ui.jsx';
import {
  calendarGrid, currentMonthISO, formatMonth, formatMonthShort, monthBounds, shiftMonth,
  todayISO, weekdayFull, formatDateShort, statusMeta, dutiesWord,
} from '../lib/format.js';
import {
  IconCalendar, IconChevronLeft, IconChevronRight, IconList, IconPlus, IconSwap, IconToday,
} from '../components/icons.jsx';

const WEEK_HEAD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function Schedule() {
  const { isManager } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthISO());
  const [duties, setDuties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('calendar');
  const [selectedDay, setSelectedDay] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [assignFor, setAssignFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/duties/month?month=${month}`);
      setDuties(res.duties || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map();
    duties.forEach((d) => {
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date).push(d);
    });
    return map;
  }, [duties]);

  const cells = useMemo(() => calendarGrid(month), [month]);
  const { start, end } = monthBounds(month);

  const monthStats = useMemo(() => {
    const stats = { total: duties.length, served: 0, failed: 0, sick: 0, replaced: 0, scheduled: 0 };
    duties.forEach((d) => {
      if (d.status === 'served') stats.served += 1;
      else if (['not_served', 'absent'].includes(d.status)) stats.failed += 1;
      else if (d.status === 'sick') stats.sick += 1;
      else if (d.status === 'replaced') stats.replaced += 1;
      else stats.scheduled += 1;
    });
    return stats;
  }, [duties]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Календарь дежурств</h1>
          <div className="sub" style={{ textTransform: 'capitalize' }}>
            {formatMonth(month)} · {duties.length} {dutiesWord(duties.length)}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">
            <IconChevronLeft size={17} />
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMonth(currentMonthISO())} disabled={month === currentMonthISO()}>
            Этот месяц
          </button>
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">
            <IconChevronRight size={17} />
          </button>
          <div style={{ display: 'flex', border: '1px solid var(--ink-200)', borderRadius: 10, overflow: 'hidden' }}>
            <button
              type="button"
              className={`btn btn-sm ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setView('calendar')}
            >
              <IconCalendar size={15} /> Сетка
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setView('list')}
            >
              <IconList size={15} /> Список
            </button>
          </div>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка загрузки">{error}</Alert> : null}

      <div className="grid grid-4 section" style={{ gap: 11 }}>
        {[
          { label: 'Всего дежурств', value: monthStats.total, color: 'var(--brand-600)' },
          { label: 'Дежурили', value: monthStats.served, color: 'var(--ok)' },
          { label: 'Не выполнено', value: monthStats.failed, color: 'var(--bad)' },
          { label: 'Замены', value: monthStats.replaced, color: 'var(--purple)' },
        ].map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-top"><span className="stat-label">{s.label}</span></div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-accent" style={{ background: s.color }} />
          </div>
        ))}
      </div>

      {loading ? (
        <Loading text="Загружаем расписание…" />
      ) : view === 'calendar' ? (
        <div className="card card-pad">
          <div className="cal" style={{ marginBottom: 8 }}>
            {WEEK_HEAD.map((w) => (
              <div className="cal-head" key={w}>{w}</div>
            ))}
          </div>
          <div className="cal">
            {cells.map((cell) => {
              const dayDuties = byDate.get(cell.date) || [];
              const statuses = [...new Set(dayDuties.map((d) => d.status))];
              return (
                <button
                  type="button"
                  key={cell.date}
                  className={`cal-day${cell.inMonth ? '' : ' other'}${cell.isWeekend ? ' weekend' : ''}${cell.isToday ? ' today' : ''}${selectedDay === cell.date ? ' selected' : ''}`}
                  onClick={() => setSelectedDay(cell.date)}
                  aria-label={`${cell.date}: ${dayDuties.length} дежурных`}
                >
                  <div className="d-num">
                    <span>{cell.day}</span>
                    {dayDuties.length ? <span style={{ fontSize: '.65rem', color: 'var(--ink-400)' }}>{dayDuties.length}</span> : null}
                  </div>
                  {dayDuties.slice(0, 2).map((d) => (
                    <span key={d.id} className="cal-chip" style={{ borderLeft: `3px solid ${statusMeta(d.status).color}` }}>
                      {d.studentName}
                    </span>
                  ))}
                  {dayDuties.length > 2 ? <span className="cal-more">+{dayDuties.length - 2}</span> : null}
                  {dayDuties.length ? (
                    <div className="cal-dots">
                      {statuses.slice(0, 4).map((s) => (
                        <span className="cal-dot" key={s} style={{ background: statusMeta(s).color }} />
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>День</th>
                  <th>Дежурные</th>
                  <th>Статус</th>
                  {isManager ? <th>Замена</th> : null}
                </tr>
              </thead>
              <tbody>
                {duties.length === 0 ? (
                  <tr>
                    <td colSpan={isManager ? 5 : 4}>
                      <EmptyState emoji="📅" title="Нет дежурств за месяц" description="Выберите другой месяц или назначьте дежурных." />
                    </td>
                  </tr>
                ) : null}
                {duties.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => setSelectedDay(d.date)}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDateShort(d.date)}</td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--ink-500)' }}>{weekdayFull(d.date)}</td>
                    <td>
                      <div className="cell-person">
                        <Avatar name={d.studentName} initials={d.studentInitials} size="sm" />
                        <span className="name">{d.studentName}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    {isManager ? <td style={{ color: 'var(--ink-600)' }}>{d.replacedByName || '—'}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DayModal
        date={selectedDay}
        duties={selectedDay ? byDate.get(selectedDay) || [] : []}
        isManager={isManager}
        onClose={() => setSelectedDay(null)}
        onAssign={() => setAssignFor(selectedDay)}
        onReplace={(duty) => setReplaceTarget(duty)}
        onChanged={load}
      />

      <ScheduleAssignModal
        date={assignFor}
        onClose={() => setAssignFor(null)}
        onSaved={() => {
          setAssignFor(null);
          setSelectedDay(null);
          load();
          toast.success('Дежурные назначены');
        }}
      />

      <ScheduleReplaceModal
        duty={replaceTarget}
        onClose={() => setReplaceTarget(null)}
        onSaved={() => {
          setReplaceTarget(null);
          setSelectedDay(null);
          load();
          toast.success('Замена оформлена');
        }}
      />
    </>
  );
}

function DayModal({ date, duties, isManager, onClose, onAssign, onReplace, onChanged }) {
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const today = date === todayISO();

  return (
    <Modal
      open={!!date}
      title={date ? formatDateShort(date) : ''}
      subtitle={date ? weekdayFull(date) : ''}
      onClose={onClose}
      size="lg"
      footer={
        isManager ? (
          <button type="button" className="btn btn-primary" onClick={onAssign}>
            <IconPlus size={16} /> Добавить дежурного
          </button>
        ) : null
      }
    >
      {!duties.length ? (
        <EmptyState emoji="👥" title="В этот день дежурных нет" description="Можно быть выходным или дежурство ещё не назначено." />
      ) : (
        <div className="duty-list" style={{ margin: '-22px' }}>
          {duties.map((d) => (
            <div className="duty-item" key={d.id} style={{ flexWrap: 'wrap' }}>
              <Avatar name={d.studentName} initials={d.studentInitials} />
              <div className="info">
                <div className="name">{d.studentName}</div>
                <div className="meta">
                  {d.comment ? <span>💬 {d.comment}</span> : <span>Без комментария</span>}
                  {d.replacedByName ? <span className="badge badge-replaced">замена: {d.replacedByName}</span> : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {isManager ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => onReplace(d)}
                    disabled={!!d.replacedByName}
                  >
                    <IconSwap size={14} /> Замена
                  </button>
                ) : null}
                <StatusBadge status={d.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      {date && duties.length === 0 && isManager ? (
        <div style={{ textAlign: 'center', marginTop: -10 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAssign(date)}>
            Назначить дежурных на {formatMonthShort(date.slice(0, 7))}
          </button>
        </div>
      ) : null}
      <p style={{ marginTop: 14, fontSize: '.83rem', color: 'var(--ink-500)' }}>
        {today ? 'Сегодня дежурство отмечено старостой или куратором.' : 'Статусы отмечает староста или куратор.'}
      </p>
    </Modal>
  );
}

function ScheduleAssignModal({ date, onClose, onSaved }) {
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!date) return;
    setSelected([]);
    setError('');
    api.get('/students').then((r) => setStudents(r.students || [])).catch(() => setStudents([]));
  }, [date]);

  const save = async () => {
    if (!selected.length) {
      setError('Выберите ученика');
      return;
    }
    setBusy(true);
    try {
      await api.post('/duties/bulk', { dates: [date], studentIds: selected });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!date}
      title="Назначить дежурных"
      subtitle={date ? `${formatDateShort(date)}, ${weekdayFull(date)}` : ''}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null} Назначить
          </button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {students.filter((s) => s.isActive).map((s) => (
          <label
            key={s.id}
            className="card"
            style={{
              padding: '9px 12px',
              display: 'flex',
              gap: 9,
              alignItems: 'center',
              cursor: 'pointer',
              borderColor: selected.includes(s.id) ? 'var(--brand-500)' : undefined,
              background: selected.includes(s.id) ? 'var(--brand-50)' : '#fff',
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              onChange={() =>
                setSelected((list) => (list.includes(s.id) ? list.filter((x) => x !== s.id) : [...list, s.id]))
              }
            />
            <Avatar name={s.fullName} initials={s.initials} size="sm" />
            <span style={{ fontSize: '.87rem', fontWeight: 600 }}>{s.fullName}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function ScheduleReplaceModal({ duty, onClose, onSaved }) {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!duty) return;
    setStudentId('');
    setReason('');
    setError('');
    api.get('/students').then((r) => setStudents(r.students || [])).catch(() => setStudents([]));
  }, [duty]);

  const save = async () => {
    if (!studentId) {
      setError('Выберите ученика');
      return;
    }
    setBusy(true);
    try {
      await api.post('/replacements', { dutyId: duty.id, replacementStudentId: studentId, reason });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!duty}
      title="Добавить замену"
      subtitle={duty ? `${duty.studentName} · ${formatDateShort(duty.date)}` : ''}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null} Оформить
          </button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}
      <div className="field">
        <label htmlFor="sched-replace">Дежурит вместо</label>
        <select id="sched-replace" className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— выберите —</option>
          {students.filter((s) => s.isActive && s.id !== duty?.studentId).map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sched-reason">Причина</label>
        <input
          id="sched-reason"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Болел, справка"
        />
      </div>
    </Modal>
  );
}