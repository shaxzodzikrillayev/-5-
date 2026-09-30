import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, EmptyState, Loading, StatCard, StatusBadge, Alert } from '../components/ui.jsx';
import { DonutChart } from '../components/Charts.jsx';
import {
  formatDateWithWeekday, todayISO, dutiesWord, studentsWord, formatDateShort,
} from '../lib/format.js';
import {
  IconToday, IconCalendar, IconCheck, IconUsers, IconSwap, IconWarning,
  IconClock, IconChart, IconChevronRight,
} from '../components/icons.jsx';

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const [today, setToday] = useState({ date: todayISO(), duties: [] });
  const [mine, setMine] = useState({ duties: [], replacements: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests = [
        api.get(`/duties/today?date=${todayISO()}`),
        isManager ? api.get('/statistics') : api.get('/duties/mine'),
      ];
      const [todayRes, statsRes] = await Promise.all(requests);
      setToday(todayRes);
      if (isManager) setStats(statsRes);
      else setMine(statsRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    load();
  }, [load]);

  const served = today.duties.filter((d) => d.status === 'served').length;
  const unmarked = today.duties.filter((d) => d.status === 'scheduled').length;
  const myNext = (mine.duties || [])
    .filter((d) => d.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const myLast = (mine.duties || [])
    .filter((d) => d.date < todayISO())
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const donut = stats?.month?.breakdown?.map((b) => ({ label: b.label, value: b.count, color: b.color })) || [];

  if (loading) return <Loading text="Загружаем данные класса…" />;

  return (
    <>
      {error ? <Alert type="error" title="Не удалось загрузить данные">{error}</Alert> : null}

      <div className="page-head">
        <div>
          <h1>Здравствуйте, {user?.firstName}!</h1>
          <div className="sub">{formatDateWithWeekday(todayISO())}</div>
        </div>
        <div className="page-actions">
          <Link to="/app/schedule" className="btn btn-secondary">
            <IconCalendar size={16} /> Календарь
          </Link>
          <Link to={isManager ? '/app/today' : '/app/my'} className="btn btn-primary">
            <IconToday size={16} /> {isManager ? 'Табло дня' : 'Моё дежурство'}
          </Link>
        </div>
      </div>

      <div className="grid grid-4 section">
        <StatCard
          label="Дежурных сегодня"
          value={today.duties.length}
          hint={today.duties.length ? today.duties.map((d) => d.studentName).join(', ') : 'Дежурных нет'}
          icon="👥"
          color="var(--brand-600)"
          bg="var(--brand-50)"
        />
        <StatCard
          label="Отмечено «Дежурил»"
          value={served}
          hint={`${Math.round((served / (today.duties.length || 1)) * 100)}% от сегодняшних`}
          icon="✅"
          color="var(--ok)"
          bg="var(--ok-bg)"
        />
        <StatCard
          label={isManager ? 'Болезни за месяц' : 'Моих дежурств всего'}
          value={isManager ? (stats?.month?.sick ?? 0) : (mine.duties?.length ?? 0)}
          hint={isManager ? `Освобождено: ${stats?.month?.excused ?? 0}` : 'Всего назначений в системе'}
          icon={isManager ? '🤒' : '📋'}
          color="var(--warn)"
          bg="var(--warn-bg)"
        />
        <StatCard
          label={isManager ? 'Замен за месяц' : 'Ждут отметки'}
          value={isManager ? (stats?.month?.replaced ?? 0) : unmarked}
          hint={isManager ? `Пропусков: ${stats?.month?.not_served ?? 0}` : 'Дежурств без статуса сегодня'}
          icon={isManager ? '🔄' : '⏳'}
          color="var(--purple)"
          bg="var(--purple-bg)"
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)' }}>
        <div className="card">
          <div className="card-head">
            <h3>
              <IconToday size={17} /> Кто дежурит сегодня
            </h3>
            <Link to="/app/today" className="btn btn-sm btn-secondary">
              Подробнее <IconChevronRight size={14} />
            </Link>
          </div>
          {today.duties.length === 0 ? (
            <EmptyState
              emoji="📅"
              title="На сегодня дежурных нет"
              description={
                isManager
                  ? 'Назначьте дежурных на сегодня, чтобы староста мог отмечать статусы.'
                  : 'Дежурных на сегодня не назначено.'
              }
              action={isManager ? <Link to="/app/today" className="btn btn-primary btn-sm">Назначить дежурных</Link> : null}
            />
          ) : (
            <div className="duty-list">
              {today.duties.map((duty) => (
                <div className="duty-item" key={duty.id}>
                  <Avatar name={duty.studentName} initials={duty.studentInitials} />
                  <div className="info">
                    <div className="name">{duty.studentName}</div>
                    <div className="meta">
                      {duty.comment ? <span>{duty.comment}</span> : <span>Без комментария</span>}
                      {duty.replacedByName ? (
                        <span className="badge badge-replaced">
                          Замена: {duty.replacedByName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge status={duty.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          {isManager ? (
            <>
              <div className="card">
                <div className="card-head">
                  <h3>
                    <IconChart size={17} /> Статусы за месяц
                  </h3>
                  <Link to="/app/board" className="btn btn-sm btn-secondary">Табло</Link>
                </div>
                <div className="card-body">
                  <DonutChart
                    data={donut}
                    centerLabel="дежурств за месяц"
                    centerValue={stats?.month?.total ?? 0}
                  />
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <IconUsers size={17} /> Требуют внимания
                  </h3>
                  <Link to="/app/students" className="btn btn-sm btn-secondary">
                    {studentsWord(stats?.students?.length ?? 0)}
                  </Link>
                </div>
                <div className="card-body">
                  {stats?.students?.length ? (
                    <div className="duty-list" style={{ margin: -20 }}>
                      {stats.students.slice(0, 5).map((s) => (
                        <Link
                          to={`/app/students/${s.id}`}
                          className="duty-item"
                          key={s.id}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Avatar name={s.fullName} initials={s.initials} size="sm" />
                          <div className="info">
                            <div className="name">{s.fullName}</div>
                            <div className="meta">{s.assigned} назначений · {s.notServed} пропусков</div>
                          </div>
                          <span className="badge badge-soft">{s.attendanceRate}%</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--ink-500)', fontSize: '.88rem', margin: 0 }}>Нет данных.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="card">
                <div className="card-head">
                  <h3>
                    <IconClock size={17} /> Ближайшее дежурство
                  </h3>
                </div>
                <div className="card-body">
                  {myNext ? (
                    <>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{formatDateShort(myNext.date)}</div>
                      <div style={{ color: 'var(--ink-500)', fontSize: '.87rem', marginBottom: 8 }}>
                        {formatDateWithWeekday(myNext.date)}
                      </div>
                      <StatusBadge status={myNext.status} />
                    </>
                  ) : (
                    <p style={{ color: 'var(--ink-500)', fontSize: '.88rem', margin: 0 }}>
                      У вас пока нет назначенных дежурств.
                    </p>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <IconCheck size={17} /> Последнее дежурство
                  </h3>
                  <Link to="/app/my" className="btn btn-sm btn-secondary">Вся история</Link>
                </div>
                <div className="card-body">
                  {myLast ? (
                    <>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{formatDateShort(myLast.date)}</div>
                      <div style={{ color: 'var(--ink-500)', fontSize: '.87rem', marginBottom: 8 }}>
                        {formatDateWithWeekday(myLast.date)}
                      </div>
                      <StatusBadge status={myLast.status} />
                      {myLast.comment ? (
                        <div style={{ fontSize: '.85rem', color: 'var(--ink-600)', marginTop: 8 }}>
                          {myLast.comment}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p style={{ color: 'var(--ink-500)', fontSize: '.88rem', margin: 0 }}>
                      Дежурств ещё не было.
                    </p>
                  )}
                </div>
              </div>

              {(mine.replacements || []).length ? (
                <div className="card">
                  <div className="card-head">
                    <h3>
                      <IconSwap size={17} /> Вы дежурили за других
                    </h3>
                  </div>
                  <div className="duty-list">
                    {mine.replacements.slice(0, 4).map((r) => (
                      <div className="duty-item" key={`${r.id}-${r.date}`}>
                        <div className="info">
                          <div className="name">{formatDateShort(r.date)} · вместо {r.forStudent}</div>
                          <div className="meta">{r.reason || 'Причина не указана'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {isManager && stats?.students ? (
        <div className="card section" style={{ marginTop: 18 }}>
          <div className="card-head">
            <h3>
              <IconWarning size={17} /> Пропуски за месяц
            </h3>
            <Link to="/app/reports" className="btn btn-sm btn-secondary">Полный отчёт</Link>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ученик</th>
                  <th className="num">Назначено</th>
                  <th className="num">Дежурил</th>
                  <th className="num">Не дежурил</th>
                  <th className="num">Болел</th>
                  <th className="num">Замены</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {stats.students.slice(0, 8).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/app/students/${s.id}`} className="cell-person" style={{ textDecoration: 'none' }}>
                        <Avatar name={s.fullName} initials={s.initials} size="sm" />
                        <span className="name">{s.fullName}</span>
                      </Link>
                    </td>
                    <td className="num">{s.assigned}</td>
                    <td className="num" style={{ color: 'var(--ok)', fontWeight: 600 }}>{s.served}</td>
                    <td className="num" style={{ color: 'var(--bad)', fontWeight: 600 }}>{s.notServed}</td>
                    <td className="num">{s.sick}</td>
                    <td className="num">{s.replaced}</td>
                    <td className="num">
                      <b>{s.attendanceRate}%</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.students.length > 8 ? (
            <div className="card-foot" style={{ fontSize: '.84rem', color: 'var(--ink-500)' }}>
              Показаны первые 8 из {stats.students.length}. Полная таблица — в разделе «Отчёты».
            </div>
          ) : null}
        </div>
      ) : null}

      {today.duties.length > 0 ? (
        <div style={{ marginTop: 18, fontSize: '.82rem', color: 'var(--ink-500)' }}>
          Сегодня дежурят {today.duties.length} {dutiesWord(today.duties.length)}. Статусы обновляет староста
          или куратор.
        </div>
      ) : null}
    </>
  );
}