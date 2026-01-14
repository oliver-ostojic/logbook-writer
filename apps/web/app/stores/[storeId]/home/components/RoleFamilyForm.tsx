'use client';

import { useState } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleFamilyFormProps {
  companyId: number;
  onSuccess?: (newFamily?: any) => void;
  onCancel?: () => void;
}

interface FormData {
  name: string;
  displayName: string;
  minMinutes: string;
  maxMinutes: string;
}

export function RoleFamilyForm({ companyId, onSuccess, onCancel }: RoleFamilyFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    displayName: '',
    minMinutes: '0',
    maxMinutes: '480',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    // For name field, uppercase and remove spaces
    if (field === 'name') {
      value = value.toUpperCase().replace(/\s/g, '_');
    }
    // For minute fields, only allow numbers
    if (field === 'minMinutes' || field === 'maxMinutes') {
      value = value.replace(/[^0-9]/g, '');
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Code is required');
      setLoading(false);
      return;
    }
    if (!formData.displayName.trim()) {
      setError('Display Name is required');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/role-families`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          displayName: formData.displayName,
          minMinutes: parseInt(formData.minMinutes) || 0,
          maxMinutes: parseInt(formData.maxMinutes) || 480,
          companyId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create role family');
      }

      const createdFamily = await response.json();
      onSuccess?.(createdFamily);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

        {/* Display Name Field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="family-display-name"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 500,
              color: '#6B6B6B',
            }}
          >
            Display Name
          </label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="family-display-name"
              type="text"
              value={formData.displayName}
              onChange={handleChange('displayName')}
              placeholder="e.g. Customer Experience"
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

        {/* Code Field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="family-name"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 500,
              color: '#6B6B6B',
            }}
          >
            Code
          </label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="family-name"
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="e.g. CUSTOMER_EXPERIENCE"
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
            Uppercase, no spaces (use underscores)
          </span>
        </div>

        {/* Min Minutes Field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="family-min-minutes"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 500,
              color: '#6B6B6B',
            }}
          >
            Min Minutes
          </label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="family-min-minutes"
              type="text"
              value={formData.minMinutes}
              onChange={handleChange('minMinutes')}
              placeholder="0"
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

        {/* Max Minutes Field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="family-max-minutes"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              fontWeight: 500,
              color: '#6B6B6B',
            }}
          >
            Max Minutes
          </label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="family-max-minutes"
              type="text"
              value={formData.maxMinutes}
              onChange={handleChange('maxMinutes')}
              placeholder="480"
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
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </CardContainer>
  );
}
