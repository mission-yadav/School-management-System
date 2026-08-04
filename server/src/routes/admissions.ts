import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const where: any = {};
  if (req.query.status) where.status = req.query.status;
  const requests = await prisma.admissionRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    applicantName, dob, gender, appliedClass, parentName, phone, email,
    previousSchool, entranceScore, documentsVerified, seatConfirmed, notes,
  } = req.body;
  if (!applicantName) throw new AppError(400, 'applicantName is required');
  const created = await prisma.admissionRequest.create({
    data: {
      applicantName,
      dob: dob ? new Date(dob) : undefined,
      gender,
      appliedClass,
      parentName,
      phone,
      email,
      previousSchool,
      entranceScore: entranceScore != null ? Number(entranceScore) : undefined,
      documentsVerified: documentsVerified ?? false,
      seatConfirmed: seatConfirmed ?? false,
      notes,
      status: 'PENDING',
    },
  });
  res.status(201).json(created);
}));

router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const {
    status, entranceScore, documentsVerified, seatConfirmed, notes,
    appliedClass, applicantName, dob, gender, parentName, phone, email,
    previousSchool,
  } = req.body;
  const data: any = {};
  if (status !== undefined) data.status = status;
  if (entranceScore !== undefined) data.entranceScore = entranceScore != null ? Number(entranceScore) : null;
  if (documentsVerified !== undefined) data.documentsVerified = documentsVerified;
  if (seatConfirmed !== undefined) data.seatConfirmed = seatConfirmed;
  if (notes !== undefined) data.notes = notes;
  if (appliedClass !== undefined) data.appliedClass = appliedClass;
  if (applicantName !== undefined) data.applicantName = applicantName;
  if (dob !== undefined) data.dob = dob ? new Date(dob) : null;
  if (gender !== undefined) data.gender = gender;
  if (parentName !== undefined) data.parentName = parentName;
  if (phone !== undefined) data.phone = phone;
  if (email !== undefined) data.email = email;
  if (previousSchool !== undefined) data.previousSchool = previousSchool;
  const updated = await prisma.admissionRequest.update({ where: { id }, data });
  res.json(updated);
}));

router.post('/:id/approve', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const updated = await prisma.admissionRequest.update({
    where: { id },
    data: { status: 'APPROVED' },
  });
  res.json(updated);
}));

router.post('/:id/enroll', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { classId } = req.body;
  const request = await prisma.admissionRequest.findUnique({ where: { id } });
  if (!request) throw new AppError(404, 'Admission request not found');

  const result = await prisma.$transaction(async (tx) => {
    const count = await tx.student.count();
    const admissionNo = 'ADM' + String(count + 1).padStart(5, '0');
    const student = await tx.student.create({
      data: {
        admissionNo,
        name: request.applicantName,
        gender: request.gender,
        dob: request.dob,
        phone: request.phone,
        email: request.email,
        previousSchool: request.previousSchool,
        classId: classId != null ? Number(classId) : undefined,
      },
    });
    await tx.admissionRequest.update({
      where: { id },
      data: { status: 'ENROLLED' },
    });
    return student;
  });

  res.status(201).json({ studentId: result.id });
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  await prisma.admissionRequest.delete({ where: { id } });
  res.status(204).end();
}));

router.get('/stats/summary', asyncHandler(async (req, res) => {
  const grouped = await prisma.admissionRequest.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const summary = { PENDING: 0, APPROVED: 0, WAITLIST: 0, REJECTED: 0, ENROLLED: 0 };
  for (const g of grouped) {
    summary[g.status] = g._count._all;
  }
  res.json(summary);
}));

export default router;
