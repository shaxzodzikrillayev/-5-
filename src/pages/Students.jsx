import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading, ProgressBar, StatCard } from '../components/ui.jsx';
import { percent, studentsWord, todayISO } from '../lib/format.js';
import { IconUsers, IconPlus, IconSearch, IconEdit, IconTrash, IconKey } from '../components/icons.jsx';

const SORT_OPTIONS = [
  { value: 'order', label: 'По порядку в классе' },
  { value: 'name', label: 'По алфавиту' },
  { value: 'assigned', label: 'Больше дежурств' },
  { value: 'missed', label: 'Больше пропусков' },
  { value: 'rate', label: 'Худший процент' },
];

export default function Students() {
  const { isManager, isKurator } = useAuth();
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('order');
  const [showInactive, setShowInactive] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/students?includeInactive=${showInactive}`);
      setStudents(res.students || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const list = students.filter((s) => s.fullName.toLowerCase().includes(query.toLowerCase()));
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
    if (sort === 'order') sorted.sort((a, b) => a.sortOrder - b.sortOrder);
    if (sort === 'assigned') sorted.sort((a, b) => (b.stats?.assigned || 0) - (a.stats?.assigned || 0));
    if (sort === 'missed') sorted.sort((a, b) => (b.stats?.failed || 0) - (a.stats?.failed || 0));
    if (sort === 'rate') sorted.sort((a, b) => (a.stats?.attendanceRate ?? 100) - (b.stats?.attendanceRate ?? 100));
    return sorted;
  }, [students, query, sort]);

  const totals = useMemo(() => {
    const sum = students.reduce(
      (acc, s) => {
        acc.assigned += s.stats?.assigned || 0;
        acc.served += s.stats?.served || 0;
        acc.failed += s.stats?.failed || 0;
        return acc;
      },
      { assigned: 0, served: 0, failed: 0 },
    );
    return { ...sum, rate: percent(sum.served, sum.assigned) };
  }, [students]);

  const archive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await api.del(`/students/${archiveTarget.id}`, { confirm: true });
      toast.success(`${archiveTarget.fullName} архивирован, история сохранена`);
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (student) => {
    setBusy(true);
    try {
      await api.post(`/students/${student.id}/restore`);
      toast.success(`${student.fullName} восстановлен`);
      setRestoreTarget(null);
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
          <h1>Ученики</h1>
          <div className="sub">
            {students.length} {studentsWord(students.length)} в классе · выполнено {totals.rate}% дежурств
          </div>
        </div>
        <div className="page-actions">
          {isManager ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <IconPlus size={16} /> Добавить ученика
            </button>
          ) : null}
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      <div className="grid grid-4 section">
        <StatCard label="Всего учеников" value={students.length} icon="👥" color="var(--brand-600)" bg="var(--brand-50)" />
        <StatCard label="Всего дежурств" value={totals.assigned} icon="📋" color="var(--info)" bg="var(--info-bg)" />
        <StatCard label="Выполнено" value={totals.served} hint={`${totals.rate}% от всех назначений`} icon="✅" color="var(--ok)" bg="var(--ok-bg)" />
        <StatCard label="Пропущено" value={totals.failed} icon="⚠️" color="var(--bad)" bg="var(--bad-bg)" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <IconSearch size={17} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--ink-400)' }} />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по фамилии или имени…"
              aria-label="Поиск ученика"
            />
          </div>
          <select className="select" style={{ width: 'auto', minWidth: 190 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {isManager ? (
            <label className="checkbox">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Показать архивных
            </label>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Loading text="Загружаем список учеников…" />
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🔍" title="Ученики не найдены" description="Измените поисковый запрос или добавьте нового ученика." />
        </div>
      ) : (
        <div className="grid grid-auto-lg">
          {visible.map((s) => (
            <div className="card" key={s.id} style={{ opacity: s.isActive ? 1 : 0.62 }}>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 13, alignItems: 'center', marginBottom: 14 }}>
                  <Avatar name={s.fullName} initials={s.initials} size="lg" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link to={`/app/students/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{s.fullName}</div>
                    </Link>
                    <div style={{ fontSize: '.8rem', color: 'var(--ink-500)', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <span>Дежурств: {s.stats?.assigned ?? 0}</span>
                      {!s.isActive ? <span className="badge badge-absent">архив</span> : null}
                      {s.userId ? <span className="badge badge-soft">аккаунт есть</span> : null}
                    </div>
                  </div>
                  {isManager ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => setEditTarget(s)} title="Редактировать">
                        <IconEdit size={14} />
                      </button>
                      {!s.userId ? (
                        <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => setLinkTarget(s)} title="Привязать аккаунт">
                          <IconKey size={14} />
                        </button>
                      ) : null}
                      {s.isActive ? (
                        isKurator ? (
                          <button type="button" className="btn btn-sm btn-secondary btn-icon" style={{ color: 'var(--bad)' }} onClick={() => setArchiveTarget(s)} title="Архивировать">
                            <IconTrash size={14} />
                          </button>
                        ) : null
                      ) : (
                        <button type="button" className="btn btn-sm btn-secondary btn-icon" onClick={() => setRestoreTarget(s)} title="Восстановить">
                          <IconUsers size={14} />
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>

                <ProgressBar
                  label="Дежурил"
                  value={s.stats?.served ?? 0}
                  total={s.stats?.assigned ?? 0}
                  color="var(--ok)"
                />
                <ProgressBar
                  label="Не дежурил"
                  value={s.stats?.failed ?? 0}
                  total={s.stats?.assigned ?? 0}
                  color="var(--bad)"
                />
                <ProgressBar
                  label="Болел"
                  value={s.stats?.sick ?? 0}
                  total={s.stats?.assigned ?? 0}
                  color="var(--warn)"
                />
                <ProgressBar
                  label="Замены"
                  value={s.stats?.replaced ?? 0}
                  total={s.stats?.assigned ?? 0}
                  color="var(--purple)"
                />
              </div>
              <div className="card-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '.82rem', color: 'var(--ink-500)' }}>
                  Процент выполнения: <b style={{ color: 'var(--ink-800)' }}>{s.stats?.attendanceRate ?? 0}%</b>
                </span>
                <Link to={`/app/students/${s.id}`} className="btn btn-sm btn-secondary">
                  История
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <StudentFormModal
        open={createOpen || !!editTarget}
        student={editTarget}
        canDeactivate={isKurator}
        onClose={() => {
          setCreateOpen(false);
          setEditTarget(null);
        }}
        onSaved={() => {
          setCreateOpen(false);
          setEditTarget(null);
          load();
          toast.success('Сохранено');
        }}
      />

      <LinkAccountModal
        student={linkTarget}
        onClose={() => setLinkTarget(null)}
        onSaved={() => {
          setLinkTarget(null);
          load();
          toast.success('Аккаунт привязан');
        }}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        title="Архивировать ученика?"
        message={`${archiveTarget?.fullName} будет исключён из списка и не сможет войти в систему. История его дежурств и все записи остаются в базе — данные не удаляются.`}
        confirmLabel="Архивировать"
        busy={busy}
        onConfirm={archive}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        danger={false}
        title="Восстановить ученика?"
        message={`${restoreTarget?.fullName} снова сможет участвовать в дежурствах и войти в систему.`}
        confirmLabel="Восстановить"
        busy={busy}
        onConfirm={() => restore(restoreTarget)}
        onCancel={() => setRestoreTarget(null)}
      />
    </>
  );
}

function StudentFormModal({ open, student, canDeactivate, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', isActive: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (student) {
      setForm({
        firstName: student.firstName,
        lastName: student.lastName,
        email: '',
        password: '',
        isActive: student.isActive,
      });
    } else {
      setForm({ firstName: '', lastName: '', email: '', password: '', isActive: true });
    }
  }, [open, student]);

  const save = async () => {
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Имя и фамилия обязательны');
      return;
    }
    if (!student) {
      if (!form.email.trim()) {
        setError('Укажите email');
        return;
      }
      if (form.password && form.password.length < 6) {
        setError('Пароль: минимум 6 символов');
        return;
      }
    }
    setBusy(true);
    try {
      if (student) {
        const payload = { firstName: form.firstName, lastName: form.lastName };
        if (canDeactivate) payload.isActive = form.isActive;
        await api.patch(`/students/${student.id}`, payload);
      } else {
        const payload = { firstName: form.firstName, lastName: form.lastName, email: form.email.trim() };
        if (form.password) payload.password = form.password;
        await api.post('/students', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={student ? 'Редактировать ученика' : 'Новый ученик'}
      subtitle={student ? student.fullName : 'Можно создать без аккаунта — доступ можно выдать позже'}
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
      <div className="row">
        <div className="field">
          <label htmlFor="st-first">Имя <span className="req">*</span></label>
          <input id="st-first" className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="st-last">Фамилия <span className="req">*</span></label>
          <input id="st-last" className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
      </div>
      {!student ? (
        <>
          <div className="field">
            <label htmlFor="st-email">Email для входа <span className="req">*</span></label>
            <input id="st-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@school.uz" />
          </div>
          <div className="field">
            <label htmlFor="st-pass">Временный пароль</label>
            <input id="st-pass" className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Не менее 6 символов" />
            <div className="hint">Если оставить пустым, ученик сможет зарегистрироваться сам на этот email.</div>
          </div>
        </>
      ) : canDeactivate ? (
        <label className="checkbox">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Ученик активен (может входить и дежурить)
        </label>
      ) : null}
    </Modal>
  );
}

function LinkAccountModal({ student, onClose, onSaved }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (student) {
      setEmail('');
      setError('');
    }
  }, [student]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/students/${student.id}/link`, { email: email.trim() });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!student}
      title="Привязать аккаунт"
      subtitle={student ? student.fullName : ''}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>Привязать</button>
        </>
      }
    >
      {error ? <Alert type="error">{error}</Alert> : null}
      <div className="field">
        <label htmlFor="link-email">Email зарегистрированного пользователя <span className="req">*</span></label>
        <input id="link-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@school.uz" />
        <div className="hint">После привязки ученик увидит свои дежурства в личном кабинете.</div>
      </div>
    </Modal>
  );
}