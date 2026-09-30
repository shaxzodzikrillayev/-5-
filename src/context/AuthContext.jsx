import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setCsrfToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

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

  const login = useCallback(
    async (credentials) => {
      const user = applyAuth(await api.post('/auth/login', credentials));
      if (user && !(await verifySession())) {
        setUser(null);
        throw new Error(
          'Вход выполнен, но сессия не сохранилась. На сервере не задан SESSION_SECRET — задайте переменную окружения на Vercel.',
        );
      }
      return user;
    },
    [applyAuth, verifySession],
  );

  const register = useCallback(
    async (payload) => {
      const user = applyAuth(await api.post('/auth/register', payload));
      if (user && !(await verifySession())) {
        setUser(null);
        throw new Error(
          'Регистрация выполнена, но сессия не сохранилась. На сервере не задан SESSION_SECRET — задайте переменную окружения на Vercel.',
        );
      }
      return user;
    },
    [applyAuth, verifySession],
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