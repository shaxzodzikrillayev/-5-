import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Alert, Avatar, EmptyState, Loading, StatusBadge, StatCard, ProgressBar } from '../components/ui.jsx';
import {
  todayISO, formatDateWithWeekday, formatDateShort, weekdayShort, dutiesWord, monthBounds,
} from '../lib/format.js';
import { IconList, IconCalendar, IconSwap, IconCheck, IconClock, IconWarning } from '../components/icons.jsx';

export default function MyDuties() {
  const [data, setData] = useState({ duties: [], replacements: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/duties/mine');
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = data.duties || [];
    return {
      total: list.length,
      future: list.filter((d) => d.date >= todayISO()).length,
      served: list.filter((d) => d.status === 'served').length,
      missed: list.filter((d) => ['not_served', 'absent'].includes(d.status)).length,
      sick: list.filter((d) => d.status === 'sick').length,
      excused: list.filter((d) => d.status === 'excused').length,
      replaced: list.filter((d) => d.status === 'replaced').length,
      scheduled: list.filter((d) => d.status === 'scheduled').length,
      rate: list.length
        ? Math.round((list.filter((d) => d.status === 'served').length / list.length) * 100)
        : 0,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const list = data.duties || [];
    if (filter === 'all') return list;
    if (filter === 'future') return list.filter((d) => d.date >= todayISO());
    if (filter === 'past') return list.filter((d) => d.date < todayISO());
    return list.filter((d) => d.status === filter);
  }, [data, filter]);

  const grouped = useMemo(() => {
    const byMonth = new Map();
    filtered.forEach((d) => {
      const month = d.date.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(d);
    });
    return Array.from(byMonth.entries());
  }, [filtered]);

  if (loading) return <Loading text="Загружаем ваше дежурство…" />;

  const hasAny = (data.duties || []).length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Моё дежурство</h1>
          <div className="sub">Ваши назначения, статусы и информация о заменах</div>
        </div>
        <div className="page-actions">
          <Link to="/app/schedule" className="btn btn-secondary">
            <IconCalendar size={16} /> Календарь класса
          </Link>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      {!hasAny ? (
        <div className="card">
          <EmptyState
            emoji="📋"
            title="Дежурств пока нет"
            description="Как только староста назначит вас дежурным, здесь появится дата, статус и вся история."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4 section">
            <StatCard label="Всего дежурств" value={stats.total} hint={`${stats.future} ещё предстоит`} icon="📋" color="var(--brand-600)" bg="var(--brand-50)" />
            <StatCard label="Выполнено" value={stats.served} hint={`Процент выполнения: ${stats.rate}%`} icon="✅" color="var(--ok)" bg="var(--ok-bg)" />
            <StatCard label="Пропущено" value={stats.missed} hint="Не дежурил / отсутствовал" icon="⚠️" color="var(--bad)" bg="var(--bad-bg)" />
            <StatCard label="Основания" value={stats.sick + stats.excused} hint={`Болел: ${stats.sick} · Освобождён: ${stats.excused}`} icon="📄" color="var(--warn)" bg="var(--warn-bg)" />
          </div>

          {hasAny ? (
            <div className="card section">
              <div className="card-body">
                <h4 style={{ marginBottom: 12 }}>Ваша статистика по всем статусам</h4>
                <ProgressBar label="Дежурил" value={stats.served} total={stats.total} color="var(--ok)" />
                <ProgressBar label="Не дежурил" value={stats.missed} total={stats.total} color="var(--bad)" />
                <ProgressBar label="Болел" value={stats.sick} total={stats.total} color="var(--warn)" />
                <ProgressBar label="Освобождён" value={stats.excused} total={stats.total} color="var(--info)" />
                <ProgressBar label="Замена" value={stats.replaced} total={stats.total} color="var(--purple)" />
                <ProgressBar label="Ожидается" value={stats.scheduled} total={stats.total} color="var(--ink-400)" />
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-head">
              <h3>
                <IconList size={17} /> История дежурств
              </h3>
              <select
                className="select"
                style={{ width: 'auto', minWidth: 170 }}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Фильтр"
              >
                <option value="all">Все статусы</option>
                <option value="future">Только будущие</option>
                <option value="past">Только прошедшие</option>
                <option value="served">Дежурил</option>
                <option value="not_served">Не дежурил</option>
                <option value="sick">Болел</option>
                <option value="excused">Освобождён</option>
                <option value="replaced">Замена</option>
                <option value="scheduled">Назначено</option>
              </select>
            </div>

            {grouped.length === 0 ? (
              <EmptyState emoji="🔍" title="Ничего не найдено" description="Измените фильтр, чтобы увидеть другие дежурства." />
            ) : (
              grouped.map(([month, list]) => (
                <div key={month}>
                  <div
                    className="card-head"
                    style={{ background: 'var(--ink-50)', borderBottom: '1px solid var(--ink-100)' }}
                  >
                    <strong style={{ fontSize: '.88rem' }}>
                      {new Date(`${month}-01T00:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                    </strong>
                    <span className="badge badge-soft">{list.length} {dutiesWord(list.length)}</span>
                  </div>
                  <div className="duty-list">
                    {list.map((d) => {
                      const isFuture = d.date >= todayISO();
                      return (
                        <div className="duty-item" key={d.id} style={{ opacity: isFuture ? 1 : 1 }}>
                          <div
                            className="avatar"
                            style={{
                              background: isFuture ? 'linear-gradient(135deg,#f59e0b,#b45309)' : undefined,
                            }}
                            aria-hidden="true"
                          >
                            {d.date.slice(8, 10)}
                          </div>
                          <div className="info">
                            <div className="name">
                              {weekdayShort(d.date)}, {formatDateShort(d.date)}
                              {isFuture ? <span className="badge badge-scheduled" style={{ marginLeft: 8 }}><IconClock size={11} /> впереди</span> : null}
                            </div>
                            <div className="meta">
                              <span>{formatDateWithWeekday(d.date)}</span>
                              {d.comment ? <span>💬 {d.comment}</span> : null}
                              {d.replacedByName ? <span className="badge badge-replaced">замена: {d.replacedByName}</span> : null}
                            </div>
                          </div>
                          <StatusBadge status={d.status} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {(data.replacements || []).length ? (
            <div className="card section" style={{ marginTop: 18 }}>
              <div className="card-head">
                <h3>
                  <IconSwap size={17} /> Вы дежурили вместо других
                </h3>
                <span className="badge badge-replaced">{(data.replacements || []).length}</span>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Вместо кого</th>
                      <th>Причина</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.replacements.map((r) => (
                      <tr key={`${r.id}-${r.date}`}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateShort(r.date)}</td>
                        <td>{r.forStudent}</td>
                        <td style={{ color: 'var(--ink-600)' }}>{r.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {stats.missed > 0 ? (
            <div className="alert alert-warn" style={{ marginTop: 16 }}>
              <IconWarning size={17} />
              <div>
                У вас есть пропуски ({stats.missed}). Если причина была уважительной, сообщите старосте — он может
                исправить статус и добавить комментарий.
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}