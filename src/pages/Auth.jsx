import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { Alert } from '../components/ui.jsx';
import { IconCalendar, IconShield, IconCheck, IconSparkle } from '../components/icons.jsx';

const DEMO = [
  { label: 'Куратор', email: 'kurator@school.uz', password: 'kurator123' },
  { label: 'Староста', email: 'starosta@school.uz', password: 'starosta123' },
  { label: 'Ученик', email: 'student2@school.uz', password: 'student123' },
];

function AuthAside() {
  return (
    <aside className="auth-side">
      <div className="brand">
        <span className="logo">
          <IconCalendar size={19} />
        </span>
        Дежурство класса
      </div>
      <div>
        <h2>Порядок в классе начинается с расписания</h2>
        <p>Один сервис вместо таблиц в чатах: дежурства, статусы, замены и отчёты.</p>
        <div className="auth-points">
          <div className="auth-point">
            <span className="pt-icon"><IconCheck size={13} /></span>
            Ученик видит своё дежурство и кто дежурит сегодня
          </div>
          <div className="auth-point">
            <span className="pt-icon"><IconCheck size={13} /></span>
            Староста отмечает выполнение в один клик
          </div>
          <div className="auth-point">
            <span className="pt-icon"><IconCheck size={13} /></span>
            Куратор контролирует статистику и историю изменений
          </div>
          <div className="auth-point">
            <span className="pt-icon"><IconShield size={13} /></span>
            Пароли в хешах, сессия в httpOnly cookie, доступ по ролям
          </div>
        </div>
      </div>
      <div style={{ fontSize: '.8rem', opacity: 0.6 }}>Система управления дежурством класса</div>
    </aside>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState(null);

  useEffect(() => {
    // Показываем демо-доступы только если в базе действительно есть аккаунты.
    let alive = true;
    api.get('/settings')
      .then((s) => {
        if (alive) setDemoAccounts(s?.kuratorExists ? DEMO : []);
      })
      .catch(() => {
        if (alive) setDemoAccounts([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const redirectTo = location.state?.from?.pathname || '/app';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form);
      toast.success(`Здравствуйте, ${user.firstName}!`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (account) => {
    setForm({ email: account.email, password: account.password });
    setError('');
  };

  return (
    <div className="auth-page">
      <AuthAside />
      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-head">
            <h1>Вход в систему</h1>
            <p>Введите email или логин и пароль</p>
          </div>

          {error ? <Alert type="error">{error}</Alert> : null}

          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">Email или логин</label>
              <input
                id="email"
                className="input"
                type="text"
                autoComplete="username"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="starosta@school.uz"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <span className="spinner spinner-light" /> : null}
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
          </form>

          <div className="auth-switch">
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </div>

          {demoAccounts?.length ? (
            <div className="demo-creds">
              <div className="dc-title">
                <IconSparkle size={11} style={{ verticalAlign: -1 }} /> Демо-доступы (нажмите, чтобы подставить)
              </div>
              {demoAccounts.map((acc) => (
                <button type="button" key={acc.email} onClick={() => fillDemo(acc)}>
                  <span>{acc.label}</span>
                  <code>{acc.email} · {acc.password}</code>
                </button>
              ))}
            </div>
          ) : null}

          {demoAccounts?.length === 0 ? (
            <div className="demo-creds">
              <div className="dc-title">Система ещё не запущена</div>
              <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--ink-600)', lineHeight: 1.5 }}>
                Аккаунтов пока нет. Первый, кто зарегистрируется как{' '}
                <strong>куратор</strong>, станет администратором класса — код для регистрации не потребуется.
              </p>
              <button type="button" onClick={() => navigate('/register', { replace: true })}>
                <span>Создать аккаунт куратора</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', password2: '', role: 'student', code: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings')
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const kuratorExists = settings?.kuratorExists ?? true;
  const isFirstKurator = form.role === 'kurator' && !kuratorExists;
  const needsCode = form.role !== 'student' && !isFirstKurator;
  const codeHint = kuratorExists
    ? 'Код выдаёт куратор или администратор школы.'
    : 'Куратора в системе ещё нет — регистрация без кода, вы станете первым.';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.password2) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      const user = await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        code: needsCode ? form.code : undefined,
      });
      toast.success(`Регистрация завершена. Добро пожаловать, ${user.firstName}!`);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const roleOptions = [
    { value: 'student', icon: '🎒', name: 'Ученик', hint: 'Без кода' },
    { value: 'starosta', icon: '⭐', name: 'Староста', hint: 'Нужен код' },
    { value: 'kurator', icon: '🧑‍🏫', name: 'Куратор', hint: kuratorExists ? 'Нужен код' : 'Первый — без кода' },
  ];

  return (
    <div className="auth-page">
      <AuthAside />
      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-head">
            <h1>Регистрация</h1>
            <p>Создайте аккаунт и выберите роль</p>
          </div>

          {error ? <Alert type="error">{error}</Alert> : null}

          <form onSubmit={submit} noValidate>
            <div className="row">
              <div className="field">
                <label htmlFor="firstName">Имя <span className="req">*</span></label>
                <input
                  id="firstName"
                  className="input"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Шахзод"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lastName">Фамилия <span className="req">*</span></label>
                <input
                  id="lastName"
                  className="input"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Зикриллаев"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="reg-email">Email <span className="req">*</span></label>
              <input
                id="reg-email"
                className="input"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="student1@school.uz"
                required
              />
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="reg-password">Пароль <span className="req">*</span></label>
                <input
                  id="reg-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Минимум 6 символов"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="reg-password2">Повторите пароль <span className="req">*</span></label>
                <input
                  id="reg-password2"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.password2}
                  onChange={(e) => setForm({ ...form, password2: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Роль <span className="req">*</span></label>
              <div className="role-choice">
                {roleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`role-option${form.role === opt.value ? ' active' : ''}`}
                    onClick={() => setForm({ ...form, role: opt.value, code: '' })}
                    aria-pressed={form.role === opt.value}
                  >
                    <span className="ro-icon" aria-hidden="true">{opt.icon}</span>
                    <span className="ro-name">{opt.name}</span>
                    <span className="ro-hint">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {needsCode ? (
              <div className="field">
                <label htmlFor="code">
                  <IconShield size={13} style={{ verticalAlign: -2 }} /> Код подтверждения роли <span className="req">*</span>
                </label>
                <input
                  id="code"
                  className="input"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder={form.role === 'kurator' ? 'Код куратора' : 'Код старосты'}
                  autoComplete="off"
                />
                <div className="hint">{codeHint}</div>
              </div>
            ) : null}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <span className="spinner spinner-light" /> : null}
              {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
            </button>
          </form>

          <div className="auth-switch">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </div>
        </div>
      </div>
    </div>
  );
}