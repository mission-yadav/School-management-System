import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './index.css';

import { AuthProvider, RequireAuth } from '@/context/auth';
import { ToastProvider } from '@/components/ui/toast';
import { PdfViewerProvider } from '@/components/PdfViewer';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Stub from '@/pages/Stub';

import Dashboard from '@/pages/Dashboard';
import Students from '@/pages/Students';
import StudentProfile from '@/pages/StudentProfile';
import Admissions from '@/pages/Admissions';
import Teachers from '@/pages/Teachers';
import Staff from '@/pages/Staff';
import Classes from '@/pages/Classes';
import Subjects from '@/pages/Subjects';
import Attendance from '@/pages/Attendance';
import Exams from '@/pages/Exams';
import Timetable from '@/pages/Timetable';
import Fees from '@/pages/Fees';
import Expenses from '@/pages/Expenses';
import Payroll from '@/pages/Payroll';
import AuditReport from '@/pages/AuditReport';
import Certificates from '@/pages/Certificates';
import Reports from '@/pages/Reports';
import Notices from '@/pages/Notices';
import Events from '@/pages/Events';
import Settings from '@/pages/Settings';
import GlobalSearch from '@/pages/GlobalSearch';
import Assignments from '@/pages/teacher/Assignments';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <PdfViewerProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/exams" element={<Exams />} />
              <Route path="/timetable" element={<Timetable />} />
              <Route path="/notices" element={<Notices />} />

              {/* admin-only group */}
              <Route element={<RequireAuth roles={['ADMIN']}><Outlet /></RequireAuth>}>
                <Route path="/search" element={<GlobalSearch />} />
                <Route path="/students" element={<Students />} />
                <Route path="/students/:id" element={<StudentProfile />} />
                <Route path="/admissions" element={<Admissions />} />
                <Route path="/teachers" element={<Teachers />} />
                <Route path="/staff" element={<Staff />} />
                <Route path="/classes" element={<Classes />} />
                <Route path="/subjects" element={<Subjects />} />
                <Route path="/fees" element={<Fees />} />
                <Route path="/fees/structure" element={<Fees />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/audit" element={<AuditReport />} />
                <Route path="/certificates" element={<Certificates />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/events" element={<Events />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/parents" element={<Stub />} />
                <Route path="/library" element={<Stub />} />
                <Route path="/transport" element={<Stub />} />
                <Route path="/hostel" element={<Stub />} />
                <Route path="/inventory" element={<Stub />} />
                <Route path="/health" element={<Stub />} />
                <Route path="/messages" element={<Stub />} />
              </Route>

              {/* teacher-only */}
              <Route path="/assignments" element={<RequireAuth roles={['TEACHER']}><Assignments /></RequireAuth>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PdfViewerProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
