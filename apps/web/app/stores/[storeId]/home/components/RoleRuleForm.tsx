'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { ROLE_RULE_TYPE_LABELS } from '@/lib/role-rule-constants';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleRuleFormProps {
  mode: 'add' | 'edit';
  ruleId?: number;
  storeId: string;
  constraintType: 'HARD' | 'SOFT';
  onSuccess?: (newRule?: any) => void;
  onCancel?: () => void;
}

interface Role {
  id: number;
  code: string;
  displayName: string;
}

interface FormData {
  roleId: number | null;
  type: string;
  targetRoleId: number | null;
  valueInt: number | null;
  displayName: string;
  description: string;
}

// RoleRuleType enum values
const ROLE_RULE_TYPES = [
  'CANNOT_BE_ASSIGNED_BEFORE',
  'CANNOT_BE_ASSIGNED_AFTER',
  'MIN_CONSECUTIVE_MINUTES',
  'MAX_CONSECUTIVE_MINUTES',
  'FORBID_ROLE',
  'TIMING',
  'LIKE_ROLE_FOR_HOUR_X',
  'DISLIKE_ROLE_FOR_HOUR_X',
  'MIN_SHIFT_LENGTH_FOR_ACCESS',
  'ASSIGN_BEFORE_SHIFT_MIN_X',
  'ASSIGN_AFTER_SHIFT_MIN_X',
  'MAX_CREW_ON_AT_A_TIME',
  'ALLOW_HALF_BLOCKSIZE',
  'DISTRIBUTION_BETWEEN_ROLE_X',
  'CANNOT_ASSIGN_DURING_STORE_HOUR_X',
] as const;

// Rule types that require a targetRoleId
const RULE_TYPES_NEEDING_TARGET_ROLE = [
  'CANNOT_BE_ASSIGNED_BEFORE',
  'CANNOT_BE_ASSIGNED_AFTER',
  'DISTRIBUTION_BETWEEN_ROLE_X',
];

// Rule types that require a valueInt
const RULE_TYPES_NEEDING_VALUE_INT = [
  'MIN_CONSECUTIVE_MINUTES',
  'MAX_CONSECUTIVE_MINUTES',
  'LIKE_ROLE_FOR_HOUR_X',
  'DISLIKE_ROLE_FOR_HOUR_X',
  'MIN_SHIFT_LENGTH_FOR_ACCESS',
  'ASSIGN_BEFORE_SHIFT_MIN_X',
  'ASSIGN_AFTER_SHIFT_MIN_X',
  'MAX_CREW_ON_AT_A_TIME',
  'CANNOT_ASSIGN_DURING_STORE_HOUR_X',
];

export function RoleRuleForm({ mode, ruleId, storeId, constraintType, onSuccess, onCancel }: RoleRuleFormProps) {
  const [formData, setFormData] = useState<FormData>({
    roleId: null,
    type: ROLE_RULE_TYPES[0],
    targetRoleId: null,
    valueInt: null,
    displayName: '',
    description: '',
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRule, setLoadingRule] = useState(mode === 'edit');

  // Load roles for the store
  useEffect(() => {
    fetch(`${API_URL}/roles?storeId=${storeId}`)
      .then(res => res.json())
      .then(data => setRoles(data))
      .catch(err => console.error('Failed to load roles:', err));
  }, [storeId]);

  // Load existing rule data if editing
  useEffect(() => {
    if (mode === 'edit' && ruleId) {
      setLoadingRule(true);
      fetch(`${API_URL}/role-rules/${ruleId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load rule data');
          return res.json();
        })
        .then(data => {
          setFormData({
            roleId: data.roleId,
            type: data.type,
            targetRoleId: data.targetRoleId || null,
            valueInt: data.valueInt || null,
            displayName: data.displayName || '',
            description: data.description || '',
          });
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoadingRule(false);
        });
    }
  }, [mode, ruleId]);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let value: string | number | null = e.target.value;
    if (field === 'roleId' || field === 'targetRoleId' || field === 'valueInt') {
      value = value === '' || value === 'null' ? null : Number(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const needsTargetRole = RULE_TYPES_NEEDING_TARGET_ROLE.includes(formData.type);
  const needsValueInt = RULE_TYPES_NEEDING_VALUE_INT.includes(formData.type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('=== FORM SUBMISSION START ===');
    console.log('Form data:', formData);
    console.log('Constraint type:', constraintType);
    console.log('Needs target role:', needsTargetRole);
    console.log('Needs value int:', needsValueInt);

    // Validation
    if (!formData.roleId) {
      console.error('Validation failed: No roleId');
      setError('Role is required');
      setLoading(false);
      return;
    }
    if (!formData.type) {
      console.error('Validation failed: No type');
      setError('Rule type is required');
      setLoading(false);
      return;
    }
    if (needsTargetRole && !formData.targetRoleId) {
      console.error('Validation failed: Target role required but not provided');
      setError('Target role is required for this rule type');
      setLoading(false);
      return;
    }
    if (needsValueInt && (formData.valueInt === null || formData.valueInt === undefined)) {
      console.error('Validation failed: Value int required but not provided');
      setError('Value is required for this rule type');
      setLoading(false);
      return;
    }

    try {
      const url = mode === 'add' ? `${API_URL}/role-rules` : `${API_URL}/role-rules/${ruleId}`;
      const method = mode === 'add' ? 'POST' : 'PATCH';

      const payload: any = {
        roleId: formData.roleId,
        type: formData.type,
        constraintType,
      };

      if (needsTargetRole && formData.targetRoleId) {
        payload.targetRoleId = formData.targetRoleId;
      }

      // NOTE: valueInt is NOT sent to RoleRule endpoint
      // It will be sent to CrewRoleRule or StoreRoleRule endpoint instead

      if (formData.displayName && formData.displayName.trim()) {
        payload.displayName = formData.displayName.trim();
      }

      if (formData.description && formData.description.trim()) {
        payload.description = formData.description.trim();
      }

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
        throw new Error(errData.error || errData.message || 'Failed to save rule');
      }

      // Parse the success response
      let createdRule;
      try {
        createdRule = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('Failed to parse success response:', parseErr);
      }

      console.log('=== ROLE RULE CREATED ===');
      console.log('Created rule:', createdRule);

      // If this is a HARD constraint (store rule) and we're adding a new rule,
      // also create a StoreRoleRule to assign it to the store
      if (mode === 'add' && constraintType === 'HARD' && createdRule?.id) {
        console.log('Creating StoreRoleRule for store:', storeId);

        const storeRulePayload: any = {
          storeId: Number(storeId),
          roleRuleId: createdRule.id,
          isPriority: false,
        };

        // Include valueInt if this rule type needs it
        if (needsValueInt && formData.valueInt !== null && formData.valueInt !== undefined) {
          storeRulePayload.valueInt = formData.valueInt;
        }

        console.log('StoreRoleRule payload:', storeRulePayload);

        try {
          const storeRuleResponse = await fetch(`${API_URL}/store-role-rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storeRulePayload),
          });

          console.log('StoreRoleRule response status:', storeRuleResponse.status);
          const storeRuleText = await storeRuleResponse.text();
          console.log('StoreRuleRule response:', storeRuleText);

          if (!storeRuleResponse.ok) {
            console.error('Failed to create StoreRoleRule, but RoleRule was created');
            // Don't throw - the RoleRule was created successfully
          } else {
            console.log('StoreRoleRule created successfully');
          }
        } catch (storeRuleErr: any) {
          console.error('Error creating StoreRoleRule:', storeRuleErr);
          // Don't throw - the RoleRule was created successfully
        }
      }

      console.log('=== FORM SUBMISSION SUCCESS ===');
      onSuccess?.(createdRule);
    } catch (err: any) {
      console.error('=== FORM SUBMISSION ERROR ===');
      console.error('Error:', err);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingRule) {
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

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236B6B6B\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '16px',
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

        {/* Role Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-roleId" style={labelStyle}>Role *</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <select
              id="rule-roleId"
              value={formData.roleId || ''}
              onChange={handleChange('roleId')}
              style={selectStyle}
            >
              <option value="">Select a role</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>
                  {role.displayName} ({role.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rule Type Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-type" style={labelStyle}>Rule Type *</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <select
              id="rule-type"
              value={formData.type}
              onChange={handleChange('type')}
              style={selectStyle}
            >
              {ROLE_RULE_TYPES.map(type => (
                <option key={type} value={type}>
                  {ROLE_RULE_TYPE_LABELS[type] || type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Target Role Field (conditional) */}
        {needsTargetRole && (
          <div className="flex flex-col gap-1">
            <label htmlFor="rule-targetRoleId" style={labelStyle}>Target Role *</label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <select
                id="rule-targetRoleId"
                value={formData.targetRoleId || ''}
                onChange={handleChange('targetRoleId')}
                style={selectStyle}
              >
                <option value="">Select a target role</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.displayName} ({role.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Value Int Field (conditional) */}
        {needsValueInt && (
          <div className="flex flex-col gap-1">
            <label htmlFor="rule-valueInt" style={labelStyle}>
              Value *{' '}
              <span style={{ fontWeight: 400, color: '#9A999E' }}>
                (minutes or hour depending on rule type)
              </span>
            </label>
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
              <input
                id="rule-valueInt"
                type="number"
                value={formData.valueInt === null ? '' : formData.valueInt}
                onChange={handleChange('valueInt')}
                placeholder="e.g., 30 for 30 minutes"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* Display Name Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-displayName" style={labelStyle}>Display Name</label>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('0.5rem')}>
            <input
              id="rule-displayName"
              type="text"
              value={formData.displayName}
              onChange={handleChange('displayName')}
              placeholder="Optional friendly name"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Description Field */}
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-description" style={labelStyle}>Description</label>
          <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.5rem'), display: 'flex' }}>
            <textarea
              id="rule-description"
              value={formData.description}
              onChange={handleChange('description')}
              placeholder="Optional description"
              rows={3}
              style={{ ...inputStyle, height: 'auto', resize: 'vertical', display: 'block' }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end mt-2">
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '8px 20px',
                border: 'none',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color: '#6B6B6B',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
          </div>
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '8px 20px',
                border: 'none',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color: loading ? 'hsla(0, 84%, 60%, 0.5)' : 'hsl(0, 84%, 60%)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Saving...' : mode === 'add' ? 'Create Rule' : 'Update Rule'}
            </button>
          </div>
        </div>
      </form>
    </CardContainer>
  );
}
