'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface CompanyFormProps {
  mode: 'add' | 'edit';
  companyId?: number;
  onSuccess?: (newCompany?: any) => void;
  onCancel?: () => void;
}

interface FormData {
  name: string;
}

export function CompanyForm({ mode, companyId, onSuccess, onCancel }: CompanyFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(mode === 'edit');
  const [error, setError] = useState<string | null>(null);

  // Load existing company data if editing
  useEffect(() => {
    if (mode === 'edit' && companyId) {
      setLoadingData(true);
      fetch(`${API_URL}/companies/${companyId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load company data');
          return res.json();
        })
        .then(data => {
          setFormData({
            name: data.name,
          });
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoadingData(false);
        });
    }
  }, [mode, companyId]);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Name is required');
      setLoading(false);
      return;
    }

    try {
      const url = mode === 'add' ? `${API_URL}/companies` : `${API_URL}/companies/${companyId}`;
      const method = mode === 'add' ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save company');
      }

      const savedCompany = await response.json();
      onSuccess?.(savedCompany);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
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
            {error}
          </div>
        )}

        {/* Name Field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="company-name"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 500,
              color: '#6B6B6B',
            }}
          >
            Name
          </label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="company-name"
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="e.g. Trader Joe's"
              style={{
                ...aiGlassLightContentStyle('0.5rem', 0.4),
                padding: '10px 14px',
                width: '100%',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#2C2C2C',
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6B6B6B',
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)')}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              backgroundColor: loading ? 'hsl(0, 84%, 70%)' : 'hsl(0, 84%, 60%)',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '8px 16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)')}
          >
            {loading ? 'Saving...' : mode === 'add' ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </CardContainer>
  );
}
