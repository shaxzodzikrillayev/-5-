import { avatarTint, roleMeta, statusMeta } from '../lib/format.js';

export function Avatar({ name = '', initials, size = '', tint }) {
  const text =
    initials ||
    (name
      ? name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
      : '?');
  return (
    <span
      className={`avatar ${size ? `avatar-${size}` : ''} ${tint !== undefined ? `avatar-tint-${tint}` : avatarTint(name)}`}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

export function StatusBadge({ status, size, showDot = true }) {
  const meta = statusMeta(status);
  return (
    <span className={`badge badge-${status}`}>
      {showDot ? <span className="badge-dot" /> : null}
      {meta.label}
    </span>
  );
}

export function RoleBadge({ role }) {
  const meta = roleMeta(role);
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}

export function PersonCell({ name, initials, subtitle, avatarSize = '', right }) {
  return (
    <div className="cell-person">
      <Avatar name={name} initials={initials} size={avatarSize} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="name">{name}</div>
        {subtitle ? <div className="cell-sub">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, color = 'var(--brand-500)', bg = 'var(--brand-50)', accent = true }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon ? (
          <span className="stat-icon" style={{ background: bg, color }} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
      {accent ? <div className="stat-accent" style={{ background: color }} /> : null}
    </div>
  );
}

export function EmptyState({ emoji = '📭', title, description, action }) {
  return (
    <div className="empty">
      <div className="emoji" aria-hidden="true">
        {emoji}
      </div>
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ text = 'Загрузка…' }) {
  return (
    <div className="loading-page">
      <div className="spinner spinner-lg" />
      <div>{text}</div>
    </div>
  );
}

export function PageLoader({ text }) {
  return <Loading text={text} />;
}

export function Alert({ type = 'info', title, children }) {
  const icons = { info: 'ℹ️', error: '⚠️', warn: '⚠️', ok: '✅' };
  return (
    <div className={`alert alert-${type}`}>
      <span aria-hidden="true">{icons[type] || icons.info}</span>
      <div>
        {title ? <strong>{title}</strong> : null}
        {title ? <br /> : null}
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, total, color = 'var(--brand-500)', label, valueText }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bar-row">
      {label ? <div className="bar-label" title={label}>{label}</div> : null}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="bar-value">{valueText ?? `${pct}%`}</div>
    </div>
  );
}