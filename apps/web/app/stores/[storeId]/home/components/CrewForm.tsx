'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface CrewFormProps {
  mode: 'add' | 'edit';
  crewId?: string;
  storeId: string;
  onSuccess?: (newCrew?: any) => void;
  onCancel?: () => void;
}

interface FormData {
  id: string;
  name: string;
}

export function CrewForm({ mode, crewId, storeId, onSuccess, onCancel }: CrewFormProps) {
  const [formData, setFormData] = useState<FormData>({ id: '', name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingCrew, setLoadingCrew] = useState(mode === 'edit');

  // Load existing crew data if editing
  useEffect(() => {
    if (mode === 'edit' && crewId) {
      setLoadingCrew(true);
      fetch(`${API_URL}/crew/${crewId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load crew data');
          return res.json();
        })
        .then(data => {
          setFormData({ id: data.id, name: data.name });
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoadingCrew(false);
        });
    }
  }, [mode, crewId]);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    // For ID field, uppercase and limit to 7 chars
    if (field === 'id') {
      value = value.toUpperCase().slice(0, 7);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (mode === 'add' && formData.id.length !== 7) {
      setError('Crew ID must be exactly 7 characters');
      setLoading(false);
      return;
    }
    if (!formData.name.trim()) {
      setError('Name is required');
      setLoading(false);
      return;
    }

    try {
      const url = mode === 'add' ? `${API_URL}/crew` : `${API_URL}/crew/${crewId}`;
      const method = mode === 'add' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id,
          name: formData.name,
          storeId: Number(storeId),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save crew member');
      }

      const createdCrew = await response.json();
      onSuccess?.(createdCrew);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingCrew) {
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

        {/* ID Field - only shown in add mode */}
        {mode === 'add' && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="crew-id"
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                fontWeight: 500,
                color: '#6B6B6B',
              }}
            >
              Crew ID (7 characters)
            </label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <input
                id="crew-id"
                type="text"
                value={formData.id}
                onChange={handleChange('id')}
                placeholder="Enter ID"
                maxLength={7}
                style={{
                  ...aiGlassLightContentStyle('0.5rem', 0.4),
                  padding: '10px 14px',
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#2C2C2C',
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '12px',
                color: '#9A999E',
              }}
            >
              {formData.id.length}/7 characters
            </span>
          </div>
        )}

        {/* Name Field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="crew-name"
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
              id="crew-name"
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="Enter name"
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
