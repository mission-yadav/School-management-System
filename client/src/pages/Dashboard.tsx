import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  GraduationCap, Users, Briefcase, UserPlus, ClipboardCheck, Wallet,
  School, CalendarDays, Cake, Megaphone, PlusCircle,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const COLORS = ['#262081', '#524abf', '#7d76cf', '#a9a4df', '#3a32a8', '#16134d', '#d5d3ef'];

function Stat({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string | number; tint: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tint}`}><Icon className="size-6" /></div>
        <div className="min-w-0">
          <div className="truncate text-xl font-bold text-slate-800">{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch<any>('/dashboard');
  if (loading || !data) return <Loading />;

  if (data.role === 'TEACHER') return <TeacherDashboard data={data} name={user!.name} />;

  const s = data.stats;
  const c = data.charts;
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="School overview at a glance" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={GraduationCap} label="Students" value={s.totalStudents} tint="bg-brand-50 text-brand" />
        <Stat icon={Users} label="Teachers" value={s.totalTeachers} tint="bg-blue-50 text-blue-600" />
        <Stat icon={Briefcase} label="Staff" value={s.totalStaff} tint="bg-purple-50 text-purple-600" />
        <Stat icon={UserPlus} label="New Admissions" value={s.newAdmissions} tint="bg-green-50 text-green-600" />
        <Stat icon={ClipboardCheck} label="Attendance Today" value={`${s.attendancePercentage}%`} tint="bg-teal-50 text-teal-600" />
        <Stat icon={Wallet} label="Fees Collected" value={inr(s.feesCollected)} tint="bg-emerald-50 text-emerald-600" />
        <Stat icon={Wallet} label="Pending Fees" value={inr(s.pendingFees)} tint="bg-red-50 text-red-600" />
        <Stat icon={School} label="Active Classes" value={s.activeClasses} tint="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Revenue vs Expenses (6 mo)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={c.revenueVsExpenses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => inr(v)} />
                <Legend />
                <Bar dataKey="revenue" fill="#262081" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#a9a4df" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Monthly Fee Collection</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={c.monthlyFeeCollection}>
                <defs>
                  <linearGradient id="fee" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#262081" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#262081" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => inr(v)} />
                <Area type="monotone" dataKey="amount" stroke="#262081" fill="url(#fee)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Attendance Trend (7 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={c.attendanceTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Line type="monotone" dataKey="percent" stroke="#3a32a8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={c.expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.name}>
                  {c.expenseBreakdown.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => inr(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              ['Add Student', '/students'], ['Add Teacher', '/teachers'], ['Create Notice', '/notices'],
              ['Mark Attendance', '/attendance'], ['Collect Fee', '/fees'], ['Issue Certificate', '/certificates'],
            ].map(([label, to]) => (
              <Button key={to} asChild variant="outline" size="sm" className="justify-start">
                <Link to={to}><PlusCircle className="size-4" /> {label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cake className="size-4" /> Birthdays Today</CardTitle></CardHeader>
          <CardContent>
            {data.birthdays.length === 0 ? <p className="text-sm text-slate-400">No birthdays today.</p> : (
              <ul className="space-y-1 text-sm text-slate-700">{data.birthdays.map((b: any) => <li key={b.id}>🎂 {b.name}</li>)}</ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4" /> Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {data.upcomingEvents.length === 0 ? <p className="text-sm text-slate-400">No upcoming events.</p> : (
              <ul className="space-y-2 text-sm">
                {data.upcomingEvents.map((e: any) => (
                  <li key={e.id} className="flex justify-between"><span className="text-slate-700">{e.title}</span>
                    <span className="text-xs text-slate-400">{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeacherDashboard({ data, name }: { data: any; name: string }) {
  return (
    <div>
      <PageHeader title={`Welcome, ${name.split(' ')[0]} 👋`} subtitle="Your teaching overview" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={School} label="My Classes" value={data.classCount} tint="bg-brand-50 text-brand" />
        <Stat icon={GraduationCap} label="Subjects" value={data.subjects} tint="bg-green-50 text-green-600" />
        <Stat icon={CalendarDays} label="Periods / week" value={data.periods} tint="bg-amber-50 text-amber-600" />
        <Stat icon={Megaphone} label="Notices" value={data.recentNotices.length} tint="bg-blue-50 text-blue-600" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>My Classes</CardTitle></CardHeader>
          <CardContent>
            {data.myClasses.length === 0 ? <p className="text-sm text-slate-400">No classes assigned.</p> : (
              <div className="flex flex-wrap gap-2">
                {data.myClasses.map((c: any) => <span key={c.id} className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">{c.name}</span>)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent Notices</CardTitle></CardHeader>
          <CardContent>
            {data.recentNotices.length === 0 ? <p className="text-sm text-slate-400">No notices.</p> : (
              <ul className="divide-y divide-slate-100">
                {data.recentNotices.map((n: any) => (
                  <li key={n.id} className="flex justify-between py-2 text-sm"><span className="text-slate-700">{n.title}</span>
                    <span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleDateString()}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
