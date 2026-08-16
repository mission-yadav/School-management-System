import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { navForRole, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function NavItemLink({ item, onNavigate, nested }: { item: NavItem; onNavigate: () => void; nested?: boolean }) {
  return (
    <NavLink
      to={item.to!}
      end={item.to === '/fees'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          nested && 'ml-3 py-1.5 text-[13px]',
          isActive ? 'bg-white text-brand' : 'text-white/80 hover:bg-white/10'
        )
      }
    >
      <item.icon className={cn('shrink-0', nested ? 'size-3.5' : 'size-4')} />
      <span className="truncate">{item.label}</span>
      {item.stub && <span className="ml-auto text-[9px] uppercase text-white/40">soon</span>}
    </NavLink>
  );
}

function CollapsibleNavItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const childActive = (item.children || []).some((c) => c.to && (pathname === c.to || pathname.startsWith(c.to + '/')));
  const [open, setOpen] = useState(childActive);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          childActive ? 'text-white' : 'text-white/80 hover:bg-white/10'
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        <ChevronDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
          {(item.children || []).map((c) => <NavItemLink key={c.to} item={c} onNavigate={onNavigate} nested />)}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const groups = navForRole(user.role);

  async function doLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col bg-brand text-white transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src="/logo.png" alt="School logo" className="h-11 w-11 shrink-0 object-contain" />
          <span className="text-sm font-bold leading-tight">Janaki Secondary School</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">{g.title}</div>
              <div className="mt-1 flex flex-col gap-0.5">
                {g.items.map((item) => item.children
                  ? <CollapsibleNavItem key={item.label} item={item} onNavigate={() => setOpen(false)} />
                  : <NavItemLink key={item.to} item={item} onNavigate={() => setOpen(false)} />
                )}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}><Menu /></Button>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="text-xs font-medium uppercase tracking-wide text-brand">{user.role}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">
              {user.name?.[0]?.toUpperCase()}
            </div>
            <Button variant="outline" size="sm" onClick={doLogout}><LogOut className="size-4" /> Logout</Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
