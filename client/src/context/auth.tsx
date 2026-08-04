import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import api, { setAccessToken, bootstrapSession } from '@/lib/api';

export type Role = 'ADMIN' | 'TEACHER';
export interface User { id: number; name: string; email: string; role: Role; }

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthCtx = React.createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // attempt silent session restore via refresh cookie
    (async () => {
      const token = await bootstrapSession();
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          setUser(data);
        } catch { /* ignore */ }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user as User;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => React.useContext(AuthCtx);

export function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid h-screen place-items-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
