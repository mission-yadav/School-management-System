import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function main() {
  console.log('🌱 Seeding SMS demo data…');

  // wipe (order respects FKs; onDelete cascades handle children)
  await prisma.$transaction([
    prisma.result.deleteMany(), prisma.examSubject.deleteMany(), prisma.examClass.deleteMany(), prisma.exam.deleteMany(),
    prisma.payment.deleteMany(), prisma.feeItem.deleteMany(), prisma.feeInvoice.deleteMany(), prisma.scholarship.deleteMany(),
    prisma.studentAttendance.deleteMany(), prisma.teacherAttendance.deleteMany(), prisma.leaveRequest.deleteMany(),
    prisma.certificate.deleteMany(), prisma.timetableSlot.deleteMany(), prisma.notice.deleteMany(), prisma.event.deleteMany(),
    prisma.expense.deleteMany(), prisma.vendor.deleteMany(), prisma.payslip.deleteMany(),
    prisma.admissionRequest.deleteMany(), prisma.book.deleteMany(), prisma.vehicle.deleteMany(),
    prisma.subject.deleteMany(), prisma.student.deleteMany(), prisma.section.deleteMany(), prisma.class.deleteMany(),
    prisma.parent.deleteMany(), prisma.staff.deleteMany(),
  ]);
  await prisma.user.deleteMany({ where: { role: Role.TEACHER } });
  await prisma.refreshToken.deleteMany();

  // admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@school.com';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'Super Admin', email: adminEmail, role: Role.ADMIN, passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10) },
  });

  // settings
  const settings: Record<string, any> = {
    schoolName: 'EduManage Public School', address: '123 School Road, Bengaluru 560001',
    phone: '+91 80 1234 5678', email: 'info@edumanage.school', session: '2026-2027',
    theme: '#262081', logoUrl: '', emailConfig: { host: '', user: '' }, smsConfig: { provider: '', apiKey: '' },
  };
  for (const [key, value] of Object.entries(settings))
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

  // grade scale
  await prisma.gradeScale.deleteMany();
  await prisma.gradeScale.createMany({ data: [
    { grade: 'A+', minPercent: 90, maxPercent: 100, gpa: 10 },
    { grade: 'A', minPercent: 80, maxPercent: 89.99, gpa: 9 },
    { grade: 'B+', minPercent: 70, maxPercent: 79.99, gpa: 8 },
    { grade: 'B', minPercent: 60, maxPercent: 69.99, gpa: 7 },
    { grade: 'C', minPercent: 50, maxPercent: 59.99, gpa: 6 },
    { grade: 'D', minPercent: 35, maxPercent: 49.99, gpa: 5 },
    { grade: 'F', minPercent: 0, maxPercent: 34.99, gpa: 0 },
  ]});

  const pw = bcrypt.hashSync('teacher123', 10);
  const teacherDefs = [
    ['Anjali Mehta', 'anjali@school.com'], ['Rakesh Rao', 'rakesh@school.com'],
    ['Priya Nair', 'priya@school.com'], ['Suresh Kumar', 'suresh@school.com'],
    ['Fatima Sheikh', 'fatima@school.com'], ['Vikram Singh', 'vikram@school.com'],
  ];
  const teachers = [];
  for (const [name, email] of teacherDefs)
    teachers.push(await prisma.user.create({ data: { name, email, role: Role.TEACHER, passwordHash: pw, phone: `98${rand(10000000, 99999999)}` } }));

  // staff
  for (const [name, designation, salary] of [
    ['Ramesh Gupta', 'Accountant', 35000], ['Lata Devi', 'Librarian', 28000],
    ['Mohan Lal', 'Office Clerk', 22000], ['Geeta Rani', 'Lab Assistant', 24000],
  ] as [string, string, number][])
    await prisma.staff.create({ data: { name, designation, baseSalary: salary, phone: `97${rand(10000000, 99999999)}` } });

  // fee & expense categories
  await prisma.feeCategory.deleteMany();
  await prisma.feeCategory.createMany({ data: ['Tuition', 'Transport', 'Hostel', 'Exam', 'Library', 'Lab'].map((name) => ({ name })) });
  const feeCats = await prisma.feeCategory.findMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.expenseCategory.createMany({ data: ['Electricity', 'Salary', 'Maintenance', 'Stationery', 'Fuel', 'Internet', 'Miscellaneous'].map((name) => ({ name })) });
  const expCats = await prisma.expenseCategory.findMany();

  // classes + sections + subjects
  const classNames = ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
  const subjectNames = [['Mathematics', 'MATH'], ['Science', 'SCI'], ['English', 'ENG'], ['Social Studies', 'SOC'], ['Computer Science', 'CS']];
  const classes = [];
  for (let i = 0; i < classNames.length; i++) {
    const cls = await prisma.class.create({
      data: {
        name: classNames[i], capacity: 40, classTeacherId: teachers[i % teachers.length].id,
        sections: { create: [{ name: 'A', room: `R-${101 + i}` }, { name: 'B', room: `R-${201 + i}` }] },
      },
      include: { sections: true },
    });
    for (let j = 0; j < subjectNames.length; j++)
      await prisma.subject.create({ data: { name: subjectNames[j][0], code: `${subjectNames[j][1]}${classNames[i].replace(/\D/g, '')}`, credits: rand(3, 5), classId: cls.id, teacherId: teachers[j % teachers.length].id } });
    classes.push(cls);
  }

  // students + parents
  const firsts = ['Aarav', 'Isha', 'Vivaan', 'Ananya', 'Aditya', 'Diya', 'Arjun', 'Saanvi', 'Kabir', 'Myra', 'Rohan', 'Aisha', 'Dev', 'Kiara', 'Yash', 'Riya', 'Ved', 'Tara'];
  const lasts = ['Sharma', 'Patel', 'Reddy', 'Iyer', 'Gupta', 'Nair', 'Das', 'Menon', 'Verma', 'Khan'];
  const blood = ['A+', 'B+', 'O+', 'AB+', 'A-', 'O-'];
  let adm = 1000;
  const students = [];
  for (const cls of classes) {
    for (let r = 1; r <= 10; r++) {
      const name = `${pick(firsts)} ${pick(lasts)}`;
      const parent = await prisma.parent.create({ data: { name: `${pick(['Rajesh', 'Sunita', 'Mahesh', 'Lakshmi'])} ${name.split(' ')[1]}`, relation: pick(['Father', 'Mother']), phone: `98${rand(10000000, 99999999)}`, occupation: pick(['Engineer', 'Doctor', 'Business', 'Teacher']) } });
      const st = await prisma.student.create({
        data: {
          admissionNo: `ADM${++adm}`, rollNo: String(r), name, gender: pick(['Male', 'Female']),
          dob: new Date(2010 - classNames.indexOf(cls.name), rand(0, 11), rand(1, 28)),
          bloodGroup: pick(blood), phone: `9${rand(100000000, 999999999)}`, email: `${name.split(' ')[0].toLowerCase()}${r}@student.school`,
          aadhaar: String(rand(100000000000, 999999999999)), address: `${rand(1, 200)}, ${pick(['MG Road', 'Park Street', 'Lake View'])}, Bengaluru`,
          house: pick(['Red', 'Blue', 'Green', 'Yellow']), batch: '2026', emergencyContact: `98${rand(10000000, 99999999)}`,
          allergies: pick(['None', 'None', 'Peanuts', 'Dust']), classId: cls.id, sectionId: (cls as any).sections[r % 2].id, parentId: parent.id,
          admissionDate: new Date(2026, rand(0, 7), rand(1, 28)),
        },
      });
      students.push(st);
    }
  }
  console.log(`  students: ${students.length}`);

  // attendance (last 12 weekdays)
  const days: Date[] = [];
  { const d = new Date(); while (days.length < 12) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0) days.push(new Date(d.getFullYear(), d.getMonth(), d.getDate())); } }
  const attData = [];
  for (const st of students) for (const date of days) {
    const roll = Math.random();
    attData.push({ studentId: st.id, classId: st.classId, date, status: (roll < 0.85 ? 'PRESENT' : roll < 0.93 ? 'ABSENT' : roll < 0.97 ? 'LATE' : 'HALF_DAY') as any });
  }
  await prisma.studentAttendance.createMany({ data: attData });
  console.log(`  attendance: ${attData.length}`);

  // exams + exam-subjects + results
  const exam = await prisma.exam.create({ data: { name: 'Midterm Examination 2026', term: 'Term 1', sessionLabel: '2026-2027' } });
  const unit = await prisma.exam.create({ data: { name: 'Unit Test 1', term: 'Term 1', sessionLabel: '2026-2027' } });
  const allSubjects = await prisma.subject.findMany();
  for (const ex of [exam, unit]) {
    const maxM = ex.id === exam.id ? 100 : 25;
    for (const sub of allSubjects)
      await prisma.examSubject.create({ data: { examId: ex.id, subjectId: sub.id, maxMarks: maxM, passMarks: maxM * 0.35 } });
    for (const sub of allSubjects) {
      const clsStudents = students.filter((s) => s.classId === sub.classId);
      await prisma.result.createMany({ data: clsStudents.map((s) => ({ examId: ex.id, subjectId: sub.id, studentId: s.id, marks: rand(Math.floor(maxM * 0.4), maxM), maxMarks: maxM, enteredById: sub.teacherId })) });
    }
  }
  console.log('  exams + results seeded');

  // fees: invoice per student, some payments
  const admin = await prisma.user.findFirstOrThrow({ where: { role: Role.ADMIN } });
  for (const st of students) {
    const inv = await prisma.feeInvoice.create({
      data: {
        studentId: st.id, title: 'Term 1 Fees', sessionLabel: '2026-2027', dueDate: new Date(2026, 8, 15),
        items: { create: [
          { description: 'Tuition Fee', amount: 15000, categoryId: feeCats.find((c) => c.name === 'Tuition')?.id },
          { description: 'Lab & Library', amount: 3000, categoryId: feeCats.find((c) => c.name === 'Lab')?.id },
        ] },
      },
    });
    const total = 18000;
    const roll = Math.random();
    const payNow = roll < 0.5 ? total : roll < 0.8 ? 9000 : 0;
    if (payNow > 0) {
      await prisma.payment.create({ data: { invoiceId: inv.id, amount: payNow, method: pick(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER']) as any, receiptNo: `RCPT${Date.now()}${rand(100, 999)}`, receivedById: admin.id } });
      await prisma.feeInvoice.update({ where: { id: inv.id }, data: { status: payNow >= total ? 'PAID' : 'PARTIAL' } });
    }
  }
  console.log('  fee invoices + payments seeded');

  // expenses (last 6 months)
  const vendor = await prisma.vendor.create({ data: { name: 'City Power Co', service: 'Electricity' } });
  const expData = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(); d.setMonth(d.getMonth() - m);
    for (const cat of expCats)
      expData.push({ title: `${cat.name} - ${monthKey(d)}`, amount: rand(5000, 40000), date: new Date(d.getFullYear(), d.getMonth(), rand(1, 28)), categoryId: cat.id, vendorId: cat.name === 'Electricity' ? vendor.id : null, method: 'BANK_TRANSFER' as any });
  }
  await prisma.expense.createMany({ data: expData });

  // payroll for current month
  const month = monthKey(new Date());
  for (const t of teachers)
    await prisma.payslip.create({ data: { employeeType: 'TEACHER', refId: t.id, employeeName: t.name, month, basic: 40000, bonus: 2000, pf: 4800, tax: 2000, deductions: 0, netPay: 40000 + 2000 - 4800 - 2000 } });
  const staffList = await prisma.staff.findMany();
  for (const s of staffList)
    await prisma.payslip.create({ data: { employeeType: 'STAFF', refId: s.id, employeeName: s.name, month, basic: s.baseSalary, bonus: 0, pf: s.baseSalary * 0.12, tax: 0, deductions: 0, netPay: s.baseSalary - s.baseSalary * 0.12 } });

  // admissions pipeline
  await prisma.admissionRequest.createMany({ data: [
    { applicantName: 'Neha Kapoor', appliedClass: 'Grade 9', parentName: 'Anil Kapoor', phone: '9812345670', status: 'PENDING', entranceScore: 82 },
    { applicantName: 'Rohit Bansal', appliedClass: 'Grade 8', parentName: 'Sita Bansal', phone: '9812345671', status: 'APPROVED', entranceScore: 91, documentsVerified: true, seatConfirmed: true },
    { applicantName: 'Sara Ali', appliedClass: 'Grade 10', parentName: 'Imran Ali', phone: '9812345672', status: 'WAITLIST', entranceScore: 68 },
    { applicantName: 'Karan Malhotra', appliedClass: 'Grade 11', parentName: 'Raj Malhotra', phone: '9812345673', status: 'PENDING' },
  ]});

  // notices, events, books, vehicles
  await prisma.notice.createMany({ data: [
    { title: 'Welcome to Academic Year 2026-27', body: 'We warmly welcome all students and staff to the new session.', audience: 'ALL', authorId: admin.id },
    { title: 'Staff Meeting — Friday 4 PM', body: 'All teachers to attend the staff meeting in the conference hall.', audience: 'TEACHERS', authorId: admin.id },
    { title: 'Midterm Exams Next Week', body: 'Midterm examinations begin next week. Check the schedule.', audience: 'ALL', authorId: admin.id },
  ]});
  const today = new Date();
  await prisma.event.createMany({ data: [
    { title: 'Annual Sports Day', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5), type: 'Sports' },
    { title: 'Parent-Teacher Meeting', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 12), type: 'Meeting' },
    { title: 'Midterm Examination', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8), type: 'Exam' },
  ]});
  await prisma.book.createMany({ data: [
    { title: 'Physics Fundamentals', author: 'H.C. Verma', isbn: '978-0001', quantity: 12 },
    { title: 'A Brief History of Time', author: 'Stephen Hawking', isbn: '978-0002', quantity: 5 },
  ]});
  await prisma.vehicle.createMany({ data: [
    { number: 'KA-01-AB-1234', model: 'Tata Bus', driver: 'Prakash', route: 'North Route', capacity: 40 },
    { number: 'KA-01-CD-5678', model: 'Force Van', driver: 'Suresh', route: 'East Route', capacity: 15 },
  ]});

  // timetable for Grade 10 A
  const g10 = classes.find((c) => c.name === 'Grade 10')!;
  const g10Subjects = await prisma.subject.findMany({ where: { classId: g10.id } });
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const times = [['09:00', '09:45'], ['09:45', '10:30'], ['10:45', '11:30'], ['11:30', '12:15'], ['13:00', '13:45']];
  for (let di = 0; di < DAYS.length; di++)
    for (let p = 0; p < times.length; p++) {
      const sub = g10Subjects[(p + di) % g10Subjects.length];
      await prisma.timetableSlot.create({ data: { classId: g10.id, subjectId: sub.id, teacherId: sub.teacherId, day: DAYS[di], period: p + 1, startTime: times[p][0], endTime: times[p][1] } });
    }

  console.log('✅ Seed complete.');
  console.log('   Admin   : admin@school.com / admin123');
  console.log('   Teacher : anjali@school.com / teacher123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
