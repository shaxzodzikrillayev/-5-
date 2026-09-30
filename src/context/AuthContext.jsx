import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setCsrfToken } from '../lib/api.js';

const AuthContext = createContext(null);

/** true, если сервер без постоянной БД (типично для Vercel без DATABASE_URL). */
let backendIsEphemeral = false;

async function detectEphemeralBackend() {
  if (backendIsEphemeral) return true;
  try {
    const health = await api.get('/health');
    backendIsEphemeral = health?.persistent === false;
  } catch {
    /* health недоступен — считаем, что всё в порядке */
  }
  return backendIsEphemeral;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const hadUser = useRef(false);
  // Объявлен до refresh, чтобы объяснить пропажу сессии (нужен актуальный текст).
  const explainSessionLossRef = useRef(async () => 'Сессия истекла. Войдите снова.');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      if (!mounted.current) return null;
      setCsrfToken(data?.csrfToken);
      // Сессия пропала «на ходу»: на Vercel без постоянной БД это ожидаемо,
      // поэтому сообщаем причину, а просто молча выкидываем пользователя.
      if (!data?.user && hadUser.current && data?.authenticated === false) {
        hadUser.current = false;
        setUser(null);
        setError(await explainSessionLossRef.current());
        return null;
      }
      hadUser.current = Boolean(data?.user);
      setUser(data?.user || null);
      setError(null);
      return data?.user || null;
    } catch (err) {
      if (!mounted.current) return null;
      setUser(null);
      setError(err.message);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyAuth = useCallback((data) => {
    setCsrfToken(data?.csrfToken);
    setUser(data?.user || null);
    setError(null);
    return data?.user || null;
  }, []);

  /**
   * После входа/регистрации сразу перепроверяем сессию: если сервер её не видит,
   * значит cookie не закрепилась (частая причина — незаданный SESSION_SECRET
   * на Vercel, где каждый контейнер получает свой секрет).
   */
  const verifySession = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      return Boolean(me?.authenticated && me?.user);
    } catch {
      return false;
    }
  }, []);

  /**
   * Вход/регистрация возвращают пользователя, но сессия может не закрепиться:
   *  - на Vercel без DATABASE_URL запрос попадает в контейнер с другой БД;
   *  - без SESSION_SECRET после холодного старта подпись cookie не совпадает.
   * В обоих случаях показываем точную причину вместо «неправильный пароль».
   */
  const explainSessionLoss = useCallback(async () => {
    if (await detectEphemeralBackend()) {
      return 'Сессия не сохранилась: сервер работает без постоянной базы данных (Vercel без DATABASE_URL), '
        + 'и следующий запрос попал в другой контейнер. Задайте DATABASE_URL (PostgreSQL) в переменных окружения.';
    }
    return 'Сессия не сохранилась: на сервере не задан SESSION_SECRET — задайте его в переменных окружения Vercel.';
  }, []);

  explainSessionLossRef.current = explainSessionLoss;

  const login = useCallback(
    async (credentials) => {
      const user = applyAuth(await api.post('/auth/login', credentials));
      if (user && !(await verifySession())) {
        setUser(null);
        throw new Error(await explainSessionLoss());
      }
      return user;
    },
    [applyAuth, verifySession, explainSessionLoss],
  );

  const register = useCallback(
    async (payload) => {
      const user = applyAuth(await api.post('/auth/register', payload));
      if (user && !(await verifySession())) {
        setUser(null);
        throw new Error(await explainSessionLoss());
      }
      return user;
    },
    [applyAuth, verifySession, explainSessionLoss],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setCsrfToken(null);
      setUser(null);
    }
  }, []);

  const isManager = user?.role === 'starosta' || user?.role === 'kurator';
  const isKurator = user?.role === 'kurator';

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      refresh,
      login,
      register,
      logout,
      isManager,
      isKurator,
      isStudent: user?.role === 'student',
    }),
    [user, loading, error, refresh, login, register, logout, isManager, isKurator],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>');
  return ctx;
}