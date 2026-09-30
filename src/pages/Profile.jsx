import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { Alert, Avatar, Loading, ProgressBar, RoleBadge, StatCard } from '../components/ui.jsx';
import { dutiesWord, formatDateTime, percent, todayISO } from '../lib/format.js';
import { IconUser, IconKey, IconLogout, IconList, IconCalendar, IconSwap, IconSettings } from '../components/icons.jsx';

export default function Profile() {
  const { user, isManager, logout, refresh } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/duties/mine')
      .then((res) => {
        if (alive) setMine(res);
      })
      .catch(() => {
        if (alive) setMine(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const duties = mine?.duties || [];
  const stats = {
    total: duties.length,
    future: duties.filter((d) => d.date >= todayISO()).length,
    served: duties.filter((d) => d.status === 'served').length,
    missed: duties.filter((d) => ['not_served', 'absent'].includes(d.status)).length,
    replaced: duties.filter((d) => d.status === 'replaced').length,
  };

  const changePassword = async () => {
    setError('');
    if (form.newPassword.length < 6) {
      setError('Новый пароль: минимум 6 символов');
      return;
    }
    if (form.newPassword !== form.confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      await api.patch('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Пароль изменён');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Loading text="Загружаем профиль…" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Профиль</h1>
          <div className="sub">Ваши данные и безопасность аккаунта</div>
        </div>
      </div>

      <div className="grid grid-2 section" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-body" style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
            <Avatar name={user.fullName} initials={user.initials} size="lg" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{user.fullName}</div>
              <div className="sub">{user.email}</div>
              <div style={{ marginTop: 6 }}><RoleBadge role={user.role} /></div>
            </div>
          </div>
          <div className="card-foot" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {user.role === 'student' ? (
              <Link to="/app/my" className="btn btn-secondary btn-sm"><IconList size={15} /> Моё дежурство</Link>
            ) : null}
            <Link to="/app/schedule" className="btn btn-secondary btn-sm"><IconCalendar size={15} /> Календарь</Link>
            <Link to="/app/replacements" className="btn btn-secondary btn-sm"><IconSwap size={15} /> Замены</Link>
            {isManager ? <Link to="/app/settings" className="btn btn-secondary btn-sm"><IconSettings size={15} /> Настройки</Link> : null}
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={logout}>
              <IconLogout size={15} /> Выйти
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><IconKey size={17} /> Смена пароля</h3>
          </div>
          <div className="card-body">
            {error ? <Alert type="error">{error}</Alert> : null}
            <div className="field">
              <label htmlFor="pw-current">Текущий пароль</label>
              <input id="pw-current" type="password" className="input" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pw-new">Новый пароль</label>
              <input id="pw-new" type="password" className="input" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
              <div className="hint">Минимум 6 символов.</div>
            </div>
            <div className="field">
              <label htmlFor="pw-confirm">Повторите пароль</label>
              <input id="pw-confirm" type="password" className="input" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" onClick={changePassword} disabled={busy || !form.currentPassword}>
              {busy ? <span className="spinner spinner-light" /> : null} Изменить пароль
            </button>
          </div>
        </div>
      </div>

      {user.role === 'student' && !loading ? (
        mine?.studentId ? (
          <div className="section">
            <div className="grid grid-4 section" style={{ marginBottom: 16 }}>
              <StatCard label="Всего дежурств" value={stats.total} hint={`${dutiesWord(stats.total)} за всё время`} icon="📋" color="var(--brand-600)" bg="var(--brand-50)" />
              <StatCard label="Дежурил" value={stats.served} hint={`Процент: ${percent(stats.served, stats.total)}%`} icon="✅" color="var(--ok)" bg="var(--ok-bg)" />
              <StatCard label="Пропущено" value={stats.missed} icon="⚠️" color="var(--bad)" bg="var(--bad-bg)" />
              <StatCard label="Предстоит" value={stats.future} icon="📅" color="var(--info)" bg="var(--info-bg)" />
            </div>
            <div className="card">
              <div className="card-head"><h3><IconUser size={17} /> Мои показатели</h3></div>
              <div className="card-body">
                <ProgressBar label="Дежурил" value={stats.served} total={stats.total} color="var(--ok)" />
                <ProgressBar label="Не дежурил / отсутствовал" value={stats.missed} total={stats.total} color="var(--bad)" />
                <ProgressBar label="Замена" value={stats.replaced} total={stats.total} color="var(--purple)" />
              </div>
            </div>
          </div>
        ) : (
          <Alert type="warn" title="Аккаунт не привязан к карточке ученика">
            Обратитесь к старосте или куратору, чтобы они связали ваш аккаунт с учеником в разделе «Ученики».
          </Alert>
        )
      ) : null}

      <div className="card section">
        <div className="card-head"><h3>Сессия</h3></div>
        <div className="card-body" style={{ fontSize: '.87rem', color: 'var(--ink-600)' }}>
          Вход выполнен как <b>{user.login || user.email}</b>. Сессия хранится в защищённой cookie и завершается кнопкой «Выйти».
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { refresh(); toast.info('Данные профиля обновлены'); }}>
              Обновить данные
            </button>
          </div>
        </div>
      </div>
    </>
  );
}