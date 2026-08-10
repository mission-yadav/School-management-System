import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, align = 'end', ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={4}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg',
          'data-[state=open]:animate-in data-[state=open]:fade-in',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, danger, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger ? 'text-red-600 focus:bg-red-50' : 'text-slate-700',
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('my-1 h-px bg-slate-100', className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400', className)} {...props} />;
}
