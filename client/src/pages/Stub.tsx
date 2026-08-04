import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export default function Stub() {
  const { pathname } = useLocation();
  const item = NAV.flatMap((g) => g.items).find((i) => i.to === pathname);
  const label = item?.label || 'Module';

  return (
    <div>
      <PageHeader title={label} subtitle="Planned module" />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand">
            <Construction className="size-8" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700">{label} — coming soon</h2>
          <p className="max-w-md text-sm text-slate-500">
            This module is scaffolded in the navigation and data model. The core modules
            (Students, Admissions, Attendance, Fees, Examinations, Certificates, Payroll,
            Expenses, Reports, Settings) are fully functional — this one is queued for the next build phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
