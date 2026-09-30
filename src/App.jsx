import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { Loading } from './components/ui.jsx';

import Landing from './pages/Landing.jsx';
import { LoginPage, RegisterPage } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TodayBoard from './pages/TodayBoard.jsx';
import MyDuties from './pages/MyDuties.jsx';
import Schedule from './pages/Schedule.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Board from './pages/Board.jsx';
import Reports from './pages/Reports.jsx';
import Replacements from './pages/Replacements.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import NotFound from './pages/NotFound.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);
  return null;
}

/** Требует авторизации; при отсутствии сессии — на /login с сохранением адреса. */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading text="Проверяем сессию…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Доступно только старосте/куратору. */
function RequireManager({ children }) {
  const { isManager, loading } = useAuth();
  if (loading) return <Loading text="Проверяем права…" />;
  if (!isManager) return <Navigate to="/app" replace />;
  return children;
}

/** Доступно только куратору. */
function RequireKurator({ children }) {
  const { isKurator, loading } = useAuth();
  if (loading) return <Loading text="Проверяем права…" />;
  if (!isKurator) return <Navigate to="/app" replace />;
  return children;
}

/** Гость, вошедший в систему, не должен видеть лендинг/формы входа. */
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading text="Проверяем сессию…" />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

/** Внутреннее дерево маршрутов:useLocation доступен только внутри Router. */
function AppRoutes() {
  const location = useLocation();
  return (
    <AuthProvider>
      <ToastProvider>
        <ScrollToTop />
        <ErrorBoundary resetKey={location.key}>
          <Routes>
            <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

            <Route
              path="/app"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="today" element={<RequireManager><TodayBoard /></RequireManager>} />
              <Route path="my" element={<MyDuties />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="board" element={<RequireManager><Board /></RequireManager>} />
              <Route path="reports" element={<RequireManager><Reports /></RequireManager>} />
              <Route path="replacements" element={<RequireManager><Replacements /></RequireManager>} />
              <Route path="history" element={<RequireManager><History /></RequireManager>} />
              <Route path="settings" element={<RequireKurator><Settings /></RequireKurator>} />
              <Route path="profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}