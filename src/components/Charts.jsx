import { useId } from 'react';

/** Кольцевая диаграмма. */
export function DonutChart({ data = [], size = 190, thickness = 26, centerLabel, centerValue }) {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total === 0) {
    return (
      <div className="empty" style={{ padding: '20px' }}>
        <p>Нет данных за выбранный период</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Диаграмма статусов">
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="var(--ink-100)" strokeWidth={thickness} />
          {data.map((item, i) => {
            if (!item.value) return null;
            const length = (item.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={`${item.label}-${i}`}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <title>{`${item.label}: ${item.value}`}</title>
              </circle>
            );
            offset += length;
            return element;
          })}
        </g>
        {(centerValue !== undefined || centerLabel) && (
          <>
            <text
              x="50%"
              y="48%"
              textAnchor="middle"
              style={{ fontSize: 26, fontWeight: 800, fill: 'var(--ink-900)' }}
            >
              {centerValue ?? total}
            </text>
            {centerLabel ? (
              <text x="50%" y="60%" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ink-500)' }}>
                {centerLabel}
              </text>
            ) : null}
          </>
        )}
      </svg>
      <div style={{ minWidth: 130 }}>
        {data.map((item, i) => (
          <div
            key={`${item.label}-${i}`}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0', fontSize: '.85rem' }}
          >
            <span className="legend-swatch" style={{ background: item.color }} />
            <span style={{ flex: 1, color: 'var(--ink-600)' }}>{item.label}</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Столбчатая диаграмма.
 *
 * Поддерживает два формата данных:
 *  - одиночный ряд:  data = [{ label, value, color }]  → series не нужен;
 *  - несколько рядов: data = [{ label, served: 3, ... }] + series = [{ key, label, color }].
 */
export function BarChart({ data = [], series, height = 200, valueLabel = 'значений' }) {
  const gradientId = useId().replace(/:/g, '');
  const activeSeries = Array.isArray(series) && series.length
    ? series
    : [{ key: 'value', label: valueLabel, color: 'var(--brand-500)' }];

  if (!data.length) {
    return (
      <div className="empty" style={{ padding: '20px' }}>
        <p>Нет данных для графика</p>
      </div>
    );
  }

  const width = 700;
  const padTop = 14;
  const padBottom = 26;
  const padLeft = 8;
  const padRight = 8;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => Math.max(...activeSeries.map((s) => Number(d[s.key]) || 0))));
  const groupW = plotW / data.length;
  const barW = Math.max(4, Math.min(22, (groupW - 6) / activeSeries.length));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`График: ${valueLabel}`}>
        <defs>
          {activeSeries.map((s, i) => (
            <linearGradient key={`${s.key}-${i}`} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="1" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.62" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + plotH * (1 - ratio)}
            y2={padTop + plotH * (1 - ratio)}
            stroke="var(--ink-100)"
            strokeWidth="1"
          />
        ))}
        {data.map((d, i) => {
          const groupX = padLeft + groupW * i;
          const offsetX = (groupW - barW * activeSeries.length) / 2;
          return (
            <g key={`${d.label ?? i}-${i}`}>
              {activeSeries.map((s, si) => {
                const value = Number(d[s.key]) || 0;
                const h = (value / max) * plotH;
                const x = groupX + offsetX + barW * si;
                const y = padTop + plotH - h;
                return (
                  <rect
                    key={`${s.key}-${si}`}
                    x={x}
                    y={y}
                    width={barW - 2}
                    height={Math.max(h, value > 0 ? 2 : 0)}
                    rx={Math.min(4, barW / 3)}
                    fill={`url(#${gradientId}-${si})`}
                  >
                    <title>{`${d.label} — ${s.label}: ${value}`}</title>
                  </rect>
                );
              })}
              {data.length <= 16 ? (
                <text
                  x={groupX + groupW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  style={{ fontSize: 10, fill: 'var(--ink-500)' }}
                >
                  {d.label}
                </text>
) : null}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {activeSeries.map((s, i) => (
          <div className="legend-item" key={`${s.key}-${i}`}>
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Линейный график динамики. series обязателен; при пустых данных показывает заглушку.
 */
export function LineChart({ data = [], series = [], height = 210 }) {
  if (!data.length || !series.length) {
    return (
      <div className="empty" style={{ padding: '20px' }}>
        <p>Нет данных для графика</p>
      </div>
    );
  }

  const width = 700;
  const padTop = 14;
  const padBottom = 26;
  const padLeft = 8;
  const padRight = 10;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));

  const points = (key) =>
    data.map((d, i) => {
      const x = padLeft + (data.length === 1 ? plotW / 2 : (plotW / (data.length - 1)) * i);
      const y = padTop + plotH - ((d[key] || 0) / max) * plotH;
      return [x, y];
    });

  const step = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Динамика по дням">
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + plotH * (1 - ratio)}
            y2={padTop + plotH * (1 - ratio)}
            stroke="var(--ink-100)"
          />
        ))}
        {series.map((s, si) => {
          const pts = points(s.key);
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
          const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${padTop + plotH} L${pts[0][0].toFixed(1)},${padTop + plotH} Z`;
          return (
            <g key={`${s.key}-${si}`}>
              {s.fill !== false ? <path d={area} fill={s.color} opacity="0.1" /> : null}
              <path d={path} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={data.length > 40 ? 0 : 3} fill="#fff" stroke={s.color} strokeWidth="2">
                  <title>{`${data[i].label}: ${data[i][s.key] ?? 0}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % step !== 0) return null;
          const x = padLeft + (data.length === 1 ? plotW / 2 : (plotW / (data.length - 1)) * i);
          return (
            <text key={i} x={x} y={height - 8} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--ink-500)' }}>
              {d.label}
            </text>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <div className="legend-item" key={s.key}>
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Горизонтальные полосы — универсальная диаграмма по именам. */
export function HorizontalBars({ items = [], max, showValues = true }) {
  const top = max || Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div>
      {items.map((item, i) => (
        <div className="bar-row" key={`${item.key ?? item.label}-${i}`}>
          {item.label ? (
            <div className="bar-label" title={item.label}>
              {item.label}
            </div>
          ) : null}
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.round(((item.value || 0) / top) * 100)}%`, background: item.color || 'var(--brand-500)' }}
            />
          </div>
          {showValues ? (
            <div className="bar-value" style={{ width: item.valueWidth || 42 }}>
              {item.value}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}