import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading, ProgressBar, StatCard, StatusBadge } from '../components/ui.jsx';
import {
  MARKABLE_STATUSES, dutiesWord, formatDateShort, formatDateTime, percent, statusMeta, todayISO, weekdayFull,
} from '../lib/format.js';
import {
  IconChevronLeft, IconHistory, IconList, IconSwap, IconCheck, IconWarning,
} from '../components/icons.jsx';

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [markTarget, setMarkTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/students/${id}/history`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const student = data?.student;
  const stats = student?.stats;

  const history = useMemo(() => {
    const list = data?.history || [];
    return statusFilter === 'all' ? list : list.filter((h) => h.status === statusFilter);
  }, [data, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    history.forEach((item) => {
      const month = item.date.slice(0, 7);
      if (!map.has(month)) map.set(month, []);
      map.get(month).push(item);
    });
    return Array.from(map.entries());
  }, [history]);

  if (loading) return <Loading text="Загружаем карточку ученика…" />;

  if (error || !student) {
    return (
      <div className="card card-pad">
        <Alert type="error" title="Не удалось загрузить ученика">{error || 'Ученик не найден'}</Alert>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate('/app/students')}>
          <IconChevronLeft size={16} /> К списку учеников
        </button>
      </div>
    );
  }

  const future = (data.history || []).filter((h) => h.date >= todayISO());

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <Avatar name={student.fullName} initials={student.initials} size="lg" />
          <div>
            <h1 style={{ marginBottom: 2 }}>{student.fullName}</h1>
            <div className="sub">
              {student.className ? `Класс ${student.className}` : 'Ученик класса'}
              {student.sortOrder ? ` · № ${student.sortOrder}` : ''}
              {!student.isActive ? ' · архив' : ''}
            </div>
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/app/students')}>
            <IconChevronLeft size={16} /> Все ученики
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/app/schedule?date=${future[0]?.date || ''}`)}>
            <IconList size={16} /> Календарь класса
          </button>
        </div>
      </div>

      <div className="grid grid-4 section">
        <StatCard label="Всего дежурств" value={stats.assigned} hint={`Осталось: ${future.length}`} icon="📋" color="var(--brand-600)" bg="var(--brand-50)" />
        <StatCard label="Дежурил" value={stats.served} hint={`Процент: ${stats.attendanceRate}%`} icon="✅" color="var(--ok)" bg="var(--ok-bg)" />
        <StatCard label="Не дежурил" value={stats.failed} hint={`Отсутствовал: ${stats.absent}`} icon="⚠️" color="var(--bad)" bg="var(--bad-bg)" />
        <StatCard label="Основания и замены" value={stats.sick + stats.excused + stats.replaced} hint={`Болел: ${stats.sick} · Замен: ${stats.replaced}`} icon="📄" color="var(--purple)" bg="var(--purple-bg)" />
      </div>

      <div className="grid grid-2 section" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3><IconCheck size={17} /> Выполнение дежурств</h3>
            <span className="badge badge-served">{stats.attendanceRate}%</span>
          </div>
          <div className="card-body">
            <ProgressBar label="Дежурил" value={stats.served} total={stats.assigned} color="var(--ok)" />
            <ProgressBar label="Не дежурил" value={stats.not_served} total={stats.assigned} color="var(--bad)" />
            <ProgressBar label="Отсутствовал" value={stats.absent} total={stats.assigned} color="var(--ink-500)" />
            <ProgressBar label="Болел" value={stats.sick} total={stats.assigned} color="var(--warn)" />
            <ProgressBar label="Освобождён" value={stats.excused} total={stats.assigned} color="var(--info)" />
            <ProgressBar label="Замена" value={stats.replaced} total={stats.assigned} color="var(--purple)" />
            <ProgressBar label="Ожидается" value={stats.scheduled} total={stats.assigned} color="var(--ink-300)" />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><IconHistory size={17} /> Последние изменения статусов</h3>
          </div>
          {(data.changes || []).length === 0 ? (
            <EmptyState emoji="🗂" title="Изменений нет" description="Статусы ещё никто не менял." />
          ) : (
            <div className="timeline">
              {(data.changes || []).slice(0, 12).map((c) => (
                <div className="timeline-item" key={c.id}>
                  <span className="dot" style={{ background: statusMeta(c.status).color }} />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{statusMeta(c.status).label}</div>
                    <div className="sub" style={{ fontSize: '.78rem' }}>
                      {formatDateShort(c.date)} · {c.changedBy} · {formatDateTime(c.changedAt)}
                    </div>
                    {c.comment ? <div className="sub" style={{ fontSize: '.78rem' }}>💬 {c.comment}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <h3><IconList size={17} /> Все дежурства</h3>
          <select className="select" style={{ width: 'auto', minWidth: 165 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Фильтр статусов">
            <option value="all">Все статусы</option>
            {MARKABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{statusMeta(s).label}</option>
            ))}
            <option value="scheduled">Назначено</option>
          </select>
        </div>

        {grouped.length === 0 ? (
          <EmptyState emoji="📭" title="Дежурств нет" description="У ученика пока нет записей с выбранным статусом." />
        ) : (
          grouped.map(([month, list]) => (
            <div key={month}>
              <div className="card-head" style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--ink-100)' }}>
                <strong style={{ fontSize: '.88rem' }}>
                  {new Date(`${month}-01T00:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </strong>
                <span className="badge badge-soft">{list.length} {dutiesWord(list.length)}</span>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Статус</th>
                      <th>Комментарий</th>
                      <th>Замена</th>
                      {isManager ? <th aria-label="Действия" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((h) => (
                      <tr key={`${h.id}-${h.date}`}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600 }}>{formatDateShort(h.date)}</div>
                          <div className="sub" style={{ fontSize: '.76rem', textTransform: 'capitalize' }}>{weekdayFull(h.date)}</div>
                        </td>
                        <td><StatusBadge status={h.status} /></td>
                        <td style={{ color: 'var(--ink-600)' }}>{h.comment || '—'}</td>
                        <td style={{ color: 'var(--ink-600)' }}>
                          {h.replacement ? (
                            <>
                              <div>{h.replacement.name}</div>
                              {h.replacement.reason ? <div className="sub" style={{ fontSize: '.76rem' }}>{h.replacement.reason}</div> : null}
                            </>
                          ) : '—'}
                        </td>
                        {isManager ? (
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => setMarkTarget(h)}
                              disabled={h.date > todayISO()}
                              title={h.date > todayISO() ? 'Статус можно выставить только после наступления даты' : 'Изменить статус'}
                            >
                              <IconSwap size={14} /> Статус
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      <MarkStatusModal
        duty={markTarget}
        onClose={() => setMarkTarget(null)}
        onSaved={() => {
          setMarkTarget(null);
          load();
          toast.success('Статус обновлён');
        }}
      />
    </>
  );
}

function MarkStatusModal({ duty, onClose, onSaved }) {
  const [status, setStatus] = useState('served');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (duty) {
      setStatus(duty.status === 'scheduled' ? 'served' : duty.status);
      setComment(duty.comment || '');
      setError('');
    }
  }, [duty]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/duties/${duty.id}/status`, { status, comment });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!duty) return null;

  return (
    <Modal
      open={!!duty}
      title="Изменить статус"
      subtitle={formatDateShort(duty.date)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null} Сохранить
          </button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}
      <div className="field">
        <label>Статус</label>
        <div className="status-picker">
          {MARKABLE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`status-option${status === s ? ' active' : ''}`}
              style={{ borderColor: status === s ? statusMeta(s).color : undefined }}
              onClick={() => setStatus(s)}
            >
              <span aria-hidden="true">{statusMeta(s).emoji}</span>
              {statusMeta(s).label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="sd-comment">Комментарий</label>
        <input id="sd-comment" className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Причина или пояснение" />
      </div>
      <div className="hint">
        <IconWarning size={13} /> Изменение будет записано в историю и увидят его староста и куратор.
      </div>
    </Modal>
  );
}