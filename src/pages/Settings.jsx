import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { Modal } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading, RoleBadge } from '../components/ui.jsx';
import { formatDateTime, roleMeta } from '../lib/format.js';
import { IconUsers, IconSettings, IconShield, IconRefresh, IconCheck, IconTrash } from '../components/icons.jsx';

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState({ className: '', classCity: '' });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyUser, setBusyUser] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, u] = await Promise.all([api.get('/settings'), api.get('/users?includeInactive=true')]);
      setSettings({ className: s.className || '', classCity: s.classCity || '' });
      setUsers(u.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/settings', settings);
      setSettings({ className: res.className || '', classCity: res.classCity || '' });
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (user, patch) => {
    setBusyUser(user.id);
    try {
      if (patch.role !== undefined) await api.patch(`/users/${user.id}/role`, { role: patch.role });
      if (patch.isActive !== undefined) await api.patch(`/users/${user.id}/status`, { isActive: patch.isActive });
      toast.success('Пользователь обновлён');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyUser('');
    }
  };

  const removeUser = async (user, code) => {
    setBusyUser(user.id);
    try {
      await api.del(`/users/${user.id}`, { confirm: true, permanent: true, code: code || '' });
      toast.success(`${user.fullName} удалён безвозвратно`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyUser('');
    }
  };

  if (loading) return <Loading text="Загружаем настройки…" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <div className="sub">Только для куратора: параметры класса и управление пользователями</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={load} aria-label="Обновить">
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      <div className="grid grid-2 section" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3><IconSettings size={17} /> Параметры класса</h3>
          </div>
          <div className="card-body">
            <div className="field">
              <label htmlFor="set-class">Название класса</label>
              <input
                id="set-class"
                className="input"
                value={settings.className}
                onChange={(e) => setSettings({ ...settings, className: e.target.value })}
                placeholder="10 «А»"
              />
              <div className="hint">Отображается на главной странице и в отчётах.</div>
            </div>
            <div className="field">
              <label htmlFor="set-city">Город / школа</label>
              <input
                id="set-city"
                className="input"
                value={settings.classCity}
                onChange={(e) => setSettings({ ...settings, classCity: e.target.value })}
                placeholder="Ташкент, школа №42"
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving}>
              {saving ? <span className="spinner spinner-light" /> : null} Сохранить
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><IconShield size={17} /> Безопасность</h3>
          </div>
          <div className="card-body">
            <div className="security-list">
              <div className="security-item">
                <span aria-hidden="true">🔑</span>
                <div>
                  <b>Пароли</b>
                  <div className="sub">Хешируются алгоритмом scrypt, в открытом виде не хранятся.</div>
                </div>
              </div>
              <div className="security-item">
                <span aria-hidden="true">🍪</span>
                <div>
                  <b>Сессии</b>
                  <div className="sub">Хранятся в базе, cookie httpOnly + SameSite=Lax. Выход завершает сессию на сервере.</div>
                </div>
              </div>
              <div className="security-item">
                <span aria-hidden="true">🛡</span>
                <div>
                  <b>CSRF</b>
                  <div className="sub">Все изменяющие запросы требуют токен из заголовка X-CSRF-Token.</div>
                </div>
              </div>
              <div className="security-item">
                <span aria-hidden="true">🕒</span>
                <div>
                  <b>История</b>
                  <div className="sub">Каждое изменение статуса, дежурства или замены пишется в журнал аудита.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <h3><IconUsers size={17} /> Пользователи ({users.length})</h3>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Регистрация</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5}><EmptyState emoji="👤" title="Нет пользователей" /></td></tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-person">
                      <Avatar name={u.fullName} initials={u.initials} size="sm" />
                      <div>
                        <div className="name">{u.fullName}</div>
                        <div className="cell-sub">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="select select-sm"
                      value={u.role}
                      disabled={busyUser === u.id}
                      onChange={(e) => updateUser(u, { role: e.target.value })}
                      aria-label={`Роль: ${u.fullName}`}
                    >
                      <option value="student">Ученик</option>
                      <option value="starosta">Староста</option>
                      <option value="kurator">Куратор</option>
                    </select>
                  </td>
                  <td>
                    {u.isActive
                      ? <span className="badge badge-served"><IconCheck size={11} /> Активен</span>
                      : <span className="badge badge-absent">Заблокирован</span>}
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--ink-500)' }}>{formatDateTime(u.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${u.isActive ? 'btn-danger-ghost' : 'btn-secondary'}`}
                        disabled={busyUser === u.id}
                        onClick={() => updateUser(u, { isActive: !u.isActive })}
                      >
                        {u.isActive ? 'Блокировать' : 'Разблокировать'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary btn-icon"
                        style={{ color: 'var(--bad)' }}
                        title="Удалить безвозвратно"
                        disabled={busyUser === u.id}
                        onClick={() => setDeleteTarget(u)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteUserDialog
        user={deleteTarget}
        busy={busyUser === deleteTarget?.id}
        onConfirm={(code) => removeUser(deleteTarget, code)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

function DeleteUserDialog({ user, busy, onConfirm, onCancel }) {
  const [code, setCode] = useState('');
  const needsCode = user?.role === 'starosta' || user?.role === 'kurator';

  useEffect(() => {
    setCode('');
  }, [user]);

  if (!user) return null;

  const canConfirm = !needsCode || code.trim().length > 0;

  return (
    <Modal
      open
      title="Удалить пользователя навсегда?"
      subtitle={`${user.fullName} · ${user.email}`}
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onConfirm(code)}
            disabled={busy || !canConfirm}
          >
            {busy ? <span className="spinner spinner-light" /> : null}
            Удалить безвозвратно
          </button>
        </>
      }
    >
      <div className="alert alert-error">
        <span aria-hidden="true">⚠️</span>
        <div>
          Аккаунт и все активные сессии будут удалены. Восстановить пользователя будет невозможно —
          запись в журнале аудита останется.
        </div>
      </div>
      {needsCode ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="del-user-code">
            Код удаления <span className="req">*</span>
          </label>
          <input
            id="del-user-code"
            className="input"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm && !busy) onConfirm(code);
            }}
            placeholder="Код доступа"
            autoComplete="off"
            disabled={busy}
          />
          <div className="hint">
            Роль «{roleMeta(user.role)?.label || user.role}» удаляется только с кодом доступа куратора.
          </div>
        </div>
      ) : (
        <div className="hint">Для ученика код не требуется.</div>
      )}
    </Modal>
  );
}