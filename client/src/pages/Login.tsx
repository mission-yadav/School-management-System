import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { apiError } from '@/lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@school.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'ADMIN' ? '/dashboard' : '/dashboard');
    } catch (err) {
      setError(apiError(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img src="/logo.jpg" alt="Janaki Secondary School" className="mx-auto mb-3 h-20 w-20 rounded-2xl object-cover" />
          <h1 className="text-2xl font-bold text-slate-800">Janaki Secondary School</h1>
          <p className="text-sm text-slate-500">Birgunj-3, Aadarshtole</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 space-y-1 rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
          <div>Admin — <b>admin@school.com</b> / <b>admin123</b></div>
          <div>Teacher — <b>anjali@school.com</b> / <b>teacher123</b></div>
        </div>
      </div>
    </div>
  );
}
