import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  getAdminUsers,
  changeUserRole,
  deleteUser,
  createBackup,
  restoreBackup,
  type AdminUser,
} from '../api/client';

export function AdminPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getAdminUsers,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) => changeUserRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  // Backup
  const [backupStatus, setBackupStatus] = useState('');
  const backupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus('Backup downloaded.');
    },
    onError: () => setBackupStatus('Backup failed.'),
  });

  // Restore
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreStatus, setRestoreStatus] = useState('');
  const restoreMutation = useMutation({
    mutationFn: (file: File) => restoreBackup(file),
    onSuccess: (data) => {
      setRestoreStatus(data.message);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => setRestoreStatus('Restore failed: ' + err.message),
  });

  const handleRestore = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (window.confirm('Restore from backup? Existing data may be overwritten.')) {
      restoreMutation.mutate(file);
    }
  };

  return (
    <div>
      <h2 style={styles.title}>Admin Panel</h2>

      {/* ── Users ── */}
      <h3 style={styles.sectionTitle}>Users</h3>
      {isLoading && <p style={styles.hint}>Loading users...</p>}
      {users && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['ID', 'Username', 'Email', 'Role', 'Created', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.username === currentUser?.username}
                  onRoleChange={(role) => {
                    if (window.confirm(`Change role of "${u.username}" to ${role}?`)) {
                      roleMutation.mutate({ userId: u.id, role });
                    }
                  }}
                  onDelete={() => {
                    if (window.confirm(`Delete user "${u.username}" and all their data?`)) {
                      deleteMutation.mutate(u.id);
                    }
                  }}
                  roleLoading={roleMutation.isPending}
                  deleteLoading={deleteMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Backup / Restore ── */}
      <h3 style={{ ...styles.sectionTitle, marginTop: 32 }}>Backup & Restore</h3>
      <p style={styles.hint}>
        Backup includes all database records (users, jobs) and all files (datasets, trained models, uploads).
      </p>

      <div style={styles.backupRow}>
        <button
          style={styles.primaryBtn}
          onClick={() => { setBackupStatus(''); backupMutation.mutate(); }}
          disabled={backupMutation.isPending}
        >
          {backupMutation.isPending ? 'Creating backup...' : 'Download Backup (.zip)'}
        </button>
        {backupStatus && <span style={styles.statusText}>{backupStatus}</span>}
      </div>

      <div style={styles.backupRow}>
        <input ref={fileRef} type="file" accept=".zip" style={styles.fileInput} />
        <button
          style={styles.secondaryBtn}
          onClick={handleRestore}
          disabled={restoreMutation.isPending}
        >
          {restoreMutation.isPending ? 'Restoring...' : 'Restore from Backup'}
        </button>
        {restoreStatus && <span style={styles.statusText}>{restoreStatus}</span>}
      </div>
    </div>
  );
}

function UserRow({
  user, isSelf, onRoleChange, onDelete, roleLoading, deleteLoading,
}: {
  user: AdminUser;
  isSelf: boolean;
  onRoleChange: (role: string) => void;
  onDelete: () => void;
  roleLoading: boolean;
  deleteLoading: boolean;
}) {
  const roleDisabled = roleLoading || isSelf;

  return (
    <tr style={styles.row}>
      <td style={styles.td}>{user.id}</td>
      <td style={styles.td}>
        {user.username}
        {isSelf && <span style={styles.selfBadge}>you</span>}
      </td>
      <td style={styles.td}>{user.email}</td>
      <td style={styles.td}>
        <select
          style={{ ...styles.roleSelect, opacity: roleDisabled ? 0.4 : 1 }}
          value={user.role}
          onChange={e => onRoleChange(e.target.value)}
          disabled={roleDisabled}
          title={isSelf ? 'Cannot change your own role' : ''}
        >
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        {isSelf && <span style={styles.lockedHint}>locked</span>}
      </td>
      <td style={styles.td}>{new Date(user.createdAt).toLocaleDateString()}</td>
      <td style={styles.td}>
        <button
          style={{ ...styles.deleteBtn, opacity: isSelf ? 0.4 : 1 }}
          onClick={onDelete}
          disabled={deleteLoading || isSelf}
          title={isSelf ? 'Cannot delete yourself' : ''}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 22, color: '#c0c0ff', fontWeight: 700, marginBottom: 20, marginTop: 0 },
  sectionTitle: { fontSize: 15, color: '#8080bb', fontWeight: 600, marginBottom: 12, marginTop: 0 },
  hint: { color: '#5050aa', fontSize: 13, marginBottom: 12 },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #2d2d4e',
    borderRadius: 8,
    background: '#1a1a2e',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    color: '#7070aa',
    borderBottom: '1px solid #3d3d6e',
    fontWeight: 500,
    fontSize: 12,
    background: '#1a1a2e',
  },
  row: { borderBottom: '1px solid #1d1d3e' },
  td: { padding: '8px 12px', color: '#c0c0ee' },
  roleSelect: {
    background: '#0f0f1a',
    border: '1px solid #3d3d6e',
    borderRadius: 4,
    color: '#c0c0ff',
    padding: '3px 6px',
    fontSize: 12,
  },
  deleteBtn: {
    background: '#3a1a1a',
    border: '1px solid #6a2a2a',
    borderRadius: 6,
    color: '#ff8888',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 12px',
  },
  selfBadge: {
    marginLeft: 6,
    fontSize: 10,
    background: '#2a2a5e',
    color: '#8888ff',
    borderRadius: 4,
    padding: '1px 5px',
    fontWeight: 600,
  },
  lockedHint: {
    marginLeft: 6,
    fontSize: 10,
    color: '#4040aa',
    fontStyle: 'italic' as const,
  },
  backupRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  primaryBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #4444cc, #6666ff)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '10px 24px',
    background: '#1a1a2e',
    border: '1px solid #3d3d6e',
    borderRadius: 8,
    color: '#c0c0ff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  fileInput: {
    color: '#9090bb',
    fontSize: 13,
  },
  statusText: { color: '#66cc88', fontSize: 13 },
};
