import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

const PROFILE_FIELDS = [
  'admissionNo', 'iemis', 'rollNo', 'name', 'gender', 'dob', 'bloodGroup', 'address', 'phone',
  'email', 'photoUrl', 'aadhaar', 'previousSchool', 'house', 'batch', 'emergencyContact',
  'allergies', 'disabilities', 'medicalHistory', 'vaccination',
] as const;

function pickProfile(body: any) {
  const data: any = {};
  for (const f of PROFILE_FIELDS) if (body[f] !== undefined) data[f] = body[f] || null;
  if (body.dob) data.dob = new Date(body.dob);
  if (body.classId !== undefined) data.classId = body.classId || null;
  if (body.sectionId !== undefined) data.sectionId = body.sectionId || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.usesTransport !== undefined) data.usesTransport = !!body.usesTransport;
  if (body.feeFree !== undefined) data.feeFree = !!body.feeFree;
  if (body.transportFee !== undefined)
    data.transportFee = body.transportFee === '' || body.transportFee == null ? null : Number(body.transportFee);
  return data;
}

/** GET /api/students?classId=&status=&q= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, status, q, by } = req.query as Record<string, string>;
    const where: any = {};
    if (classId) where.classId = Number(classId);
    if (status) where.status = status;
    if (q) {
      const ci = { contains: q, mode: 'insensitive' as const };
      where.OR = by === 'iemis'
        ? [{ iemis: ci }]
        : [{ name: ci }, { admissionNo: ci }, { iemis: ci }];
    }
    const students = await prisma.student.findMany({
      where,
      orderBy: [{ classId: 'asc' }, { name: 'asc' }],
      include: { class: { select: { name: true } }, section: { select: { name: true } } },
    });
    res.json(
      students.map((s) => ({
        id: s.id, admissionNo: s.admissionNo, iemis: s.iemis, rollNo: s.rollNo, name: s.name,
        gender: s.gender, phone: s.phone, status: s.status, feeFree: s.feeFree,
        classId: s.classId, className: s.class?.name || null, sectionName: s.section?.name || null,
      }))
    );
  })
);

/** GET /api/students/:id — full profile + fees + results */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        class: { select: { name: true } },
        section: { select: { name: true } },
        parent: true,
        scholarships: true,
        invoices: { include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } },
        results: { include: { exam: { select: { name: true } }, subject: { select: { name: true } } } },
        certificates: { orderBy: { issuedAt: 'desc' } },
      },
    });
    if (!student) throw new AppError(404, 'Student not found');

    const invoices = student.invoices.map((inv) => {
      const total = inv.items.reduce((a, i) => a + i.amount, 0) + inv.fine - inv.discount;
      const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
      return { id: inv.id, title: inv.title, total, paid, due: total - paid, status: inv.status };
    });
    res.json({ ...student, invoices });
  })
);

/** POST /api/students (ADMIN) — admit */
router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!body.name) throw new AppError(400, 'name required');
    const data = pickProfile(body);
    if (!data.admissionNo) {
      const count = await prisma.student.count();
      data.admissionNo = 'ADM' + String(1000 + count + 1);
    }
    // optional parent
    if (body.parentName) {
      data.parent = { create: { name: body.parentName, phone: body.parentPhone || null, relation: body.parentRelation || 'Guardian', email: body.parentEmail || null } };
    }
    const created = await prisma.student.create({ data });
    res.status(201).json({ id: created.id, admissionNo: created.admissionNo });
  })
);

/** PUT /api/students/:id (ADMIN) — fully editable incl. parent/guardian */
router.put(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const body = req.body || {};
    const data = pickProfile(body);

    // guardian/parent details
    if (body.parentName !== undefined || body.parentPhone !== undefined || body.parentRelation !== undefined || body.parentEmail !== undefined) {
      const student = await prisma.student.findUnique({ where: { id }, select: { parentId: true } });
      const pdata = {
        name: body.parentName ?? undefined,
        phone: body.parentPhone ?? undefined,
        relation: body.parentRelation ?? undefined,
        email: body.parentEmail ?? undefined,
      };
      if (student?.parentId) {
        await prisma.parent.update({ where: { id: student.parentId }, data: pdata });
      } else if (body.parentName) {
        const parent = await prisma.parent.create({ data: { name: body.parentName, phone: body.parentPhone || null, relation: body.parentRelation || 'Guardian', email: body.parentEmail || null } });
        data.parentId = parent.id;
      }
    }

    await prisma.student.update({ where: { id }, data });
    res.json({ ok: true });
  })
);

/** DELETE /api/students/:id (ADMIN) */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.student.delete({ where: { id: intParam(req.params.id) } });
    res.json({ ok: true });
  })
);

/* ---------- operations ---------- */
/** POST /api/students/:id/status (ADMIN) — suspend / alumni / reactivate */
router.post(
  '/:id/status',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const { status } = req.body || {};
    if (!['ACTIVE', 'SUSPENDED', 'ALUMNI', 'INACTIVE'].includes(status))
      throw new AppError(400, 'Invalid status');
    await prisma.student.update({ where: { id }, data: { status } });
    res.json({ ok: true });
  })
);

/** POST /api/students/promote (ADMIN) — move students to another class */
router.post(
  '/promote',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { studentIds, toClassId, toSectionId } = req.body || {};
    if (!Array.isArray(studentIds) || !toClassId) throw new AppError(400, 'studentIds[] and toClassId required');
    const result = await prisma.student.updateMany({
      where: { id: { in: studentIds.map(Number) } },
      data: { classId: Number(toClassId), sectionId: toSectionId ? Number(toSectionId) : null },
    });
    res.json({ ok: true, promoted: result.count });
  })
);

/** POST /api/students/merge (ADMIN) — merge duplicate into a primary record */
router.post(
  '/merge',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { primaryId, duplicateId } = req.body || {};
    if (!primaryId || !duplicateId || primaryId === duplicateId)
      throw new AppError(400, 'Distinct primaryId and duplicateId required');
    await prisma.$transaction([
      prisma.studentAttendance.updateMany({ where: { studentId: Number(duplicateId) }, data: { studentId: Number(primaryId) } }),
      prisma.result.updateMany({ where: { studentId: Number(duplicateId) }, data: { studentId: Number(primaryId) } }),
      prisma.feeInvoice.updateMany({ where: { studentId: Number(duplicateId) }, data: { studentId: Number(primaryId) } }),
      prisma.certificate.updateMany({ where: { studentId: Number(duplicateId) }, data: { studentId: Number(primaryId) } }),
      prisma.student.delete({ where: { id: Number(duplicateId) } }),
    ]);
    res.json({ ok: true });
  })
);

export default router;
