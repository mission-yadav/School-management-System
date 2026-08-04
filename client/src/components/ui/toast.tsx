import * as React from 'react';
import { cn } from '@/lib/utils';

type Toast = { id: string; message: string; type: 'success' | 'error' };
type ToastArg = string | { title?: string; description?: string; variant?: string };

export type ToastApi = ((msg: ToastArg, type?: 'success' | 'error') => void) & {
  success: (message: string) => void;
  error: (message: string) => void;
  toast: (msg: ToastArg, type?: 'success' | 'error') => void;
};

const ToastCtx = React.createContext<ToastApi>((() => {}) as unknown as ToastApi);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const api = React.useMemo<ToastApi>(() => {
    const fn = ((msg: ToastArg, type: 'success' | 'error' = 'success') => {
      if (typeof msg === 'string') return push(msg, type);
      const message = [msg.title, msg.description].filter(Boolean).join(' — ');
      push(message, msg.variant === 'destructive' ? 'error' : type);
    }) as ToastApi;
    fn.success = (m: string) => push(m, 'success');
    fn.error = (m: string) => push(m, 'error');
    fn.toast = fn;
    return fn;
  }, [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn('rounded-lg px-4 py-2.5 text-sm text-white shadow-lg', t.type === 'error' ? 'bg-red-600' : 'bg-brand')}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => React.useContext(ToastCtx);
