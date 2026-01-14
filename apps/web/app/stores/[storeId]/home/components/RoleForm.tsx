'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleFormProps {
  mode: 'add' | 'edit';
  roleId?: number;
  storeId: string;
  onSuccess?: (newRole?: any) => void;
  onCancel?: () => void;
}

interface RoleFamily {
  id: number;
  name: string;
}

interface FormData {
  code: string;
  displayName: string;
  familyId: number;
  assignmentModel: string;
  consecutivePolicy: string;
  taskLength: number;
}

const ASSIGNMENT_MODELS = ['HOURLY', 'WINDOW', 'DAILY', 'SOLVER'];
const CONSECUTIVE_POLICIES = ['REQUIRED', 'PREFERRED', 'NONE'];

export function RoleForm({ mode, roleId, storeId, onSuccess, onCancel }: RoleFormProps) {
  const [formData, setFormData] = useState<FormData>({
    code: '',
    displayName: '',
    familyId: 0, // Will be set after families load
    assignmentModel: 'HOURLY',
    consecutivePolicy: 'NONE',
    taskLength: 30,
  });
  const [families, setFamilies] = useState<RoleFamily[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(mode === 'edit');

  // Load role families
  useEffect(() => {
    fetch(`${API_URL}/role-families`)
      .then(res => res.json())
      .then(data => {
        setFamilies(data);
        // Set default familyId to first available family (only if not already set)
        if (data.length > 0 && mode === 'add') {
          setFormData(prev => {
            // Only set if still at default (0)
            if (prev.familyId === 0) {
              return { ...prev, familyId: data[0].id };
            }
            return prev;
          });
        }
      })
      .catch(err => console.error('Failed to load families:', err));
  }, [mode]);

  // Load existing role data if editing
  useEffect(() => {
    if (mode === 'edit' && roleId) {
      setLoadingRole(true);
      fetch(`${API_URL}/roles?id=${roleId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load role data');
          return res.json();
        })
        .then(data => {
          setFormData({
            code: data.code,
            displayName: data.displayName,
            familyId: data.familyId || 1,
            assignmentModel: data.assignmentModel || 'HOURLY',
            consecutivePolicy: data.consecutivePolicy || 'NONE',
            taskLength: data.taskLength || 30,
          });
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoadingRole(false);
        });
    }
  }, [mode, roleId]);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let value: string | number = e.target.value;
    if (field === 'familyId' || field === 'taskLength') {
      value = Number(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('=== ROLE FORM SUBMISSION START ===');
    console.log('Form data:', formData);
    console.log('Store ID:', storeId);
    console.log('Mode:', mode);

    // Validation
    if (!formData.code.trim()) {
      console.error('Validation failed: No code');
      setError('Code is required');
      setLoading(false);
      return;
    }
    if (!formData.displayName.trim()) {
      console.error('Validation failed: No displayName');
      setError('Display name is required');
      setLoading(false);
      return;
    }

    try {
      const url = mode === 'add' ? `${API_URL}/roles` : `${API_URL}/roles/${roleId}`;
      const method = mode === 'add' ? 'POST' : 'PATCH';

      const payload = {
        ...formData,
        storeId: Number(storeId),
      };

      console.log('Request URL:', url);
      console.log('Request method:', method);
      console.log('Request payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      const responseText = await response.text();
      console.log('Response body (raw):', responseText);

      if (!response.ok) {
        let errData;
        try {
          errData = JSON.parse(responseText);
        } catch (parseErr) {
          console.error('Failed to parse error response:', parseErr);
          errData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error('API Error:', errData);
        throw new Error(errData.error || 'Failed to save role');
      }

      let createdRole;
      try {
        createdRole = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('Failed to parse success response:', parseErr);
      }

      console.log('=== ROLE FORM SUBMISSION SUCCESS ===');
      onSuccess?.(createdRole);
    } catch (err: any) {
      console.error('=== ROLE FORM SUBMISSION ERROR ===');
      console.error('Error:', err);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingRole) {
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

        {/* Code Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="role-code" style={labelStyle}>Code</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="role-code"
              type="text"
              value={formData.code}
              onChange={handleChange('code')}
              placeholder="REGISTER"
              disabled={mode === 'edit'}
              style={{ ...inputStyle, opacity: mode === 'edit' ? 0.6 : 1 }}
            />
          </div>
        </div>

        {/* Display Name Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="role-displayName" style={labelStyle}>Display Name</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="role-displayName"
              type="text"
              value={formData.displayName}
              onChange={handleChange('displayName')}
              placeholder="Register"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Family Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="role-family" style={labelStyle}>Family</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <select
              id="role-family"
              value={formData.familyId}
              onChange={handleChange('familyId')}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B6B6B\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '16px' }}
            >
              {families.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Two column layout for model and policy */}
        <div className="grid grid-cols-2 gap-3">
          {/* Assignment Model Field */}
          <div className="flex flex-col gap-1">
            <label htmlFor="role-assignmentModel" style={labelStyle}>Assignment Model</label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <select
                id="role-assignmentModel"
                value={formData.assignmentModel}
                onChange={handleChange('assignmentModel')}
                style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B6B6B\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '16px' }}
              >
                {ASSIGNMENT_MODELS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Consecutive Policy Field */}
          <div className="flex flex-col gap-1">
            <label htmlFor="role-consecutivePolicy" style={labelStyle}>Consecutive Policy</label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <select
                id="role-consecutivePolicy"
                value={formData.consecutivePolicy}
                onChange={handleChange('consecutivePolicy')}
                style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B6B6B\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '16px' }}
              >
                {CONSECUTIVE_POLICIES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Task Length Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="role-taskLength" style={labelStyle}>Task Length (minutes)</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="role-taskLength"
              type="number"
              value={formData.taskLength}
              onChange={handleChange('taskLength')}
              min={15}
              max={480}
              step={15}
              style={inputStyle}
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
