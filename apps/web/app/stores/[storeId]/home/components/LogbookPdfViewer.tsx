'use client';

import { useState } from 'react';
import { CardContainer, CardHeader, aiGlassLightBorderStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface LogbookPdfViewerProps {
  logbookId: string;
  logbookDate: string;
  onBack: () => void;
}

export function LogbookPdfViewer({ logbookId, logbookDate, onBack }: LogbookPdfViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `${API_URL}/schedule/logbook/${logbookId}/pdf`;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <CardHeader
        title={logbookDate}
        lightMode={true}
        borderRadius="1.5rem"
        titleStyle={{ color: '#2C2C2C' }}
        leftContent={
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <div
              style={{
                background: 'hsla(0, 84%, 60%, 0.85)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: '9999px',
                fontFamily: 'var(--font-open-sans)',
                color: '#FFFFFF',
                fontWeight: 500,
                padding: '6px 14px',
                fontSize: '14px',
              }}
            >
              PDF
            </div>
          </div>
        }
        rightContent={
          <button
            onClick={onBack}
            className="transition-all duration-200"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 400,
              color: '#9A999E',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#2C2C2C';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#9A999E';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Back
          </button>
        }
      />

      {/* PDF Viewer */}
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="0">
        <div style={{ position: 'relative', minHeight: '600px', borderRadius: '1.5rem', overflow: 'hidden' }}>
          {loading && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
            >
              <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading PDF...</span>
            </div>
          )}
          {error && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
            >
              <div className="text-center">
                <p style={{ fontFamily: 'var(--font-open-sans)', color: 'rgb(220, 38, 38)', marginBottom: '8px' }}>{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                  }}
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '13px',
                    color: '#6B6B6B',
                    background: 'rgba(0, 0, 0, 0.05)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '6px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <iframe
            src={pdfUrl}
            style={{
              width: '100%',
              height: '600px',
              border: 'none',
              borderRadius: '1.5rem',
            }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Failed to load PDF. The logbook may not be published yet.');
            }}
          />
        </div>
      </CardContainer>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <a
          href={`${pdfUrl}?download=true`}
          download
          className="ai-glass-border"
          style={aiGlassLightBorderStyle('0.5rem')}
        >
          <button
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6B6B6B',
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)')}
          >
            Download PDF
          </button>
        </a>
      </div>
    </div>
  );
}
