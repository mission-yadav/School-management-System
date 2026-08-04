import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) {
    return res.json({ results: [] });
  }

  const ci = { contains: q, mode: 'insensitive' as const };

  const tasks: Array<Promise<any[]>> = [
    prisma.student
      .findMany({
        where: { OR: [{ name: ci }, { admissionNo: ci }] },
        take: 5,
      })
      .then((rows) =>
        rows.map((s) => ({
          type: 'student',
          id: s.id,
          label: s.name,
          sublabel: s.admissionNo,
        }))
      ),
    prisma.user
      .findMany({
        where: { OR: [{ name: ci }, { email: ci }] },
        take: 5,
      })
      .then((rows) =>
        rows.map((u) => ({
          type: 'teacher',
          id: u.id,
          label: u.name,
          sublabel: u.email,
        }))
      ),
    prisma.parent
      .findMany({
        where: { OR: [{ name: ci }, { phone: ci }] },
        take: 5,
      })
      .then((rows) =>
        rows.map((p) => ({
          type: 'parent',
          id: p.id,
          label: p.name,
          sublabel: p.phone,
        }))
      ),
    prisma.payment
      .findMany({
        where: { receiptNo: ci },
        take: 5,
      })
      .then((rows) =>
        rows.map((p) => ({
          type: 'receipt',
          id: p.id,
          label: p.receiptNo,
          sublabel: String(p.amount),
        }))
      ),
    prisma.certificate
      .findMany({
        where: { serialNo: ci },
        take: 5,
      })
      .then((rows) =>
        rows.map((c) => ({
          type: 'certificate',
          id: c.id,
          label: c.serialNo,
          sublabel: c.type,
        }))
      ),
    prisma.book
      .findMany({
        where: { OR: [{ title: ci }, { author: ci }] },
        take: 5,
      })
      .then((rows) =>
        rows.map((b) => ({
          type: 'book',
          id: b.id,
          label: b.title,
          sublabel: b.author,
        }))
      ),
    prisma.vehicle
      .findMany({
        where: { number: ci },
        take: 5,
      })
      .then((rows) =>
        rows.map((v) => ({
          type: 'vehicle',
          id: v.id,
          label: v.number,
          sublabel: v.route,
        }))
      ),
  ];

  const settled = await Promise.allSettled(tasks);
  const results: any[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') results.push(...s.value);
  }

  res.json({ results });
}));

export default router;
