import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/context/auth';
import { formatDate } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

const AUDIENCES = ['ALL', 'TEACHERS', 'STUDENTS', 'STAFF'];

export default function Notices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, loading, refetch } = useFetch<any[]>('/notices');

  const isAdmin = user?.role === 'ADMIN';

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('ALL');
  const [classId, setClassId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const notices = data || [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/notices', {
        title,
        body,
        audience: isAdmin ? audience : 'ALL',
        classId: classId || undefined,
      });
      toast({ title: 'Notice posted' });
      setTitle('');
      setBody('');
      setAudience('ALL');
      setClassId('');
      refetch();
    } catch (err) {
      toast({ title: 'Failed to post notice', description: apiError(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: any) {
    try {
      await api.delete(`/notices/${id}`);
      toast({ title: 'Notice deleted' });
      refetch();
    } catch (err) {
      toast({ title: 'Failed to delete', description: apiError(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notices" subtitle="Post and manage announcements" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Post Notice</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notice title" />
              </Field>
              <Field label="Body">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write the notice…"
                  rows={5}
                />
              </Field>
              {isAdmin && (
                <Field label="Audience">
                  <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Class ID (optional)">
                <Input value={classId} onChange={(e) => setClassId(e.target.value)} placeholder="e.g. 10A" />
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Posting…' : 'Post Notice'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <Loading />
          ) : notices.length === 0 ? (
            <EmptyState title="No notices" description="Posted notices will appear here." />
          ) : (
            notices.map((n: any) => (
              <Card key={n.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle>{n.title}</CardTitle>
                    <Badge>{n.audience}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {n.authorName} • {formatDate(n.createdAt)}
                    </span>
                    <Button variant="destructive" onClick={() => remove(n.id)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
