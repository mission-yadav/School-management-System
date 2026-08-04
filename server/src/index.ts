import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import prisma from './prisma.js';
import { errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import teacherRoutes from './routes/teachers.js';
import staffRoutes from './routes/staff.js';
import studentRoutes from './routes/students.js';
import admissionRoutes from './routes/admissions.js';
import classRoutes from './routes/classes.js';
import subjectRoutes from './routes/subjects.js';
import attendanceRoutes from './routes/attendance.js';
import examRoutes from './routes/exams.js';
import feeRoutes from './routes/fees.js';
import certificateRoutes from './routes/certificates.js';
import expenseRoutes from './routes/expenses.js';
import payrollRoutes from './routes/payroll.js';
import reportRoutes from './routes/reports.js';
import searchRoutes from './routes/search.js';
import settingsRoutes from './routes/settings.js';
import noticeRoutes from './routes/notices.js';
import eventRoutes from './routes/events.js';
import timetableRoutes from './routes/timetable.js';
import pdfRoutes from './routes/pdf.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/pdf', pdfRoutes);

app.use(errorHandler);

async function ensureAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (existing) return;
  const email = process.env.ADMIN_EMAIL || 'admin@school.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  await prisma.user.create({
    data: { name: process.env.ADMIN_NAME || 'Super Admin', email, role: 'ADMIN', passwordHash: bcrypt.hashSync(password, 10) },
  });
  console.log(`✅ Seeded admin -> ${email} / ${password}`);
}

const PORT = Number(process.env.PORT || 4000);
ensureAdmin()
  .then(() => app.listen(PORT, () => console.log(`🚀 SMS API on http://localhost:${PORT}`)))
  .catch((e) => { console.error('Startup failed:', e); process.exit(1); });
