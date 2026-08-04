import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-brand-50 text-brand',
      green: 'bg-green-100 text-green-700',
      red: 'bg-red-100 text-red-700',
      amber: 'bg-amber-100 text-amber-700',
      slate: 'bg-slate-100 text-slate-600',
      blue: 'bg-blue-100 text-blue-700',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Map common statuses to a badge variant. */
export function statusVariant(status?: string): 'green' | 'red' | 'amber' | 'slate' | 'blue' | 'default' {
  switch ((status || '').toUpperCase()) {
    case 'PAID': case 'PRESENT': case 'APPROVED': case 'ACTIVE': case 'ENROLLED': return 'green';
    case 'PENDING': case 'ABSENT': case 'REJECTED': case 'SUSPENDED': case 'FAIL': return 'red';
    case 'PARTIAL': case 'LATE': case 'WAITLIST': case 'HALF_DAY': return 'amber';
    case 'ALUMNI': case 'INACTIVE': return 'slate';
    default: return 'default';
  }
}
