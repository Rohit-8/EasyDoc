import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FileText, Upload, Settings, Activity, Menu, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useEffect } from 'react';

const navItems = [
  { to: '/', icon: FileText, label: 'Documents' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 h-14 border-b border-border bg-surface-1 flex items-center px-4 gap-3 z-40 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded hover:bg-surface-3 transition-colors"
        >
          <Menu className="w-5 h-5 text-text-secondary" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-accent/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-accent" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">CipherDocs</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed md:static inset-y-0 left-0 z-50 w-[220px] flex-shrink-0 border-r border-border bg-surface-1 flex flex-col transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-border">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-accent/20 flex items-center justify-center">
                <FileText className="w-4 h-4 text-accent" />
              </div>
              <span className="font-semibold text-[15px] tracking-tight">CipherDocs</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded hover:bg-surface-3 transition-colors md:hidden"
            >
              <X className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary',
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Status */}
        <div className="px-3 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 text-2xs text-text-tertiary">
            <Activity className="w-3 h-3" />
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-surface-0 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
