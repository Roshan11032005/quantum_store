/**
 * Sidebar.tsx — Application sidebar navigation.
 */

import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useAuthStore } from '../../store/authStore';
import { useVaultStore } from '../../store/vaultStore';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: '⬛' },
  { label: 'Files', path: '/files', icon: '📁' },
  { label: 'Upload', path: '/upload', icon: '⬆' },
  { label: 'Keys', path: '/keys', icon: '🔑' },
  { label: 'Benchmarks', path: '/benchmarks', icon: '📊' },
  { label: 'Algorithms', path: '/algorithms', icon: '🔐' },
  { label: 'About', path: '/about', icon: 'ℹ' },
];

export function Sidebar() {
  const { logout, username } = useAuthStore();
  const { lock, isUnlocked } = useVaultStore();
  const navigate = useNavigate();

  function handleLogout() {
    lock();
    logout();
    navigate('/');
  }

  return (
    <aside className="w-64 h-full bg-card border-r border-border flex flex-col" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-primary">Quantum</span>Store
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Post-Quantum Secure Storage</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <span className="text-base" aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Vault status */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 mb-3 px-1">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              isUnlocked ? 'bg-green-500' : 'bg-yellow-500'
            )}
            aria-label={isUnlocked ? 'Vault unlocked' : 'Vault locked'}
          />
          <span className="text-xs text-muted-foreground">
            {isUnlocked ? `Vault unlocked · ${username}` : 'Vault locked'}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm rounded-md text-destructive hover:bg-destructive/10 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
