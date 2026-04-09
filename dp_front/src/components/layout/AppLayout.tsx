import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function AppLayout() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', color: '#e0e0ff', fontFamily: 'system-ui, sans-serif' }}>
      <NavBar />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <Outlet />
      </main>
    </div>
  );
}
