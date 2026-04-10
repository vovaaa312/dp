import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { forgotPassword, resetPasswordWithToken } from '../api/client';

type View = 'login' | 'forgot' | 'token';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('login');

  // Login
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot
  const [forgotUser, setForgotUser] = useState('');
  const [forgotMsg, setForgotMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Token reset
  const [token, setToken] = useState('');
  const [newPw, setNewPw] = useState('');
  const [tokenMsg, setTokenMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ username, password });
      navigate('/', { replace: true });
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setForgotMsg(null);
    setForgotLoading(true);
    try {
      const res = await forgotPassword(forgotUser);
      setForgotMsg({ type: 'ok', text: res.message });
      setView('token');
    } catch (err: any) {
      setForgotMsg({ type: 'err', text: err.response?.data?.error || 'User not found' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleTokenReset = async (e: FormEvent) => {
    e.preventDefault();
    setTokenMsg(null);
    if (newPw.length < 6) {
      setTokenMsg({ type: 'err', text: 'Min 6 characters' });
      return;
    }
    setTokenLoading(true);
    try {
      await resetPasswordWithToken(token, newPw);
      setTokenMsg({ type: 'ok', text: 'Password reset! You can now log in.' });
      setTimeout(() => {
        setView('login');
        setToken('');
        setNewPw('');
        setTokenMsg(null);
      }, 2000);
    } catch (err: any) {
      setTokenMsg({ type: 'err', text: err.response?.data?.error || 'Invalid or expired token' });
    } finally {
      setTokenLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Object Detection Platform</h1>

        {view === 'login' && (
          <>
            <h2 style={styles.subtitle}>Sign in</h2>
            <form onSubmit={handleLogin} style={styles.form}>
              <label style={styles.label}>Username</label>
              <input style={styles.input} type="text" value={username}
                onChange={e => setUsername(e.target.value)} autoComplete="username" required />
              <label style={styles.label}>Password</label>
              <input style={styles.input} type="password" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
              {error && <p style={styles.error}>{error}</p>}
              <button style={styles.btn} type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
            <p style={styles.footer}>
              <span style={styles.link} onClick={() => setView('forgot')}>Forgot password?</span>
            </p>
            <p style={styles.footer}>
              No account? <Link to="/register" style={styles.link}>Register</Link>
            </p>
          </>
        )}

        {view === 'forgot' && (
          <>
            <h2 style={styles.subtitle}>Forgot Password</h2>
            <p style={styles.hint}>Enter your username. A reset token will be printed in the server console.</p>
            <form onSubmit={handleForgot} style={styles.form}>
              <label style={styles.label}>Username</label>
              <input style={styles.input} type="text" value={forgotUser}
                onChange={e => setForgotUser(e.target.value)} required />
              {forgotMsg && <p style={forgotMsg.type === 'ok' ? styles.success : styles.error}>{forgotMsg.text}</p>}
              <button style={styles.btn} type="submit" disabled={forgotLoading}>
                {forgotLoading ? 'Sending...' : 'Request Token'}
              </button>
            </form>
            <p style={styles.footer}>
              <span style={styles.link} onClick={() => setView('login')}>Back to login</span>
            </p>
          </>
        )}

        {view === 'token' && (
          <>
            <h2 style={styles.subtitle}>Reset Password</h2>
            <p style={styles.hint}>Check the server console for your reset token, then enter it below.</p>
            <form onSubmit={handleTokenReset} style={styles.form}>
              <label style={styles.label}>Reset Token</label>
              <input style={styles.input} type="text" value={token}
                onChange={e => setToken(e.target.value)} placeholder="Paste token from console" required />
              <label style={styles.label}>New Password</label>
              <input style={styles.input} type="password" value={newPw}
                onChange={e => setNewPw(e.target.value)} placeholder="Min 6 characters" required />
              {tokenMsg && <p style={tokenMsg.type === 'ok' ? styles.success : styles.error}>{tokenMsg.text}</p>}
              <button style={styles.btn} type="submit" disabled={tokenLoading}>
                {tokenLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
            <p style={styles.footer}>
              <span style={styles.link} onClick={() => setView('login')}>Back to login</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f0f1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 12,
    padding: '40px 36px',
    width: 360,
  },
  title: {
    color: '#e0e0ff',
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 4px',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9090bb',
    fontSize: 14,
    fontWeight: 400,
    margin: '0 0 28px',
    textAlign: 'center',
  },
  hint: {
    color: '#5050aa',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    color: '#9090bb',
    fontSize: 13,
    marginBottom: 2,
  },
  input: {
    background: '#12122a',
    border: '1px solid #2d2d4e',
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 14,
    padding: '9px 12px',
    outline: 'none',
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    margin: 0,
  },
  success: {
    color: '#88ff88',
    fontSize: 13,
    margin: 0,
  },
  btn: {
    marginTop: 8,
    padding: '10px 0',
    background: 'linear-gradient(135deg, #4444cc, #6666ff)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    color: '#5050aa',
    fontSize: 13,
  },
  link: {
    color: '#8888ff',
    textDecoration: 'none',
    cursor: 'pointer',
  },
};
