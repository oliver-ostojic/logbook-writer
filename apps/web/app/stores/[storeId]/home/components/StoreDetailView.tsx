'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface StoreDetailViewProps {
  storeId: number;
  onDelete?: () => void;
}

interface StoreData {
  id: number;
  name: string;
  timezone: string;
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
  companyId: number;
  Company: {
    id: number;
    name: string;
  };
}

// Helper to convert minutes to HH:MM
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export function StoreDetailView({ storeId, onDelete }: StoreDetailViewProps) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStore = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authFetch(`${API_URL}/stores/${storeId}`);
      if (!response.ok) throw new Error('Failed to load store data');
      const data = await response.json();
      setStore(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStore();
  }, [storeId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !store) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            borderRadius: '0.5rem',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            color: 'rgb(220, 38, 38)',
          }}
        >
          {error || 'Store not found'}
        </div>
      </CardContainer>
    );
  }

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
      <div className="flex flex-col gap-6">
        {/* Basic Info Section */}
        <div className="flex flex-col gap-3">
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Store Info
          </h3>

          <div className="flex flex-col gap-2">
            {/* Name */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Name</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500 }}>{store.name}</span>
            </div>

            {/* Company */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Company</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{store.Company.name}</span>
            </div>

            {/* Timezone */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Timezone</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{store.timezone}</span>
            </div>

            {/* Open Time */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Open Time</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{minutesToTime(store.openMinutesFromMidnight)}</span>
            </div>

            {/* Close Time */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Close Time</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{minutesToTime(store.closeMinutesFromMidnight)}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Delete Button */}
        <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
          <button
            onClick={onDelete}
            style={{
              ...aiGlassLightContentStyle('9999px', 0.5),
              padding: '10px 16px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 500,
              color: 'hsl(0, 84%, 60%)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </CardContainer>
  );
}
