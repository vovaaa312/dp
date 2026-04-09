import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import * as api from '../api/client';
import type { AuthResponse, LoginPayload, RegisterPayload } from '../types';

interface AuthUser {
  username: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  const handleAuthResponse = useCallback((res: AuthResponse) => {
    localStorage.setItem('token', res.token);
    const u = { username: res.username, role: res.role };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const res = await api.login(payload);
    handleAuthResponse(res);
  }, [handleAuthResponse]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await api.register(payload);
    handleAuthResponse(res);
  }, [handleAuthResponse]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
