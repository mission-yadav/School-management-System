import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const staff = await prisma.staff.findMany({ orderBy: { name: 'asc' } });
  res.json(staff);
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, designation, email, phone, joinDate, baseSalary, active } = req.body;
  if (!name) throw new AppError(400, 'name is required');
  const created = await prisma.staff.create({
    data: {
      name,
      designation,
      email,
      phone,
      joinDate: joinDate ? new Date(joinDate) : new Date(),
      baseSalary: baseSalary != null ? Number(baseSalary) : 0,
      active: active ?? true,
    },
  });
  res.status(201).json(created);
}));

router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { name, designation, email, phone, joinDate, baseSalary, active } = req.body;
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (designation !== undefined) data.designation = designation;
  if (email !== undefined) data.email = email;
  if (phone !== undefined) data.phone = phone;
  if (joinDate !== undefined) data.joinDate = joinDate ? new Date(joinDate) : undefined;
  if (baseSalary !== undefined) data.baseSalary = baseSalary != null ? Number(baseSalary) : undefined;
  if (active !== undefined) data.active = active;
  const updated = await prisma.staff.update({ where: { id }, data });
  res.json(updated);
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  await prisma.staff.delete({ where: { id } });
  res.status(204).end();
}));

export default router;
