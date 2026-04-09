import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ username, email, password });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setError(msg ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Object Detection Platform</h1>
        <h2 style={styles.subtitle}>Create account</h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            minLength={3}
            maxLength={50}
            required
          />

          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
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
  },
};
