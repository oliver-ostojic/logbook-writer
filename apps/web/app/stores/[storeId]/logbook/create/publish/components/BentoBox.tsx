'use client';

import { useEffect, useState } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface BentoBoxProps {
  logbookId: string | null;
}

export default function BentoBox({ logbookId }: BentoBoxProps) {
  const [logbookDate, setLogbookDate] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!logbookId) return;

    const fetchLogbook = async () => {
      try {
        const res = await fetch(`${API_URL}/schedule/logbook/${encodeURIComponent(logbookId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.date) {
            // Parse the date and format it nicely
            const date = new Date(data.date);
            const formatted = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            });
            setLogbookDate(formatted);
          }
          // Check if PDF is available
          if (data.storedFilePath) {
            setHasPdf(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch logbook:', err);
      }
    };

    fetchLogbook();
  }, [logbookId]);

  const handleDownloadPdf = async () => {
    if (!logbookId) return;
    
    setIsDownloading(true);
    try {
      const res = await fetch(`${API_URL}/schedule/logbook/${encodeURIComponent(logbookId)}/pdf`);
      if (!res.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logbook-${logbookDate?.replace(/[,\s]+/g, '-') || logbookId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
      <div className="relative isolate pt-10 pb-10 sm:pt-16 sm:pb-16">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 transform-gpu overflow-hidden opacity-30 blur-3xl"
        >
          <div
            style={{
              clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
          className="ml-[max(50%,38rem)] aspect-[1313/771] w-[82.0625rem] bg-gradient-to-tr from-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] to-[#9089fc]"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 flex transform-gpu overflow-hidden pt-32 opacity-25 blur-3xl sm:pt-40 xl:justify-end"
      >
        <div
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
          className="ml-[-22rem] aspect-[1313/771] w-[82.0625rem] flex-none origin-top-right rotate-[30deg] bg-gradient-to-tr from-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] to-[#9089fc] xl:ml-0 xl:mr-[calc(50%-12rem)]"
        />
      </div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="mt-4 text-balance text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Logbook published successfully.
          </p>
          <p className="p-6 text-lg/8 text-gray-600 sm:p-12" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Your logbook is now live and accessible to your team. You can always come back to make adjustments or
            create new logbooks for future dates.
            </p>
        </div>
        <div className="mx-auto mt-2 max-w-2xl text-sm/6 text-gray-900">
          <div
            className="ai-glass-border rounded-2xl"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
          >
            <div
              className="rounded-2xl"
              style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '1.5rem' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>Date</span>
                <span className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'var(--font-open-sans)' }}>{logbookDate || 'Loading...'}</span>
              </div>
              <div className="my-4 border-t border-gray-200" />
              <button
                onClick={handleDownloadPdf}
                disabled={!hasPdf || isDownloading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {isDownloading ? 'Downloading...' : hasPdf ? 'Download PDF' : 'PDF not available'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
