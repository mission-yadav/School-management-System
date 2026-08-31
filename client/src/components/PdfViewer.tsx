import { createContext, useContext, useState, type ReactNode } from 'react';
import { PdfPreviewDialog, type PdfPreview } from './PdfPreviewDialog';

/** App-wide PDF viewer: call openPdf({url, filename, title}) from anywhere to open a
 *  PDF in a preview modal with Download + Print (never a silent download). */
const PdfViewerContext = createContext<(p: PdfPreview) => void>(() => {});

export function usePdfViewer() {
  return useContext(PdfViewerContext);
}

export function PdfViewerProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  return (
    <PdfViewerContext.Provider value={setPreview}>
      {children}
      <PdfPreviewDialog preview={preview} onClose={() => setPreview(null)} />
    </PdfViewerContext.Provider>
  );
}
