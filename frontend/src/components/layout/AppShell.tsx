/**
 * AppShell.tsx — Main layout shell (sidebar + topbar + content).
 */

import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/files': 'My Files',
  '/upload': 'Upload File',
  '/keys': 'Key Management',
  '/benchmarks': 'Performance Benchmarks',
  '/benchmarks/run': 'Run Benchmarks',
  '/compare': 'Compare Runs',
  '/algorithms': 'Algorithms',
  '/about': 'About & Security Model',
};

export function AppShell() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? '';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-6" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
