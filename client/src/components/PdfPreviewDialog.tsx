import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/PageHeader';

export interface PdfPreview { url: string; filename: string; title?: string; }

/** Preview an authed PDF endpoint in a modal, with Download and Print. */
export function PdfPreviewDialog({ preview, onClose }: { preview: PdfPreview | null; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!preview) { setBlobUrl(null); setError(''); return; }
    let created: string | null = null;
    setLoading(true); setError(''); setBlobUrl(null);
    api.get(preview.url, { responseType: 'blob' })
      .then((res) => { created = URL.createObjectURL(res.data); setBlobUrl(created); })
      .catch((e) => setError(apiError(e, 'Failed to load PDF')))
      .finally(() => setLoading(false));
    return () => { if (created) URL.revokeObjectURL(created); };
  }, [preview]);

  function download() {
    if (!blobUrl || !preview) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = preview.filename;
    a.click();
  }

  function print() {
    const win = iframeRef.current?.contentWindow;
    if (win) { win.focus(); win.print(); }
  }

  return (
    <Dialog open={!!preview} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-3xl"
        title={preview?.title || 'Preview'}
        footer={<>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={print} disabled={!blobUrl}><Printer className="size-4" /> Print</Button>
          <Button onClick={download} disabled={!blobUrl}><Download className="size-4" /> Download</Button>
        </>}
      >
        {loading ? (
          <Loading label="Loading preview…" />
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : blobUrl ? (
          <iframe ref={iframeRef} src={blobUrl} title="PDF preview" className="h-[65vh] w-full rounded-md border border-slate-200" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
