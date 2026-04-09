import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/', label: 'Training Jobs' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/inference', label: 'Inference' },
];

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.brand}>Object Detection Platform</div>
      <div style={styles.links}>
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            style={({ isActive }) => ({
              ...styles.link,
              ...(isActive ? styles.activeLink : {}),
            })}
          >
            {link.label}
          </NavLink>
        ))}
      </div>
      <div style={styles.userArea}>
        {user && <span style={styles.username}>{user.username}</span>}
        <button style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: 56,
    background: '#1a1a2e',
    borderBottom: '1px solid #2d2d4e',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  brand: {
    color: '#e0e0ff',
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  links: {
    display: 'flex',
    gap: 8,
  },
  link: {
    color: '#9090bb',
    textDecoration: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    transition: 'color 0.15s, background 0.15s',
  },
  activeLink: {
    color: '#fff',
    background: '#2d2d5e',
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  username: {
    color: '#9090bb',
    fontSize: 13,
  },
  logoutBtn: {
    padding: '5px 14px',
    background: 'transparent',
    border: '1px solid #2d2d4e',
    borderRadius: 6,
    color: '#9090bb',
    fontSize: 13,
    cursor: 'pointer',
  },
};
