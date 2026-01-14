'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface StoreFormProps {
  mode: 'add' | 'edit';
  storeId?: number;
  onSuccess?: (newStore?: any) => void;
  onCancel?: () => void;
}

interface Company {
  id: number;
  name: string;
}

interface FormData {
  name: string;
  timezone: string;
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
  companyId: number;
}

const TIMEZONES = ['EST', 'CST', 'MST', 'PST', 'UTC'];

// Helper to convert minutes to HH:MM
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

// Helper to convert HH:MM to minutes
const timeToMinutes = (time: string): number => {
  const [hours, mins] = time.split(':').map(Number);
  return (hours || 0) * 60 + (mins || 0);
};

export function StoreForm({ mode, storeId, onSuccess, onCancel }: StoreFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    timezone: 'EST',
    openMinutesFromMidnight: 480, // 08:00
    closeMinutesFromMidnight: 1260, // 21:00
    companyId: 0,
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(mode === 'edit');
  const [error, setError] = useState<string | null>(null);

  // Load companies
  useEffect(() => {
    fetch(`${API_URL}/companies`)
      .then(res => res.json())
      .then((data: any[]) => {
        setCompanies(data);
        // Set default companyId to first available company (only if not already set)
        if (data.length > 0 && mode === 'add' && formData.companyId === 0) {
          setFormData(prev => ({ ...prev, companyId: data[0].id }));
        }
      })
      .catch(err => console.error('Failed to load companies:', err));
  }, [mode]);

  // Load existing store data if editing
  useEffect(() => {
    if (mode === 'edit' && storeId) {
      setLoadingData(true);
      fetch(`${API_URL}/stores/${storeId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load store data');
          return res.json();
        })
        .then(data => {
          setFormData({
            name: data.name,
            timezone: data.timezone,
            openMinutesFromMidnight: data.openMinutesFromMidnight,
            closeMinutesFromMidnight: data.closeMinutesFromMidnight,
            companyId: data.companyId,
          });
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoadingData(false);
        });
    }
  }, [mode, storeId]);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let value: string | number = e.target.value;
    if (field === 'companyId') {
      value = Number(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleTimeChange = (field: 'openMinutesFromMidnight' | 'closeMinutesFromMidnight') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const minutes = timeToMinutes(e.target.value);
    setFormData(prev => ({ ...prev, [field]: minutes }));
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
    if (!formData.companyId) {
      setError('Company is required');
      setLoading(false);
      return;
    }

    try {
      const url = mode === 'add' ? `${API_URL}/stores` : `${API_URL}/stores/${storeId}`;
      const method = mode === 'add' ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id: storeId, // Include ID for edit mode
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save store');
      }

      const savedStore = await response.json();
      onSuccess?.(savedStore);
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

  const inputStyle = {
    ...aiGlassLightContentStyle('0.5rem', 0.4),
    padding: '10px 14px',
    width: '100%',
    border: 'none',
    outline: 'none',
    fontFamily: 'var(--font-open-sans)',
    fontSize: '14px',
    color: '#2C2C2C',
  };

  const labelStyle = {
    fontFamily: 'var(--font-open-sans)',
    fontSize: '13px',
    fontWeight: 500,
    color: '#6B6B6B',
  };

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
          <label htmlFor="store-name" style={labelStyle}>Name</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="store-name"
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="e.g. Dr. Phillips"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Company Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="store-company" style={labelStyle}>Company</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <select
              id="store-company"
              value={formData.companyId}
              onChange={handleChange('companyId')}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B6B6B\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '16px' }}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Timezone Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="store-timezone" style={labelStyle}>Timezone</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <select
              id="store-timezone"
              value={formData.timezone}
              onChange={handleChange('timezone')}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B6B6B\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '16px' }}
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Two column layout for open/close times */}
        <div className="grid grid-cols-2 gap-3">
          {/* Open Time */}
          <div className="flex flex-col gap-1">
            <label htmlFor="store-open-time" style={labelStyle}>Open Time</label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <input
                id="store-open-time"
                type="time"
                value={minutesToTime(formData.openMinutesFromMidnight)}
                onChange={handleTimeChange('openMinutesFromMidnight')}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Close Time */}
          <div className="flex flex-col gap-1">
            <label htmlFor="store-close-time" style={labelStyle}>Close Time</label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <input
                id="store-close-time"
                type="time"
                value={minutesToTime(formData.closeMinutesFromMidnight)}
                onChange={handleTimeChange('closeMinutesFromMidnight')}
                style={inputStyle}
              />
            </div>
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
