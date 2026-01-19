"use client";
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import LogbookView, { useLogbookPreview } from './LogbookView';
import Stats from './Stats';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

function classNames(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function BentoBox() {
  const router = useRouter();
  const params = useParams();
  const storeId = params?.storeId as string;
  const { preview, loading, error } = useLogbookPreview();
  
  const [showScrollTop, setShowScrollTop] = useState(false);
  const statsBentoRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Show scroll-to-top button when scrolled past ~2 rows of the table
  useEffect(() => {
    const handleScroll = () => {
      if (!tableRef.current) return;
      const tableRect = tableRef.current.getBoundingClientRect();
      // Show button when top of table is above viewport by ~100px (roughly 2 rows)
      setShowScrollTop(tableRect.top < -100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    if (!statsBentoRef.current) return;
    // Get the gap between bento boxes (gap-4 = 1rem = 16px)
    const gap = 16;
    const elementTop = statsBentoRef.current.getBoundingClientRect().top + window.scrollY;
    // Scroll so the top of stats bento has the same margin from top as gap between boxes
    window.scrollTo({
      top: elementTop - gap - 81, // 88px accounts for sticky header height
      behavior: 'smooth'
    });
  };
  
  return (
    <>
      <div className="pt-10 pb-10 sm:pt-16 sm:pb-16">
        <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
          <h2 className="text-xl font-medium text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]" style={{ fontFamily: 'var(--font-open-sans)' }}>Review draft</h2>
          <p className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Preview your logbook, tweak any assignments, and review key stats before you publish.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16">
            {/* Stats bento box */}
            <div
              ref={statsBentoRef}
              className="ai-glass-border rounded-[1.5rem]"
              style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
            >
              <div
                className="w-full overflow-hidden rounded-[1.5rem]"
                style={aiGlassLightContentStyle('1.5rem', 0.6)}
              >
                <Stats
                  metadata={preview?.metadata}
                  preferenceMetadata={preview?.preferenceMetadata}
                  loading={loading}
                />
              </div>
            </div>
            {/* Table bento box */}
            <div
              ref={tableRef}
              className="ai-glass-border rounded-[1.5rem]"
              style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
            >
              <div
                className="w-full overflow-hidden rounded-[1.5rem]"
                style={aiGlassLightContentStyle('1.5rem', 0.6)}
              >
                <LogbookView preview={preview} loading={loading} error={error} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed left-1/2 -translate-x-1/2 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-gray-900/10 transition-all hover:bg-gray-50 hover:shadow-xl"
          style={{ top: '110px' }}
          aria-label="Scroll to top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
          </svg>
        </button>
      )}
    </>
  )
}
