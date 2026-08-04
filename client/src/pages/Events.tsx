import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatDate } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

const TYPES = ['Exam', 'Holiday', 'Meeting', 'Sports', 'Other'];

export default function Events() {
  const { toast } = useToast();
  const { data, loading, refetch } = useFetch<any[]>('/events');

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState('Exam');
  const [submitting, setSubmitting] = useState(false);

  const events = [...(data || [])].sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  function resetForm() {
    setTitle('');
    setDescription('');
    setDate('');
    setType('Exam');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) {
      toast({ title: 'Title and date are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/events', { title, description, date, type });
      toast({ title: 'Event added' });
      setOpen(false);
      resetForm();
      refetch();
    } catch (err) {
      toast({ title: 'Failed to add event', description: apiError(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: any) {
    try {
      await api.delete(`/events/${id}`);
      toast({ title: 'Event deleted' });
      refetch();
    } catch (err) {
      toast({ title: 'Failed to delete', description: apiError(err), variant: 'destructive' });
    }
  }

  const columns: Column<any>[] = [
    { key: 'title', header: 'Title', render: (r: any) => r.title },
    { key: 'type', header: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
    { key: 'date', header: 'Date', render: (r: any) => formatDate(r.date) },
    { key: 'description', header: 'Description', render: (r: any) => r.description },
    {
      key: 'actions',
      header: '',
      render: (r: any) => (
        <Button variant="destructive" onClick={() => remove(r.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Events" subtitle="School calendar and activities">
        <Button onClick={() => setOpen(true)}>+ Add Event</Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming & Past Events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loading />
          ) : events.length === 0 ? (
            <EmptyState title="No events" description="Add an event to populate the calendar." />
          ) : (
            <DataTable columns={columns} data={events} />
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-lg font-semibold">Add Event</h2>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details…"
                rows={3}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
