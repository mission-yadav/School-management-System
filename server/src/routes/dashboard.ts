import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../lib/http.js';

const router = Router();
router.use(authRequired);

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(monthKey(m)); }
  return out;
}

/** GET /api/dashboard — role-aware stats + chart data */
router.get('/', asyncHandler(async (req, res) => {
  if (req.user!.role === 'TEACHER') {
    const uid = req.user!.id;
    const myClasses = await prisma.class.findMany({
      where: { OR: [{ classTeacherId: uid }, { subjects: { some: { teacherId: uid } } }] },
      select: { id: true, name: true },
    });
    const [subjects, assignments, notices] = await Promise.all([
      prisma.subject.count({ where: { teacherId: uid } }),
      prisma.timetableSlot.count({ where: { teacherId: uid } }),
      prisma.notice.findMany({ where: { audience: { in: ['ALL', 'TEACHERS'] } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, createdAt: true } }),
    ]);
    return res.json({ role: 'TEACHER', classCount: myClasses.length, myClasses, subjects, periods: assignments, recentNotices: notices });
  }

  // ADMIN
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [students, teachers, staff, classes, newAdmissions, events, invoices, payments, expenses, todayAtt] = await Promise.all([
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'TEACHER' } }),
    prisma.staff.count({ where: { active: true } }),
    prisma.class.count(),
    prisma.student.count({ where: { admissionDate: { gte: monthStart } } }),
    prisma.event.findMany({ where: { date: { gte: new Date(now.toDateString()) } }, orderBy: { date: 'asc' }, take: 5 }),
    prisma.feeInvoice.findMany({ where: { isLedger: true }, include: { items: true, payments: true } }),
    prisma.payment.findMany({ select: { amount: true, paidAt: true } }),
    prisma.expense.findMany({ select: { amount: true, date: true, categoryId: true } }),
    prisma.studentAttendance.findMany({ where: { date: new Date(now.toDateString()) }, select: { status: true } }),
  ]);

  let billed = 0, collected = 0;
  for (const inv of invoices) {
    const total = inv.items.reduce((a, i) => a + i.amount, 0) + inv.fine - inv.discount;
    billed += total;
    collected += inv.payments.reduce((a, p) => a + p.amount, 0);
  }

  const presentToday = todayAtt.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
  const attendancePct = todayAtt.length ? Math.round((presentToday / todayAtt.length) * 100) : 0;

  // birthdays today
  const allStudents = await prisma.student.findMany({ where: { status: 'ACTIVE', dob: { not: null } }, select: { id: true, name: true, dob: true } });
  const birthdays = allStudents.filter((s) => s.dob && s.dob.getMonth() === now.getMonth() && s.dob.getDate() === now.getDate())
    .map((s) => ({ id: s.id, name: s.name }));

  // charts
  const months = lastMonths(6);
  const feeByMonth = Object.fromEntries(months.map((m) => [m, 0]));
  for (const p of payments) { const k = monthKey(p.paidAt); if (k in feeByMonth) feeByMonth[k] += p.amount; }
  const expByMonth = Object.fromEntries(months.map((m) => [m, 0]));
  for (const e of expenses) { const k = monthKey(e.date); if (k in expByMonth) expByMonth[k] += e.amount; }

  const admissionsRaw = await prisma.student.findMany({ select: { admissionDate: true } });
  const admByMonth = Object.fromEntries(months.map((m) => [m, 0]));
  for (const s of admissionsRaw) { const k = monthKey(s.admissionDate); if (k in admByMonth) admByMonth[k] += 1; }

  // attendance trend (last 7 days)
  const trend: { date: string; percent: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const recs = await prisma.studentAttendance.findMany({ where: { date: d }, select: { status: true } });
    const present = recs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    trend.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, percent: recs.length ? Math.round((present / recs.length) * 100) : 0 });
  }

  // expense breakdown by category
  const cats = await prisma.expenseCategory.findMany();
  const catMap = new Map(cats.map((c) => [c.id, c.name]));
  const expByCat: Record<string, number> = {};
  for (const e of expenses) { const name = e.categoryId ? catMap.get(e.categoryId) || 'Other' : 'Other'; expByCat[name] = (expByCat[name] || 0) + e.amount; }

  const recentNotices = await prisma.notice.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, createdAt: true } });

  res.json({
    role: 'ADMIN',
    stats: {
      totalStudents: students, totalTeachers: teachers, totalStaff: staff,
      newAdmissions, attendancePercentage: attendancePct,
      feesCollected: collected, pendingFees: billed - collected,
      activeClasses: classes, upcomingEvents: events.length, birthdaysToday: birthdays.length,
    },
    charts: {
      monthlyFeeCollection: months.map((m) => ({ month: m, amount: Math.round(feeByMonth[m]) })),
      attendanceTrends: trend,
      admissionsPerMonth: months.map((m) => ({ month: m, count: admByMonth[m] })),
      expenseBreakdown: Object.entries(expByCat).map(([name, value]) => ({ name, value: Math.round(value) })),
      revenueVsExpenses: months.map((m) => ({ month: m, revenue: Math.round(feeByMonth[m]), expense: Math.round(expByMonth[m]) })),
    },
    upcomingEvents: events,
    birthdays,
    recentNotices,
  });
}));

export default router;
