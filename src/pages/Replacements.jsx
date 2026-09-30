import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading } from '../components/ui.jsx';
import { addDays, currentMonthISO, formatDateShort, formatMonth, monthBounds, todayISO } from '../lib/format.js';
import { IconSwap, IconPlus, IconRefresh } from '../components/icons.jsx';

export default function Replacements() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(() => {
    const { start, end } = monthBounds(currentMonthISO());
    return { from: start, to: end };
  });
  const [useMonth, setUseMonth] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/replacements?from=${range.from}&to=${range.to}`);
      setItems(res.replacements || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const month = item.date.slice(0, 7);
      if (!map.has(month)) map.set(month, []);
      map.get(month).push(item);
    });
    return Array.from(map.entries());
  }, [items]);

  const cancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api.del(`/replacements/${cancelTarget.id}`, { confirm: true });
      toast.success('Замена отменена, дежурство снова за исходным учеником');
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Замены дежурных</h1>
          <div className="sub">
            {items.length} {items.length === 1 ? 'замена' : 'замен'} за {formatDateShort(range.from)} — {formatDateShort(range.to)}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <IconPlus size={16} /> Добавить замену
          </button>
          <button type="button" className="btn btn-secondary btn-icon" onClick={load} aria-label="Обновить">
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      <div className="card section">
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useMonth}
              onChange={(e) => {
                setUseMonth(e.target.checked);
                if (e.target.checked) {
                  const { start, end } = monthBounds(currentMonthISO());
                  setRange({ from: start, to: end });
                }
              }}
            />
            Текущий месяц
          </label>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rep-from">С</label>
            <input id="rep-from" type="date" className="input" value={range.from} onChange={(e) => { setUseMonth(false); setRange({ ...range, from: e.target.value }); }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rep-to">По</label>
            <input id="rep-to" type="date" className="input" value={range.to} onChange={(e) => { setUseMonth(false); setRange({ ...range, to: e.target.value }); }} />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRange({ from: addDays(todayISO(), -60), to: todayISO() })}
          >
            Последние 60 дней
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRange({ from: todayISO(), to: addDays(todayISO(), 60) })}
          >
            Ближайшие 60 дней
          </button>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      {loading ? (
        <Loading text="Загружаем журнал замен…" />
      ) : grouped.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="🔄"
            title="Замен в этот период нет"
            description="Если ученик не может дежурить, добавьте замену — система автоматически создаст запись."
            action={<button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setCreateOpen(true)}>Добавить замену</button>}
          />
        </div>
      ) : (
        grouped.map(([month, list]) => (
          <div className="card section" key={month}>
            <div className="card-head" style={{ background: 'var(--ink-50)' }}>
              <strong style={{ textTransform: 'capitalize' }}>{formatMonth(month)}</strong>
              <span className="badge badge-replaced">{list.length}</span>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Вместо кого</th>
                    <th>Кто дежурит</th>
                    <th>Причина</th>
                    <th>Оформил</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDateShort(r.date)}</td>
                      <td>
                        <div className="cell-person">
                          <Avatar name={r.originalStudentName} size="sm" />
                          <span className="name">{r.originalStudentName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-person">
                          <Avatar name={r.replacementStudentName} size="sm" />
                          <span className="name" style={{ color: 'var(--purple)' }}>{r.replacementStudentName}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--ink-600)' }}>{r.reason || '—'}</td>
                      <td style={{ color: 'var(--ink-500)', fontSize: '.83rem' }}>{r.createdByName}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setCancelTarget(r)}>
                          Отменить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <CreateReplacementModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          load();
          toast.success('Замена оформлена');
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title="Отменить замену?"
        message={
          cancelTarget
            ? `${cancelTarget.originalStudentName} снова станет дежурным ${formatDateShort(cancelTarget.date)}, а запись за ${cancelTarget.replacementStudentName} будет удалена. Действие попадёт в историю.`
            : ''
        }
        confirmLabel="Отменить замену"
        busy={busy}
        onConfirm={cancel}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  );
}

function CreateReplacementModal({ open, onClose, onSaved }) {
  const [duties, setDuties] = useState([]);
  const [students, setStudents] = useState([]);
  const [dutyId, setDutyId] = useState('');
  const [replacementStudentId, setReplacementStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [markServed, setMarkServed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDutyId('');
    setReplacementStudentId('');
    setReason('');
    setMarkServed(true);
    setError('');
    Promise.all([api.get('/duties'), api.get('/students')])
      .then(([d, s]) => {
        setDuties(d.duties || []);
        setStudents((s.students || []).filter((x) => x.isActive));
      })
      .catch((err) => setError(err.message));
  }, [open]);

  const save = async () => {
    if (!dutyId) {
      setError('Выберите дежурство');
      return;
    }
    if (!replacementStudentId) {
      setError('Выберите, кто дежурит вместо');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/replacements', { dutyId, replacementStudentId, reason, markServed });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const selected = duties.find((d) => d.id === dutyId);

  return (
    <Modal
      open={open}
      title="Новая замена"
      subtitle="Дежурный заменяется другим учеником на ту же дату"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null} Оформить замену
          </button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}

      <div className="field">
        <label htmlFor="new-duty">Дежурство (кто и когда) <span className="req">*</span></label>
        <select id="new-duty" className="select" value={dutyId} onChange={(e) => setDutyId(e.target.value)}>
          <option value="">— выберите —</option>
          {duties.map((d) => (
            <option key={d.id} value={d.id}>
              {formatDateShort(d.date)} · {d.studentName}
            </option>
          ))}
        </select>
        {duties.length === 0 ? (
          <div className="hint">Дежурств пока нет — сначала назначьте их через кнопку «Генерация» на странице «Сегодня».</div>
        ) : null}
      </div>

      {selected ? (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">👤</span>
          <div>
            {formatDateShort(selected.date)} дежурит <b>{selected.studentName}</b> ({selected.statusLabel}).
            {selected.replacedByName ? <div>Текущая замена: {selected.replacedByName}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="new-repl">Дежурит вместо <span className="req">*</span></label>
        <select id="new-repl" className="select" value={replacementStudentId} onChange={(e) => setReplacementStudentId(e.target.value)}>
          <option value="">— выберите —</option>
          {students
            .filter((s) => s.id !== selected?.studentId)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="new-reason">Причина</label>
        <input id="new-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Болел, справка, семейные обстоятельства" />
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={markServed} onChange={(e) => setMarkServed(e.target.checked)} />
        Сразу отметить замену как выполненную
      </label>
    </Modal>
  );
}