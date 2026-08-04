import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** GET /api/search?q=&by=name|iemis
 *  by=name  -> broad search across students, teachers, parents, receipts, certificates, books, vehicles
 *  by=iemis -> students matched by their IEMIS id only
 */
router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const by = String(req.query.by || 'name').toLowerCase() === 'iemis' ? 'iemis' : 'name';
  if (q.length < 1) return res.json({ results: [], by });

  const ci = { contains: q, mode: 'insensitive' as const };

  // ---- IEMIS mode: students by IEMIS id ----
  if (by === 'iemis') {
    const students = await prisma.student.findMany({
      where: { iemis: ci },
      take: 25,
      include: { class: { select: { name: true } } },
    });
    const results = students.map((s) => ({
      type: 'student',
      id: s.id,
      label: s.name,
      sublabel: `IEMIS ${s.iemis}${s.class ? ` · ${s.class.name}` : ''}`,
    }));
    return res.json({ results, by });
  }

  // ---- Name mode: broad search ----
  const tasks: Array<Promise<any[]>> = [
    prisma.student.findMany({ where: { OR: [{ name: ci }, { admissionNo: ci }, { iemis: ci }] }, take: 5, include: { class: { select: { name: true } } } })
      .then((rows) => rows.map((s) => ({ type: 'student', id: s.id, label: s.name, sublabel: `IEMIS ${s.iemis || '—'}${s.class ? ` · ${s.class.name}` : ''}` }))),
    prisma.user.findMany({ where: { OR: [{ name: ci }, { email: ci }] }, take: 5 })
      .then((rows) => rows.map((u) => ({ type: 'teacher', id: u.id, label: u.name, sublabel: u.email }))),
    prisma.parent.findMany({ where: { OR: [{ name: ci }, { phone: ci }] }, take: 5 })
      .then((rows) => rows.map((p) => ({ type: 'parent', id: p.id, label: p.name, sublabel: p.phone }))),
    prisma.payment.findMany({ where: { receiptNo: ci }, take: 5 })
      .then((rows) => rows.map((p) => ({ type: 'receipt', id: p.id, label: p.receiptNo, sublabel: String(p.amount) }))),
    prisma.certificate.findMany({ where: { serialNo: ci }, take: 5 })
      .then((rows) => rows.map((c) => ({ type: 'certificate', id: c.id, label: c.serialNo, sublabel: c.type }))),
    prisma.book.findMany({ where: { OR: [{ title: ci }, { author: ci }] }, take: 5 })
      .then((rows) => rows.map((b) => ({ type: 'book', id: b.id, label: b.title, sublabel: b.author }))),
    prisma.vehicle.findMany({ where: { number: ci }, take: 5 })
      .then((rows) => rows.map((v) => ({ type: 'vehicle', id: v.id, label: v.number, sublabel: v.route }))),
  ];

  const settled = await Promise.allSettled(tasks);
  const results: any[] = [];
  for (const s of settled) if (s.status === 'fulfilled') results.push(...s.value);

  res.json({ results, by });
}));

export default router;
