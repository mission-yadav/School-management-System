# 🎓 EduManage — School Management System

A comprehensive, role-based school ERP with **Admin** and **Teacher** panels.

## Tech stack
- **Frontend:** React + **TypeScript** + Vite + Tailwind CSS + **shadcn/ui** components + **Recharts**
- **Backend:** Node.js + **Express** + TypeScript
- **Database:** **PostgreSQL** with **Prisma** ORM
- **Auth:** JWT **access + refresh tokens** (httpOnly refresh cookie, rotation) + bcrypt, role-based access control
- **PDF:** PDFKit (certificates, fee receipts, ID cards, report cards)
- **Theme:** primary `#262081` (deep indigo), white secondary

## Modules
**Fully functional (core):** Dashboard (stats + 4 charts), Students (full profile + medical + operations: promote/suspend/alumni/merge), Admissions pipeline, Teachers, Staff, Classes & Sections, Subjects, Attendance (student + teacher + summary), Examinations (marks distribution, entry, rank list, GPA, report cards), Fee Management (invoices, line items, payments, receipts, categories, scholarships), Expenses, Payroll (payslips), Certificates (PDF: bonafide/character/transfer/study/ID card), Reports (view + CSV export), Notices, Events, Global Search, Settings (school info, grading system, fee categories, backup).

**Scaffolded (nav + data model, "coming soon"):** Parents, Library, Transport, Hostel, Inventory, Health Records, Communication.

---

## Prerequisites
- Node.js 18+ (tested on 26)
- PostgreSQL running locally. The default connection is `postgresql://<you>@localhost:5432/sms_dev`.
  Create the DB once: `createdb sms_dev` (adjust `server/.env` `DATABASE_URL` for your setup).

## Getting started
```bash
npm run install:all     # install root + server + client deps
npm run db:setup        # prisma generate + push schema + seed demo data
npm run dev             # start API (:4000) and client (:5173) together
```
Open **http://localhost:5173**.

### Logins
- **Admin** — `admin@school.com` / `admin123`
- **Teacher** — `anjali@school.com` / `teacher123` (all seeded teachers use `teacher123`)

### Reset / reseed demo data
```bash
npm run seed
```

---

## Project structure
```
SMS/
├── server/                    # Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma      # 34-table data model
│   │   └── seed.ts            # demo data
│   └── src/
│       ├── index.ts           # app bootstrap + route mounting
│       ├── prisma.ts          # Prisma client
│       ├── lib/               # jwt (access+refresh), pdf (PDFKit), http helpers
│       ├── middleware/        # auth (JWT + requireRole), error handler
│       └── routes/            # auth, dashboard, students, admissions, teachers, staff,
│                              #   classes, subjects, attendance, exams, fees, certificates,
│                              #   expenses, payroll, reports, search, settings, notices,
│                              #   events, timetable, pdf
└── client/                    # React + TS + Vite + Tailwind + shadcn/ui
    └── src/
        ├── main.tsx           # router (role-guarded)
        ├── context/auth.tsx   # AuthProvider (silent refresh) + RequireAuth
        ├── lib/               # api (axios + refresh interceptor), useFetch, nav, utils
        ├── components/ui/     # shadcn-style: button, card, input, select, dialog, tabs, table, badge, toast
        ├── components/        # Layout (grouped sidebar), PageHeader
        └── pages/             # one file per module (+ teacher/)
```

The Vite dev server proxies `/api` → `http://localhost:4000` (see `client/vite.config.ts`).

## Notes
- Change `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` in `server/.env` before deploying.
- To point at a different Postgres, edit `DATABASE_URL` and run `npm --prefix server run prisma:push`.
