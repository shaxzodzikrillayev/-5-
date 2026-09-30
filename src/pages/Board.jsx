import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Alert, Avatar, EmptyState, Loading, StatCard } from '../components/ui.jsx';
import { BarChart, DonutChart } from '../components/Charts.jsx';
import { currentMonthISO, formatMonth, percent, shiftMonth, studentsWord } from '../lib/format.js';
import { IconChart, IconChevronLeft, IconChevronRight, IconTrophy, IconRefresh } from '../components/icons.jsx';

export default function Board() {
  const [month, setMonth] = useState(currentMonthISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/statistics?month=${month}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const ranking = useMemo(() => {
    const list = (data?.students || [])
      .filter((s) => s.assigned > 0)
      .sort((a, b) => b.attendanceRate - a.attendanceRate || b.assigned - a.assigned);
    return list;
  }, [data]);

  const worst = useMemo(() => ranking.slice().reverse().slice(0, 5), [ranking]);
  const top = useMemo(() => ranking.slice(0, 5), [ranking]);

  const donutData = useMemo(() => {
    const b = data?.month?.breakdown || [];
    return b.map((item) => ({ label: item.label, value: item.count, color: item.color }));
  }, [data]);

  const weeklyData = useMemo(
    () => (data?.weekly || []).map((w) => ({ label: w.start.slice(8, 10), value: w.served, color: '#16a34a' })),
    [data],
  );

  if (loading && !data) return <Loading text="Считаем показатели…" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Табло показателей</h1>
          <div className="sub" style={{ textTransform: 'capitalize' }}>{formatMonth(month)}</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">
            <IconChevronLeft size={17} />
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMonth(currentMonthISO())} disabled={month === currentMonthISO()}>
            Текущий
          </button>
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">
            <IconChevronRight size={17} />
          </button>
          <button type="button" className="btn btn-secondary btn-icon" onClick={load} aria-label="Обновить">
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      <div className="grid grid-4 section">
        <StatCard label="Дежурств за месяц" value={data?.month.total ?? 0} icon="📋" color="var(--brand-600)" bg="var(--brand-50)" />
        <StatCard label="Выполнено" value={data?.month.served ?? 0} hint={`Процент: ${data?.month.attendanceRate ?? 0}%`} icon="✅" color="var(--ok)" bg="var(--ok-bg)" />
        <StatCard label="Не выполнено" value={data?.month.failed ?? 0} hint="Не дежурил + отсутствовал" icon="⚠️" color="var(--bad)" bg="var(--bad-bg)" />
        <StatCard label="Замены" value={data?.month.replaced ?? 0} icon="🔄" color="var(--purple)" bg="var(--purple-bg)" />
      </div>

      <div className="grid grid-2 section">
        <div className="card">
          <div className="card-head">
            <h3><IconChart size={17} /> Статусы за месяц</h3>
          </div>
          <div className="card-body">
            {donutData.length === 0 ? (
              <EmptyState emoji="📊" title="Нет данных" description="В этом месяце дежурств ещё не было." />
            ) : (
              <DonutChart data={donutData} centerLabel="Дежурств" centerValue={data.month.total} size={200} />
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><IconChart size={17} /> Выполнено по неделям (8 недель)</h3>
          </div>
          <div className="card-body">
            <BarChart data={weeklyData} height={200} />
          </div>
        </div>
      </div>

      <div className="grid grid-2 section">
        <div className="card">
          <div className="card-head">
            <h3><IconTrophy size={17} /> Лучшие</h3>
          </div>
          {top.length === 0 ? (
            <EmptyState emoji="🏅" title="Нет данных" description="Пока нет выполненных дежурств за месяц." />
          ) : (
            <div className="rank-list">
              {top.map((s, i) => (
                <Link to={`/app/students/${s.id}`} className="rank-item" key={s.id}>
                  <span className={`rank-num rank-${i + 1}`}>{i + 1}</span>
                  <Avatar name={s.fullName} initials={s.initials} size="sm" />
                  <span className="name">{s.fullName}</span>
                  <span className="rank-value">{s.attendanceRate}% <span className="sub">({s.served}/{s.assigned})</span></span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>⚠️ Требуют внимания</h3>
          </div>
          {worst.length === 0 ? (
            <EmptyState emoji="🎉" title="Проблем нет" description="У всех учеников высокий процент выполнения." />
          ) : (
            <div className="rank-list">
              {worst.map((s) => (
                <Link to={`/app/students/${s.id}`} className="rank-item" key={s.id}>
                  <span className="rank-num" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}>
                    {s.failed}
                  </span>
                  <Avatar name={s.fullName} initials={s.initials} size="sm" />
                  <span className="name">{s.fullName}</span>
                  <span className="rank-value" style={{ color: s.attendanceRate < 60 ? 'var(--bad)' : 'var(--ink-600)' }}>
                    {s.attendanceRate}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <h3>Полная таблица за месяц</h3>
          <span className="badge badge-soft">{(data?.students || []).length} {studentsWord((data?.students || []).length)}</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Назначено</th>
                <th>Дежурил</th>
                <th>Не дежурил</th>
                <th>Болел</th>
                <th>Замены</th>
                <th>Процент</th>
              </tr>
            </thead>
            <tbody>
              {(data?.students || []).length === 0 ? (
                <tr><td colSpan={7}><EmptyState emoji="📭" title="Нет данных" /></td></tr>
              ) : null}
              {(data?.students || []).map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/app/students/${s.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                      {s.fullName}
                    </Link>
                  </td>
                  <td>{s.assigned}</td>
                  <td style={{ color: 'var(--ok)', fontWeight: 600 }}>{s.served}</td>
                  <td style={{ color: s.notServed ? 'var(--bad)' : undefined }}>{s.notServed}</td>
                  <td>{s.sick}</td>
                  <td>{s.replaced}</td>
                  <td>
                    <div className="mini-bar">
                      <span
                        style={{
                          width: `${s.attendanceRate}%`,
                          background: s.attendanceRate >= 80 ? 'var(--ok)' : s.attendanceRate >= 50 ? 'var(--warn)' : 'var(--bad)',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '.8rem' }}>{s.attendanceRate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}