'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface CompanyDetailViewProps {
  companyId: number;
  onDelete?: () => void;
}

interface StoreData {
  id: number;
  name: string;
}

interface CompanyData {
  id: number;
  name: string;
  stores: StoreData[];
}

export function CompanyDetailView({ companyId, onDelete }: CompanyDetailViewProps) {
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompany = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authFetch(`${API_URL}/companies/${companyId}`);
      if (!response.ok) throw new Error('Failed to load company data');
      const data = await response.json();
      setCompany(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompany();
  }, [companyId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !company) {
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
          {error || 'Company not found'}
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
            Basic Info
          </h3>

          {/* Name */}
          <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Name</span>
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500 }}>{company.name}</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Stores Section */}
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
            Stores ({company.stores?.length || 0})
          </h3>

          <div className="flex flex-wrap gap-2 items-center">
            {company.stores && company.stores.length > 0 ? (
              company.stores.map((store) => (
                <div
                  key={store.id}
                  className="ai-glass-border"
                  style={aiGlassLightBorderStyle('9999px')}
                >
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '4px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {store.name}
                  </div>
                </div>
              ))
            ) : (
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>
                No stores in this company
              </span>
            )}
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
