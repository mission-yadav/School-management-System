import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Loading } from '@/components/PageHeader';
import { useToast } from '@/components/ui/toast';

const blank = () => ({
  name: '', iemis: '', admissionNo: '', classId: '', sectionId: '', rollNo: '',
  gender: 'Male', dob: '', bloodGroup: '', phone: '', email: '', address: '',
  aadhaar: '', previousSchool: '', house: '', batch: '', emergencyContact: '',
  allergies: '', disabilities: '', medicalHistory: '', vaccination: '',
  usesTransport: false, transportFee: '', feeFree: false,
  parentName: '', parentPhone: '', parentRelation: 'Father', parentEmail: '',
  status: 'ACTIVE',
});

function fromStudent(s: any) {
  return {
    ...blank(),
    name: s.name || '', iemis: s.iemis || '', admissionNo: s.admissionNo || '',
    classId: s.classId ? String(s.classId) : '', sectionId: s.sectionId ? String(s.sectionId) : '',
    rollNo: s.rollNo || '', gender: s.gender || 'Male', dob: s.dob ? String(s.dob).slice(0, 10) : '',
    bloodGroup: s.bloodGroup || '', phone: s.phone || '', email: s.email || '', address: s.address || '',
    aadhaar: s.aadhaar || '', previousSchool: s.previousSchool || '', house: s.house || '', batch: s.batch || '',
    emergencyContact: s.emergencyContact || '', allergies: s.allergies || '', disabilities: s.disabilities || '',
    medicalHistory: s.medicalHistory || '', vaccination: s.vaccination || '',
    usesTransport: !!s.usesTransport, transportFee: s.transportFee != null ? String(s.transportFee) : '', feeFree: !!s.feeFree,
    parentName: s.parent?.name || '', parentPhone: s.parent?.phone || '', parentRelation: s.parent?.relation || 'Father', parentEmail: s.parent?.email || '',
    status: s.status || 'ACTIVE',
  };
}

/** Create (studentId=null) or fully edit a student. */
export function StudentFormDialog({ open, studentId, onClose, onSaved }: {
  open: boolean; studentId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const { data: classes } = useFetch<any[]>('/classes');
  const [form, setForm] = useState<any>(blank());
  const [loading, setLoading] = useState(false);
  const editing = !!studentId;

  useEffect(() => {
    if (!open) return;
    if (studentId) {
      setLoading(true);
      api.get(`/students/${studentId}`).then(({ data }) => setForm(fromStudent(data)))
        .catch((e) => toast(apiError(e), 'error')).finally(() => setLoading(false));
    } else {
      setForm(blank());
    }
    // eslint-disable-next-line
  }, [open, studentId]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const sections = (classes || []).find((c: any) => String(c.id) === String(form.classId))?.sections || [];

  async function save() {
    if (!form.name) { toast('Name is required', 'error'); return; }
    const payload = {
      ...form,
      classId: form.classId ? Number(form.classId) : null,
      sectionId: form.sectionId ? Number(form.sectionId) : null,
      transportFee: form.transportFee === '' ? null : Number(form.transportFee),
    };
    try {
      if (editing) await api.put(`/students/${studentId}`, payload);
      else await api.post('/students', payload);
      toast(editing ? 'Student updated' : 'Student admitted');
      onSaved(); onClose();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  const H = ({ children }: { children: string }) => <div className="col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</div>;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-2xl"
        title={editing ? 'Edit Student' : 'Admit Student'}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{editing ? 'Save Changes' : 'Admit'}</Button></>}
      >
        {loading ? <Loading label="Loading student…" /> : (
          <div className="grid grid-cols-2 gap-3">
            <H>Basic</H>
            <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="IEMIS ID"><Input value={form.iemis} onChange={(e) => set('iemis', e.target.value)} /></Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option>Male</option><option>Female</option><option>Other</option>
              </Select>
            </Field>
            <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
            <Field label="Blood Group"><Input value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)} /></Field>
            <Field label="Aadhaar / Citizenship No"><Input value={form.aadhaar} onChange={(e) => set('aadhaar', e.target.value)} /></Field>

            <H>Academic</H>
            <Field label="Class">
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, sectionId: '' })}>
                <option value="">Select class</option>
                {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Section">
              <Select value={form.sectionId} onChange={(e) => set('sectionId', e.target.value)}>
                <option value="">Select section</option>
                {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Roll No"><Input value={form.rollNo} onChange={(e) => set('rollNo', e.target.value)} /></Field>
            <Field label="House"><Input value={form.house} onChange={(e) => set('house', e.target.value)} /></Field>
            <Field label="Batch"><Input value={form.batch} onChange={(e) => set('batch', e.target.value)} /></Field>
            <Field label="Previous School"><Input value={form.previousSchool} onChange={(e) => set('previousSchool', e.target.value)} /></Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ALUMNI">Alumni</option><option value="INACTIVE">Inactive</option>
              </Select>
            </Field>

            <H>Contact</H>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Emergency Contact"><Input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Address"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></Field></div>

            <H>Guardian</H>
            <Field label="Guardian Name"><Input value={form.parentName} onChange={(e) => set('parentName', e.target.value)} /></Field>
            <Field label="Guardian Phone"><Input value={form.parentPhone} onChange={(e) => set('parentPhone', e.target.value)} /></Field>
            <Field label="Relation">
              <Select value={form.parentRelation} onChange={(e) => set('parentRelation', e.target.value)}>
                <option>Father</option><option>Mother</option><option>Guardian</option>
              </Select>
            </Field>
            <Field label="Guardian Email"><Input value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} /></Field>

            <H>Medical</H>
            <Field label="Allergies"><Input value={form.allergies} onChange={(e) => set('allergies', e.target.value)} /></Field>
            <Field label="Disabilities"><Input value={form.disabilities} onChange={(e) => set('disabilities', e.target.value)} /></Field>
            <Field label="Medical History"><Input value={form.medicalHistory} onChange={(e) => set('medicalHistory', e.target.value)} /></Field>
            <Field label="Vaccination"><Input value={form.vaccination} onChange={(e) => set('vaccination', e.target.value)} /></Field>

            <H>Transport & Fees</H>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!form.usesTransport} onChange={(e) => set('usesTransport', e.target.checked)} className="size-4 accent-[#262081]" />
              Uses transport service
            </label>
            <Field label="Transport Fee (override)"><Input type="number" value={form.transportFee} onChange={(e) => set('transportFee', e.target.value)} disabled={!form.usesTransport} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!form.feeFree} onChange={(e) => set('feeFree', e.target.checked)} className="size-4 accent-[#262081]" />
              Free — waive monthly tuition fee
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
