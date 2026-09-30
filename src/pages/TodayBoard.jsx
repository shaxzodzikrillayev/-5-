import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading, StatusBadge } from '../components/ui.jsx';
import {
  MARKABLE_STATUSES, statusMeta, todayISO, addDays, formatDateWithWeekday,
  weekdayShort, dutiesWord,
} from '../lib/format.js';
import {
  IconToday, IconPlus, IconSwap, IconTrash, IconEdit, IconCheck,
  IconChevronLeft, IconChevronRight, IconClock, IconWarning,
} from '../components/icons.jsx';

export default function TodayBoard() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [duties, setDuties] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dutyRes, studentRes] = await Promise.all([
        api.get(`/duties/date/${date}`),
        api.get('/students'),
      ]);
      setDuties(dutyRes.duties || []);
      setStudents(studentRes.students || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const busyStudents = useMemo(() => new Set(duties.map((d) => d.studentId)), [duties]);
  const freeStudents = useMemo(
    () => students.filter((s) => s.isActive && !busyStudents.has(s.id)),
    [students, busyStudents],
  );

  const setStatus = async (duty, status) => {
    if (duty.status === status) return;
    setPendingId(duty.id);
    try {
      const res = await api.post(`/duties/${duty.id}/status`, { status });
      setDuties((list) => list.map((d) => (d.id === duty.id ? res.duty : d)));
      toast.success(`${duty.studentName}: ${statusMeta(status).label}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPendingId(null);
    }
  };

  const removeDuty = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api.del(`/duties/${confirmDelete.id}`, { confirm: true });
      setDuties((list) => list.filter((d) => d.id !== confirmDelete.id));
      toast.success('Дежурство удалено');
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const map = {};
    MARKABLE_STATUSES.forEach((s) => {
      map[s] = duties.filter((d) => d.status === s).length;
    });
    map.scheduled = duties.filter((d) => d.status === 'scheduled').length;
    return map;
  }, [duties]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Табло дежурства</h1>
          <div className="sub" style={{ textTransform: 'capitalize' }}>{formatDateWithWeekday(date)}</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setDate(addDays(date, -1))} aria-label="Предыдущий день">
            <IconChevronLeft size={17} />
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setDate(todayISO())} disabled={date === todayISO()}>
            Сегодня
          </button>
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setDate(addDays(date, 1))} aria-label="Следующий день">
            <IconChevronRight size={17} />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setAssignOpen(true)}>
            <IconPlus size={16} /> Назначить
          </button>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка загрузки">{error}</Alert> : null}

      {duties.length ? (
        <div className="grid grid-4 section" style={{ gap: 11 }}>
          {MARKABLE_STATUSES.map((status) => {
            const meta = statusMeta(status);
            return (
              <div className="stat" key={status}>
                <div className="stat-top">
                  <span className="stat-label">
                    <span aria-hidden="true">{meta.emoji}</span> {meta.label}
                  </span>
                </div>
                <div className="stat-value" style={{ color: meta.color }}>{counts[status] || 0}</div>
                <div className="stat-accent" style={{ background: meta.color }} />
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <h3>
            <IconToday size={17} /> Дежурные на {weekdayShort(date)} ({duties.length} {dutiesWord(duties.length)})
          </h3>
          {counts.scheduled ? (
            <span className="badge badge-scheduled">
              <IconClock size={13} /> {counts.scheduled} без отметки
            </span>
          ) : null}
        </div>

        {loading ? (
          <Loading text="Загружаем дежурных…" />
        ) : duties.length === 0 ? (
          <EmptyState
            emoji="👥"
            title="На этот день дежурных нет"
            description="Назначьте учеников дежурными — они сразу увидят это в своём кабинете."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setAssignOpen(true)}>
                <IconPlus size={16} /> Назначить дежурных
              </button>
            }
          />
        ) : (
          <div className="duty-list">
            {duties.map((duty) => (
              <div className="duty-item" key={duty.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Avatar name={duty.studentName} initials={duty.studentInitials} size="lg" />
                <div className="info">
                  <div className="name" style={{ fontSize: '1rem' }}>{duty.studentName}</div>
                  <div className="meta">
                    {duty.comment ? <span>💬 {duty.comment}</span> : <span>Без комментария</span>}
                    {duty.replacedByName ? (
                      <span className="badge badge-replaced">
                        <IconSwap size={12} /> вместо: {duty.replacedByName}
                      </span>
                    ) : null}
                    {duty.assignedByName ? <span>назначил: {duty.assignedByName}</span> : null}
                  </div>
                  <div className="status-picker" style={{ marginTop: 9 }}>
                    {MARKABLE_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`status-btn ${status}${duty.status === status ? ' active' : ''}`}
                        disabled={pendingId === duty.id}
                        onClick={() => setStatus(duty, status)}
                        title={`Отметить: ${statusMeta(status).label}`}
                      >
                        {pendingId === duty.id && duty.status === status ? '…' : statusMeta(status).label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="duty-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <StatusBadge status={duty.status} />
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setReplaceTarget(duty)}
                      disabled={!!duty.replacedByName}
                      title={duty.replacedByName ? 'Замена уже оформлена' : 'Добавить замену'}
                    >
                      <IconSwap size={14} /> Замена
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setEditTarget(duty)}
                      title="Изменить или перенести дежурство"
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setConfirmDelete(duty)}
                      title="Убрать из дежурства"
                      style={{ color: 'var(--bad)' }}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {freeStudents.length > 0 && duties.length > 0 ? (
        <div className="card section" style={{ marginTop: 18 }}>
          <div className="card-head">
            <h3>
              <IconCheck size={17} /> Свободны на этот день
            </h3>
            <span className="badge badge-soft">{freeStudents.length}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {freeStudents.map((s) => (
                <QuickAssign key={s.id} student={s} date={date} onDone={load} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <button type="button" className="fab" onClick={() => setAssignOpen(true)} aria-label="Назначить дежурных">
        <IconPlus size={24} />
      </button>

      <AssignModal
        open={assignOpen}
        date={date}
        onClose={() => setAssignOpen(false)}
        students={students}
        onSaved={(list) => {
          setDuties((prev) => [...prev, ...list.filter((d) => !prev.some((p) => p.id === d.id))]);
          setAssignOpen(false);
        }}
        onDateChange={setDate}
      />

      <ReplaceModal
        duty={replaceTarget}
        date={date}
        students={students.filter((s) => s.isActive)}
        onClose={() => setReplaceTarget(null)}
        onSaved={() => {
          setReplaceTarget(null);
          load();
        }}
      />

      <EditDutyModal
        duty={editTarget}
        students={students.filter((s) => s.isActive)}
        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          setDuties((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
          setEditTarget(null);
        }}
        onDeleted={(id) => {
          setDuties((prev) => prev.filter((d) => d.id !== id));
          setEditTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Убрать из дежурства?"
        message={`${confirmDelete?.studentName} будет убран из дежурства на ${formatDateWithWeekday(date)}. История изменений сохранится.`}
        confirmLabel="Убрать"
        busy={busy}
        onConfirm={removeDuty}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

function QuickAssign({ student, date, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const assign = async () => {
    setBusy(true);
    try {
      await api.post('/duties', { date, studentId: student.id });
      toast.success(`${student.fullName} — дежурный`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-sm btn-secondary" onClick={assign} disabled={busy}>
      {busy ? <span className="spinner" /> : <IconPlus size={14} />} {student.fullName}
    </button>
  );
}

function AssignModal({ open, date, onClose, students, onSaved, onDateChange }) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(date);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedDate(date);
      setSelected([]);
      setQuery('');
      setError('');
    }
  }, [open, date]);

  const filtered = students.filter((s) => s.isActive && s.fullName.toLowerCase().includes(query.toLowerCase()));

  const toggle = (id) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const save = async () => {
    if (!selected.length) {
      setError('Выберите хотя бы одного ученика');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/duties/bulk', { dates: [selectedDate], studentIds: selected });
      if (!res.created) {
        toast.warn('Все выбранные ученики уже назначены на эту дату');
      } else {
        toast.success(`Назначено: ${res.created}`);
      }
      onSaved(res.duties || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Назначить дежурных"
      subtitle="Выберите дату и учеников"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null}
            Назначить ({selected.length})
          </button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}
      <div className="field">
        <label htmlFor="assign-date">Дата</label>
        <input
          id="assign-date"
          type="date"
          className="input"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            onDateChange?.(e.target.value);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="student-search">Поиск ученика</label>
        <input
          id="student-search"
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Начните вводить фамилию…"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {filtered.map((s) => (
          <label
            key={s.id}
            className="card"
            style={{
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              cursor: 'pointer',
              borderColor: selected.includes(s.id) ? 'var(--brand-500)' : undefined,
              background: selected.includes(s.id) ? 'var(--brand-50)' : '#fff',
            }}
          >
            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
            <Avatar name={s.fullName} initials={s.initials} size="sm" />
            <span style={{ fontSize: '.87rem', fontWeight: 600 }}>{s.fullName}</span>
          </label>
        ))}
        {filtered.length === 0 ? <p style={{ color: 'var(--ink-500)' }}>Никого не найдено.</p> : null}
      </div>
    </Modal>
  );
}

function ReplaceModal({ duty, date, students, onClose, onSaved }) {
  const toast = useToast();
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (duty) {
      setStudentId('');
      setReason('');
      setError('');
    }
  }, [duty]);

  const save = async () => {
    if (!studentId) {
      setError('Выберите ученика, который будет дежурить');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/replacements', { dutyId: duty.id, replacementStudentId: studentId, reason });
      toast.success('Замена оформлена');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const options = students.filter((s) => s.id !== duty?.studentId);

  return (
    <Modal
      open={!!duty}
      title="Добавить замену"
      subtitle={duty ? `${duty.studentName} · ${formatDateWithWeekday(duty.date)}` : ''}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null}
            Оформить замену
          </button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}
      <div className="alert alert-info">
        <IconWarning size={16} />
        <div>
          Вместо <strong>{duty?.studentName}</strong> ({formatDateWithWeekday(duty?.date || date)}) будет дежурить новый
          ученик. Исходному дежурству автоматически присвоится статус «Замена».
        </div>
      </div>

      <div className="field">
        <label htmlFor="replace-student">Дежурит вместо <span className="req">*</span></label>
        <select id="replace-student" className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— выберите ученика —</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="replace-reason">Причина</label>
        <textarea
          id="replace-reason"
          className="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Например: болел, справка"
        />
        <div className="hint">Причина сохранится в истории изменений.</div>
      </div>
    </Modal>
  );
}

function EditDutyModal({ duty, students, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const [studentId, setStudentId] = useState('');
  const [newDate, setNewDate] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (duty) {
      setStudentId(duty.studentId);
      setNewDate(duty.date);
      setComment(duty.comment || '');
      setError('');
    }
  }, [duty]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/duties/${duty.id}`, { studentId, date: newDate, comment });
      toast.success('Изменения сохранены');
      onSaved(res.duty);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/duties/${duty.id}`, { confirm: true });
      toast.success('Дежурство удалено');
      onDeleted(duty.id);
    } catch (err) {
      toast.error(err.message);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const changedDate = duty && newDate !== duty.date;
  const changedStudent = duty && studentId !== duty.studentId;

  return (
    <>
      <Modal
        open={!!duty}
        title="Изменить дежурство"
        subtitle={duty ? `${duty.studentName} · ${formatDateWithWeekday(duty.date)}` : ''}
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginRight: 'auto', color: 'var(--bad)' }}
              onClick={() => setConfirmOpen(true)}
            >
              <IconTrash size={15} /> Удалить
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? <span className="spinner spinner-light" /> : null}
              Сохранить
            </button>
          </>
        }
      >
        {error ? <Alert type="error">{error}</Alert> : null}
        <div className="field">
          <label htmlFor="edit-student">Дежурный</label>
          <select id="edit-student" className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-date">Дата {changedDate ? '(перенос дежурства)' : ''}</label>
          <input id="edit-date" type="date" className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          {changedDate || changedStudent ? (
            <div className="hint">Изменение будет записано в историю: кто, когда и что поменял.</div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="edit-comment">Комментарий</label>
          <textarea
            id="edit-comment"
            className="textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например: пришёл на 15 минут позже"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Удалить дежурство?"
        message={`Дежурство ${duty?.studentName} на ${formatDateWithWeekday(duty?.date)} будет удалено. Если статус уже отмечен и вы не куратор — операция будет отклонена.`}
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}