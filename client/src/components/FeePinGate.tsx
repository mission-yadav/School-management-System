import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Lock } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

/** Locks the Fee Management pages behind a 4-digit PIN. Stays unlocked while you stay in the
 *  section; leaving and returning asks again. */
export default function FeePinGate() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  if (unlocked) return <Outlet />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) { setError('Enter the 4-digit PIN'); return; }
    setChecking(true); setError('');
    try {
      const { data } = await api.post('/settings/fee-pin/verify', { pin });
      if (data?.ok) setUnlocked(true);
      else { setError('Incorrect PIN'); setPin(''); }
    } catch (err) {
      setError(apiError(err, 'Could not verify PIN'));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#262081]/10 text-[#262081]">
            <Lock className="size-7" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-800">Fee Management is locked</div>
            <div className="text-sm text-slate-500">Enter the 4-digit PIN to view or make changes.</div>
          </div>
          <form onSubmit={submit} className="flex w-full flex-col items-center gap-3">
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-32 text-center text-2xl tracking-[0.5em]"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={checking || pin.length < 4}>
              {checking ? 'Checking…' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
