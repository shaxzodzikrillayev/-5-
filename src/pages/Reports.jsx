import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_BASE } from '../lib/api.js';
import { Modal } from '../components/Modal.jsx';
import { Alert, Avatar, EmptyState, Loading, StatCard, StatusBadge } from '../components/ui.jsx';
import { DonutChart } from '../components/Charts.jsx';
import {
  currentMonthISO, dutiesWord, formatDateShort, formatMonth, formatMonthShort, shiftMonth, statusMeta,
} from '../lib/format.js';
import { IconReport, IconDownload, IconChevronLeft, IconChevronRight, IconList } from '../components/icons.jsx';

export default function Reports() {
  const [month, setMonth] = useState(currentMonthISO());
  const [data, setData] = useState(null);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailStudentId, setDetailStudentId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = detailStudentId ? `&studentId=${detailStudentId}` : '';
      const res = await api.get(`/reports/month?month=${month}${query}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, detailStudentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/reports/months').then((r) => setMonths(r.months || [])).catch(() => setMonths([]));
  }, [month]);

  const donut = useMemo(() => {
    const t = data?.totals;
    if (!t || !t.assigned) return [];
    return [
      { label: 'Дежурил', value: t.served, color: '#16a34a' },
      { label: 'Не дежурил', value: t.notServed, color: '#dc2626' },
      { label: 'Отсутствовал', value: t.absent, color: '#475569' },
      { label: 'Болел', value: t.sick, color: '#f59e0b' },
      { label: 'Освобождён', value: t.excused, color: '#2563eb' },
      { label: 'Замена', value: t.replaced, color: '#9333ea' },
    ].filter((x) => x.value > 0);
  }, [data]);

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_BASE}/reports/export?month=${month}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Не удалось сформировать файл');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Отчёт-дежурство-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const totals = data?.totals;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Месячные отчёты</h1>
          <div className="sub" style={{ textTransform: 'capitalize' }}>
            {formatMonth(month)} · период {formatDateShort(data?.range.start)} — {formatDateShort(data?.range.end)}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">
            <IconChevronLeft size={17} />
          </button>
          <select className="select" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Месяц">
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {formatMonth(m.month)} ({m.duties})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">
            <IconChevronRight size={17} />
          </button>
          <button type="button" className="btn btn-primary" onClick={exportCsv}>
            <IconDownload size={16} /> Скачать CSV
          </button>
        </div>
      </div>

      {error ? <Alert type="error" title="Ошибка">{error}</Alert> : null}

      {loading ? (
        <Loading text="Формируем отчёт…" />
      ) : !totals || totals.assigned === 0 ? (
        <div className="card">
          <EmptyState emoji="📄" title="Нет данных за месяц" description="Выберите другой месяц или назначьте дежурных." />
        </div>
      ) : (
        <>
          <div className="grid grid-4 section">
            <StatCard label="Назначено" value={totals.assigned} icon="📋" color="var(--brand-600)" bg="var(--brand-50)" />
            <StatCard label="Дежурил" value={totals.served} hint={`Процент: ${totals.attendanceRate}%`} icon="✅" color="var(--ok)" bg="var(--ok-bg)" />
            <StatCard label="Проблемы" value={totals.failed + totals.sick} hint={`Не дежурил: ${totals.notServed} · Болел: ${totals.sick}`} icon="⚠️" color="var(--bad)" bg="var(--bad-bg)" />
            <StatCard label="Замены" value={totals.replaced} icon="🔄" color="var(--purple)" bg="var(--purple-bg)" />
          </div>

          <div className="grid grid-2 section" style={{ alignItems: 'start' }}>
            <div className="card">
              <div className="card-head"><h3><IconReport size={17} /> Сводка по статусам</h3></div>
              <div className="card-body">
                <DonutChart data={donut} centerLabel="Назначено" centerValue={totals.assigned} size={200} />
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Комментарий к отчёту</h3></div>
              <div className="card-body">
                <div className="report-summary">
                  <p>
                    За {formatMonth(month)} классу было назначено <b>{totals.assigned}</b> {dutiesWord(totals.assigned)}.
                    Дежурство выполнено в <b>{totals.served}</b> случаях ({totals.attendanceRate}%).
                  </p>
                  <ul className="report-list">
                    <li>Не дежурили: <b>{totals.notServed}</b></li>
                    <li>Отсутствовали: <b>{totals.absent}</b></li>
                    <li>Болели: <b>{totals.sick}</b></li>
                    <li>Освобождены по уважительной причине: <b>{totals.excused}</b></li>
                    <li>Оформлено замен: <b>{totals.replaced}</b></li>
                    {totals.scheduled ? <li>Ожидают отметки: <b>{totals.scheduled}</b></li> : null}
                  </ul>
                  {totals.failed > 0 ? (
                    <Alert type="warn" title="Требуется работа">
                      Суммарно {totals.failed} {dutiesWord(totals.failed)} не выполнено. Рассмотрите индивидуальную беседу.
                    </Alert>
                  ) : (
                    <Alert type="ok" title="Отлично">
                      За месяц нет невыполненных дежурств.
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card section">
            <div className="card-head">
              <h3><IconList size={17} /> Таблица по ученикам</h3>
              <span className="badge badge-soft">Нажмите на строку для деталей</span>
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
                    <th>Освобождён</th>
                    <th>Замены</th>
                    <th>Неявки</th>
                    <th>Процент</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table.map((row) => (
                    <tr key={row.student.id} className="clickable" onClick={() => setDetailStudentId(row.student.id)}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={row.student.fullName} initials={row.student.initials} size="sm" />
                          <span className="name">{row.student.fullName}</span>
                        </div>
                      </td>
                      <td>{row.detail.assigned}</td>
                      <td style={{ color: 'var(--ok)', fontWeight: 600 }}>{row.detail.served}</td>
                      <td style={{ color: row.detail.notServed ? 'var(--bad)' : undefined }}>{row.detail.notServed}</td>
                      <td>{row.detail.sick}</td>
                      <td>{row.detail.excused}</td>
                      <td>{row.detail.replaced}</td>
                      <td>{row.detail.absent}</td>
                      <td style={{ fontWeight: 700 }}>{row.detail.attendanceRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal
        open={!!detailStudentId}
        title="Детали по ученику"
        subtitle={data?.table.find((r) => r.student.id === detailStudentId)?.student.fullName}
        onClose={() => setDetailStudentId('')}
        size="lg"
      >
        {(data?.detail?.entries || []).length === 0 ? (
          <EmptyState emoji="📭" title="Нет записей" description="За этот месяц у ученика не было дежурств." />
        ) : (
          <div className="duty-list" style={{ margin: '-22px' }}>
            {data.detail.entries.map((e, idx) => (
              <div className="duty-item" key={`${e.id}-${idx}`}>
                <div className="avatar" style={{ background: `${e.color}22`, color: e.color }}>{e.date.slice(8, 10)}</div>
                <div className="info">
                  <div className="name">{formatDateShort(e.date)}</div>
                  <div className="meta">
                    {e.replacement ? <span>замена: {e.replacement}</span> : null}
                    {e.replacementReason || e.comment ? <span>💬 {e.replacementReason || e.comment}</span> : null}
                  </div>
                </div>
                <span className="badge" style={{ background: `${e.color}1a`, color: e.color }}>{e.statusLabel}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}