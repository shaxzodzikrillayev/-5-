import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './Toast.jsx';
import { Avatar, RoleBadge } from './ui.jsx';
import { formatDateWithWeekday, todayISO } from '../lib/format.js';
import {
  IconMenu, IconHome, IconToday, IconCalendar, IconUsers, IconChart, IconReport,
  IconHistory, IconSwap, IconSettings, IconUser, IconLogout, IconList,
} from './icons.jsx';

const NAV = {
  main: [
    { to: '/app', label: 'Главная', icon: IconHome, end: true },
    { to: '/app/today', label: 'Сегодня', icon: IconToday, manager: true },
    { to: '/app/my', label: 'Моё дежурство', icon: IconList, student: true },
    { to: '/app/schedule', label: 'Календарь', icon: IconCalendar },
  ],
  manage: [
    { to: '/app/students', label: 'Ученики', icon: IconUsers, manager: true },
    { to: '/app/board', label: 'Табло', icon: IconChart, manager: true },
    { to: '/app/reports', label: 'Отчёты', icon: IconReport, manager: true },
    { to: '/app/replacements', label: 'Замены', icon: IconSwap, manager: true },
    { to: '/app/history', label: 'История', icon: IconHistory, manager: true },
    { to: '/app/settings', label: 'Настройки', icon: IconSettings, kurator: true },
  ],
  account: [{ to: '/app/profile', label: 'Профиль', icon: IconUser }],
};

function filterNav(items, { isManager, isKurator, isStudent }) {
  return items.filter((item) => {
    if (item.manager && !isManager) return false;
    if (item.kurator && !isKurator) return false;
    if (item.student && !isStudent) return false;
    return true;
  });
}

export default function Layout() {
  const { user, logout, isManager, isKurator, isStudent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.info('Вы вышли из системы');
    navigate('/login', { replace: true });
  };

  const scope = { isManager, isKurator, isStudent };
  const mainNav = filterNav(NAV.main, scope);
  const manageNav = filterNav(NAV.manage, scope);
  const accountNav = filterNav(NAV.account, scope);

  const titleMap = {
    '/app': 'Обзор',
    '/app/today': 'Сегодня',
    '/app/my': 'Моё дежурство',
    '/app/schedule': 'Календарь дежурств',
    '/app/students': 'Ученики',
    '/app/board': 'Табло',
    '/app/reports': 'Месячные отчёты',
    '/app/replacements': 'Замены',
    '/app/history': 'История изменений',
    '/app/settings': 'Настройки',
    '/app/profile': 'Профиль',
  };
  const currentTitle =
    titleMap[location.pathname]
    || (location.pathname.startsWith('/app/students/') ? 'Ученик' : 'Дежурство');

  const linkClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;

  const BottomLink = ({ item }) => {
    const Icon = item.icon;
    return (
      <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
        <Icon size={19} />
        <span>{item.label.split(' ')[0]}</span>
      </NavLink>
    );
  };

  const mobileNav = [];
  [...mainNav.slice(0, 3), manageNav[0], accountNav[0]].forEach((item) => {
    if (item && !mobileNav.includes(item)) mobileNav.push(item);
  });

  return (
    <div className="app-shell">
      {menuOpen ? <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} /> : null}

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <span className="logo">
            <IconCalendar size={19} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="title">Дежурство класса</div>
            <div className="subtitle truncate">Панель управления</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {mainNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}

          {manageNav.length > 0 ? <div className="nav-section">Управление</div> : null}
          {manageNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}

          <div className="nav-section">Аккаунт</div>
          {accountNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <Avatar name={user?.fullName} initials={user?.initials} size="sm" />
            <div className="info">
              <div className="name" title={user?.fullName}>{user?.fullName}</div>
              <div className="role">{user?.roleLabel}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ color: '#94a3b8' }}
              onClick={handleLogout}
              title="Выйти"
              aria-label="Выйти из системы"
            >
              <IconLogout size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-secondary btn-icon mobile-only"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
          >
            <IconMenu size={19} />
          </button>
          <h1>{currentTitle}</h1>
          <div className="spacer" />
          <span className="topbar-date">{formatDateWithWeekday(todayISO())}</span>
          <RoleBadge role={user?.role} />
          <NavLink to="/app/profile" className="desktop-only" aria-label="Профиль">
            <Avatar name={user?.fullName} initials={user?.initials} size="sm" />
          </NavLink>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        {mobileNav.map((item) => (
          <BottomLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  );
}