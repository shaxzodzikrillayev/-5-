import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Alert, EmptyState, Loading, RoleBadge } from '../components/ui.jsx';
import { formatDateShort, formatDateTime, relativeTime, roleMeta } from '../lib/format.js';
import { IconHistory, IconFilter, IconChevronLeft, IconChevronRight, IconRefresh } from '../components/icons.jsx';

const ACTION_LABELS = {
  'duty.status': 'Смена статуса',
  'duty.created': 'Назначение',
  'duty.updated': 'Изменение дежурства',
  'duty.deleted': 'Удаление дежурства',
  'duty.comment': 'Комментарий',
  'duty.generate': 'Генерация расписания',
  'replacement.created': 'Замена создана',
  'replacement.updated': 'Замена изменена',
  'replacement.cancelled': 'Замена отменена',
  'student.created': 'Ученик добавлен',
  'student.updated': 'Ученик изменён',
  'student.archived': 'Ученик архивирован',
  'student.deleted': 'Ученик удалён',
  'student.restored': 'Ученик восстановлен',
  'student.linked': 'Аккаунт привязан',
  'settings.updated': 'Настройки класса',
  'user.role': 'Смена роли',
  'user.status': 'Статус пользователя',
  'user.deleted': 'Пользователь удалён',
  'user.delete_rejected': 'Удаление отклонено',
  'auth.login': 'Вход',
  'auth.register': 'Регистрация',
};

const ACTION_COLORS = {
  'duty.status': '#2563eb',
  'replacement.created': '#9333ea',
  'replacement.cancelled': '#475569',
  'student.archived': '#dc2626',
  'student.deleted': '#b91c1c',
  'user.deleted': '#b91c1c',
  'user.delete_rejected': '#7f1d1d',
  'student.restored': '#16a34a',
  'auth.login': '#64748b',
  'auth.register': '#64748b',
};

const PAGE_SIZE = 40;

export default function History() {
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      const res = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      if (Array.isArray(res.actions)) setActions(res.actions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, action, entityType]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [action, entityType]);

  const grouped = useMemo(() => {
    const map = new Map();
    logs.forEach((log) => {
      const day = log.createdAt ? log.createdAt.slice(0, 10) : '—';
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(log);
    });
    return Array.from(map.entries());
  }, [logs]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>История изменений</h1>
          <div className="sub">Все действия пользователей за {total} записей</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={load} aria-label="Обновить">
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      <div className="card section">
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.85rem', color: 'var(--ink-500)' }}>
            <IconFilter size={16} /> Фильтры
          </span>
          <select className="select" style={{ width: 'auto', minWidth: 190 }} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Тип действия">
            <option value="">Все действия</option>
            {actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
            ))}
          </select>
          <select className="select" style={{ width: 'auto', minWidth: 160 }} value={entityType} onChange={(e) => setEntityType(e.target.value)} aria-label="Объект">
            <option value="">Все объекты</option>
            <option value="duty">Дежурства</option>
            <option value="replacement">Замены</option>
            <option value="student">Ученики</option>
            <option value="settings">Настройки</option>
            <option value="user">Пользователи</option>
          </select>
          {(action || entityType) ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAction(''); setEntityType(''); }}>
              Сбросить
            </button>
          ) : null}
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      {loading ? (
        <Loading text="Загружаем историю…" />
      ) : logs.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🗂" title="Записей нет" description="Измените фильтры или подождите новых действий." />
        </div>
      ) : (
        <div className="card section">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="card-head" style={{ background: 'var(--ink-50)' }}>
                <strong style={{ fontSize: '.85rem' }}>{formatDateShort(day)}</strong>
                <span className="badge badge-soft">{items.length}</span>
              </div>
              <div className="log-list">
                {items.map((log) => (
                  <div className="log-item" key={log.id}>
                    <span
                      className="log-dot"
                      style={{ background: ACTION_COLORS[log.action] || 'var(--brand-500)' }}
                      aria-hidden="true"
                    />
                    <div className="log-body">
                      <div className="log-top">
                        <span className="badge" style={{ background: `${ACTION_COLORS[log.action] || '#6366f1'}18`, color: ACTION_COLORS[log.action] || '#4f46e5' }}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                        <span className="name">{log.actorName}</span>
                        {log.actorRole ? <RoleBadge role={log.actorRole} /> : null}
                        <span className="spacer" />
                        <span className="sub" title={formatDateTime(log.createdAt)}>{relativeTime(log.createdAt)}</span>
                      </div>
                      <div className="log-summary">{log.summary}</div>
                      {log.before && log.after ? (
                        <details className="log-diff">
                          <summary>Подробнее (до / после)</summary>
                          <div className="log-diff-grid">
                            <div>
                              <div className="sub">До</div>
                              <pre>{JSON.stringify(log.before, null, 1)}</pre>
                            </div>
                            <div>
                              <div className="sub">После</div>
                              <pre>{JSON.stringify(log.after, null, 1)}</pre>
                            </div>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {pages > 1 ? (
            <div className="card-foot" style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <IconChevronLeft size={15} /> Назад
              </button>
              <span style={{ fontSize: '.85rem', color: 'var(--ink-500)' }}>Стр. {page + 1} из {pages}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page + 1 >= pages}>
                Вперёд <IconChevronRight size={15} />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}