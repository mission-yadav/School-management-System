import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

const TYPES = ['BONAFIDE', 'CHARACTER', 'TRANSFER', 'STUDY', 'ID_CARD', 'FEE_RECEIPT'] as const;

/** GET /api/certificates?studentId=&type= */
router.get('/', asyncHandler(async (req, res) => {
  const { studentId, type } = req.query as Record<string, string>;
  const where: any = {};
  if (studentId) where.studentId = Number(studentId);
  if (type) where.type = type;
  const certs = await prisma.certificate.findMany({
    where, orderBy: { issuedAt: 'desc' },
    include: { student: { select: { name: true, admissionNo: true, iemis: true } }, issuedBy: { select: { name: true } } },
  });
  res.json(certs.map((c) => ({
    id: c.id, serialNo: c.serialNo, type: c.type, issuedAt: c.issuedAt,
    studentId: c.studentId, studentName: c.student.name, admissionNo: c.student.admissionNo, iemis: c.student.iemis,
    issuedBy: c.issuedBy?.name || null,
  })));
}));

/** POST /api/certificates (ADMIN) — issue a certificate (record). PDF via /api/pdf/certificate/:id */
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { studentId, type, data } = req.body || {};
  if (!studentId || !type || !TYPES.includes(type)) throw new AppError(400, 'studentId and valid type required');
  const student = await prisma.student.findUnique({ where: { id: Number(studentId) } });
  if (!student) throw new AppError(404, 'Student not found');
  const serialNo = `${type.slice(0, 3)}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const cert = await prisma.certificate.create({
    data: { studentId: Number(studentId), type, serialNo, issuedById: req.user!.id, dataJson: JSON.stringify(data || {}) },
  });
  res.status(201).json({ id: cert.id, serialNo: cert.serialNo });
}));

/** DELETE /api/certificates/:id (ADMIN) */
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.certificate.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

export default router;
