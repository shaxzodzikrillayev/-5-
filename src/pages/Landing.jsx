import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconCalendar, IconCheck, IconChart, IconSparkle, IconHistory,
  IconSwap, IconShield, IconUsers,
} from '../components/icons.jsx';

const FEATURES = [
  { icon: <IconCalendar size={21} color="#4f46e5" />, title: 'Календарь дежурств', text: 'Расписание на месяц вперёд с отметками выполнения, болезней и замен.' },
  { icon: <IconCheck size={21} color="#16a34a" />, title: 'Честные статусы', text: 'Дежурил, не дежурил, болел, освобождён, замена — в один клик.' },
  { icon: <IconSwap size={21} color="#9333ea" />, title: 'Система замен', text: 'Оформление замены в пару кликов: кто вместо кого и по какой причине.' },
  { icon: <IconChart size={21} color="#2563eb" />, title: 'Статистика и графики', text: 'Табло за день, неделю и месяц с наглядными диаграммами.' },
  { icon: <IconReportish />, title: 'Месячные отчёты', text: 'Таблица по каждому ученику с историей и выгрузкой в CSV.' },
  { icon: <IconHistory size={21} color="#0f766e" />, title: 'История изменений', text: 'Кто, кого, когда и какой статус изменил — всё сохраняется.' },
];

function IconReportish() {
  return <IconUsers size={21} color="#b45309" />;
}

const ROLES = [
  { cls: 'role-student', icon: '🎒', title: 'Ученик', text: 'Видит своё дежурство, кто дежурит сегодня и общую статистику класса.' },
  { cls: 'role-starosta', icon: '⭐', title: 'Староста', text: 'Отмечает статусы, назначает и меняет дежурных, оформляет замены.' },
  { cls: 'role-kurator', icon: '🧑‍🏫', title: 'Куратор', text: 'Полный доступ: ученики, роли, исправление ошибок, журнал изменений.' },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/app', { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand">
          <span className="logo">
            <IconCalendar size={19} />
          </span>
          Дежурство класса
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <Link to="/login" className="btn btn-secondary">Войти</Link>
          <Link to="/register" className="btn btn-primary">Регистрация</Link>
        </div>
      </nav>

      <header className="hero">
        <div>
          <h1>
            Дежурство класса —<br />
            <span className="grad">под контролем</span>
          </h1>
          <p className="lead">
            Система управления дежурством: расписание, статусы, замены, статистика и месячные отчёты.
            Ученик видит своё дежурство, староста отмечает выполнение, куратор контролирует всё.
          </p>
          <div className="hero-cta">
            <Link to="/register" className="btn btn-primary btn-lg">
              Начать бесплатно
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Войти в систему
            </Link>
          </div>
          <div className="hero-note">
            <IconShield size={16} color="#16a34a" />
            Пароли хранятся в виде хеша, сессия — в защищённой cookie, роли проверяются на сервере
          </div>
        </div>

        <div className="hero-visual">
          <div className="demo-card">
            <div className="demo-title">Сегодня · дежурные</div>
            <div className="demo-row">
              <span className="avatar avatar-sm avatar-tint-1">ШЗ</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.87rem' }}>Шахзод Зикриллаев</div>
                <div style={{ fontSize: '.74rem', color: 'var(--ink-500)' }}>Дежурил с 8:00 до 14:00</div>
              </div>
              <span className="badge badge-served"><span className="badge-dot" />Дежурил</span>
            </div>
            <div className="demo-row">
              <span className="avatar avatar-sm avatar-tint-3">БН</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.87rem' }}>Бекзод Нурматов</div>
                <div style={{ fontSize: '.74rem', color: 'var(--ink-500)' }}>Замена за Азизу</div>
              </div>
              <span className="badge badge-replaced"><span className="badge-dot" />Замена</span>
            </div>
            <div className="demo-row">
              <span className="avatar avatar-sm avatar-tint-4">АТ</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.87rem' }}>Азиза Тухтаева</div>
                <div style={{ fontSize: '.74rem', color: 'var(--ink-500)' }}>Болел, справка</div>
              </div>
              <span className="badge badge-sick"><span className="badge-dot" />Болел</span>
            </div>
          </div>

          <div className="demo-card">
            <div className="demo-title">Статистика месяца</div>
            <div className="demo-bar">
              <div style={{ background: '#16a34a', flex: 6 }} />
              <div style={{ background: '#f59e0b', flex: 1 }} />
              <div style={{ background: '#2563eb', flex: 0.6 }} />
              <div style={{ background: '#9333ea', flex: 0.5 }} />
              <div style={{ background: '#dc2626', flex: 0.8 }} />
            </div>
            <div className="legend">
              <span className="legend-item"><span className="legend-swatch" style={{ background: '#16a34a' }} />Дежурили 62</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: '#f59e0b' }} />Болели 10</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: '#2563eb' }} />Освобождены 6</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: '#9333ea' }} />Замены 5</span>
            </div>
          </div>
        </div>
      </header>

      <section className="features">
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="roles-strip">
        <div className="section-title">
          <div>
            <h2>Три роли — разные возможности</h2>
            <p style={{ color: 'var(--ink-500)', margin: 0 }}>
              Регистрация ученика открыта сразу. Для старосты и куратора нужен код доступа.
            </p>
          </div>
        </div>
        <div className="grid grid-3">
          {ROLES.map((r) => (
            <div className={`role-card ${r.cls}`} key={r.title}>
              <span className="rc-icon" aria-hidden="true">{r.icon}</span>
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <IconSparkle size={16} />
          Система управления дежурством класса
        </div>
        <div>Работает на телефоне, планшете и компьютере</div>
      </footer>
    </div>
  );
}