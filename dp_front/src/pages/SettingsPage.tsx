import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { resetPassword, changeUsername } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Username change
  const [newUsername, setNewUsername] = useState('');
  const [unMsg, setUnMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const pwMutation = useMutation({
    mutationFn: () => resetPassword(user?.username || '', currentPassword, newPassword),
    onSuccess: () => {
      setPwMsg({ type: 'ok', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e: any) => setPwMsg({ type: 'err', text: e.response?.data?.error || 'Failed' }),
  });

  const unMutation = useMutation({
    mutationFn: () => changeUsername(newUsername),
    onSuccess: (data) => {
      // Update token and user in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({ username: data.username, role: data.role }));
      setUnMsg({ type: 'ok', text: 'Username changed. Please re-login.' });
      setNewUsername('');
      setTimeout(() => {
        logout();
        navigate('/login', { replace: true });
      }, 1500);
    },
    onError: (e: any) => setUnMsg({ type: 'err', text: e.response?.data?.error || 'Failed' }),
  });

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'err', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ type: 'err', text: 'Min 6 characters' });
      return;
    }
    pwMutation.mutate();
  };

  const handleUnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUnMsg(null);
    if (!newUsername.trim() || newUsername.length < 3) {
      setUnMsg({ type: 'err', text: 'Min 3 characters' });
      return;
    }
    unMutation.mutate();
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} style={s.back}>&#8592; Back</button>
      <h2 style={s.title}>Settings</h2>

      {/* Change Password */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Change Password</h3>
        <form onSubmit={handlePwSubmit} style={s.form}>
          <input style={s.input} type="password" placeholder="Current password"
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          <input style={s.input} type="password" placeholder="New password (min 6)"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <input style={s.input} type="password" placeholder="Confirm new password"
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          {pwMsg && <div style={pwMsg.type === 'ok' ? s.ok : s.err}>{pwMsg.text}</div>}
          <button type="submit" style={s.btn} disabled={pwMutation.isPending}>
            {pwMutation.isPending ? 'Saving...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Change Username */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Change Username</h3>
        <p style={s.hint}>Current: <strong style={{ color: '#c0c0ff' }}>{user?.username}</strong></p>
        <form onSubmit={handleUnSubmit} style={s.form}>
          <input style={s.input} type="text" placeholder="New username (min 3)"
            value={newUsername} onChange={e => setNewUsername(e.target.value)} />
          {unMsg && <div style={unMsg.type === 'ok' ? s.ok : s.err}>{unMsg.text}</div>}
          <button type="submit" style={s.btn} disabled={unMutation.isPending}>
            {unMutation.isPending ? 'Saving...' : 'Update Username'}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  back: { background: 'none', border: 'none', color: '#6666ff', cursor: 'pointer', fontSize: 14, padding: '0 0 16px', display: 'block' },
  title: { fontSize: 22, color: '#c0c0ff', fontWeight: 700, marginBottom: 24, marginTop: 0 },
  card: { background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 8, padding: 20, maxWidth: 400, marginBottom: 20 },
  cardTitle: { margin: '0 0 14px', fontSize: 16, color: '#c0c0ff', fontWeight: 600 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { background: '#0f0f1a', border: '1px solid #2d2d4e', borderRadius: 6, padding: '8px 12px', color: '#c0c0ff', fontSize: 13, fontFamily: 'inherit' },
  btn: { marginTop: 4, padding: '8px 16px', background: '#4444ff', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  ok: { padding: '6px 10px', background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: 6, color: '#88ff88', fontSize: 12 },
  err: { padding: '6px 10px', background: '#3a1a1a', border: '1px solid #6a2a2a', borderRadius: 6, color: '#ff8888', fontSize: 12 },
  hint: { fontSize: 13, color: '#6060aa', margin: '0 0 10px' },
};
