import type { Role } from '@/context/auth';
import {
  LayoutDashboard, Users, GraduationCap, School, BookOpen, ClipboardCheck,
  FileText, Wallet, CalendarDays, Megaphone, Award, BarChart3, Settings,
  Search, Receipt, Briefcase, UserPlus, CalendarClock, Bus, Library, Boxes,
  MessageSquare, HeartPulse, Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  stub?: boolean; // renders the "coming soon" placeholder
}
export interface NavGroup { title: string; items: NavItem[]; }

const A: Role[] = ['ADMIN'];
const AT: Role[] = ['ADMIN', 'TEACHER'];
const T: Role[] = ['TEACHER'];

export const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: AT },
      { to: '/search', label: 'Global Search', icon: Search, roles: A },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/students', label: 'Students', icon: GraduationCap, roles: A },
      { to: '/admissions', label: 'Admissions', icon: UserPlus, roles: A },
      { to: '/teachers', label: 'Teachers', icon: Users, roles: A },
      { to: '/staff', label: 'Staff', icon: Briefcase, roles: A },
      { to: '/parents', label: 'Parents', icon: Users, roles: A, stub: true },
    ],
  },
  {
    title: 'Academics',
    items: [
      { to: '/classes', label: 'Classes & Sections', icon: School, roles: A },
      { to: '/subjects', label: 'Subjects', icon: BookOpen, roles: A },
      { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, roles: AT },
      { to: '/exams', label: 'Examinations', icon: FileText, roles: AT },
      { to: '/timetable', label: 'Timetable', icon: CalendarClock, roles: AT },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/fees', label: 'Fee Management', icon: Wallet, roles: A },
      { to: '/expenses', label: 'Expenses', icon: Receipt, roles: A },
      { to: '/payroll', label: 'Payroll', icon: Wallet, roles: A },
    ],
  },
  {
    title: 'Office',
    items: [
      { to: '/certificates', label: 'Certificates', icon: Award, roles: A },
      { to: '/reports', label: 'Reports', icon: BarChart3, roles: A },
      { to: '/notices', label: 'Notices', icon: Megaphone, roles: AT },
      { to: '/events', label: 'Events', icon: CalendarDays, roles: A },
      { to: '/assignments', label: 'Assignments', icon: FileText, roles: T },
    ],
  },
  {
    title: 'Modules',
    items: [
      { to: '/library', label: 'Library', icon: Library, roles: A, stub: true },
      { to: '/transport', label: 'Transport', icon: Bus, roles: A, stub: true },
      { to: '/hostel', label: 'Hostel', icon: Building2, roles: A, stub: true },
      { to: '/inventory', label: 'Inventory', icon: Boxes, roles: A, stub: true },
      { to: '/health', label: 'Health Records', icon: HeartPulse, roles: A, stub: true },
      { to: '/messages', label: 'Communication', icon: MessageSquare, roles: A, stub: true },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, roles: A },
    ],
  },
];

/** Flattened nav items visible for a role. */
export function navForRole(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
}
