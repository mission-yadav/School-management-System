import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Menu, LogOut, GraduationCap } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { navForRole } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
    <div className="flex min-h-screen">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand text-white transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2 px-6 py-4 text-lg font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><GraduationCap className="size-5" /></span>
          EduManage
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">{g.title}</div>
              <div className="mt-1 flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-white text-brand' : 'text-white/80 hover:bg-white/10'
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.stub && <span className="ml-auto text-[9px] uppercase text-white/40">soon</span>}
                  </NavLink>
                ))}
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
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
