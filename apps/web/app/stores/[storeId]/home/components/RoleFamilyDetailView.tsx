'use client';

import { useState, useEffect } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleFamilyDetailViewProps {
  familyId: string;
  storeId: string;
  onDelete?: () => void;
}

interface RoleData {
  id: number;
  code: string;
  displayName: string;
}

interface FamilyData {
  id: number;
  name: string;
  displayName: string;
  minMinutes: number;
  maxMinutes: number;
  companyId: number;
  roles: RoleData[];
}

export function RoleFamilyDetailView({ familyId, storeId, onDelete }: RoleFamilyDetailViewProps) {
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [allRoles, setAllRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for basic info editing
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editMinMinutes, setEditMinMinutes] = useState('');
  const [editMaxMinutes, setEditMaxMinutes] = useState('');

  const loadFamily = async () => {
    setLoading(true);
    setError(null);

    try {
      const [familyRes, rolesRes] = await Promise.all([
        fetch(`${API_URL}/role-families/${familyId}`),
        fetch(`${API_URL}/roles?storeId=${storeId}`),
      ]);

      if (!familyRes.ok) throw new Error('Failed to load role family data');
      const familyData = await familyRes.json();
      setFamily(familyData);

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setAllRoles(Array.isArray(rolesData) ? rolesData : []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamily();
  }, [familyId, storeId]);

  const handleRemoveRole = async (roleId: number) => {
    if (!family) return;
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/role-families/${familyId}/roles/${roleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        // Update local state
        setFamily({
          ...family,
          roles: family.roles.filter(r => r.id !== roleId),
        });
      }
    } catch (err) {
      console.error('Failed to remove role:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async (roleId: number) => {
    if (!family) return;
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/role-families/${familyId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });
      if (res.ok) {
        // Reload family to get updated roles
        await loadFamily();
      }
    } catch (err) {
      console.error('Failed to add role:', err);
    } finally {
      setSaving(false);
    }
  };

  // Get roles that can be added (not already in this family)
  const availableRoles = allRoles.filter(
    r => !family?.roles.some(fr => fr.id === r.id)
  );

  const startEditingBasicInfo = () => {
    if (!family) return;
    setEditDisplayName(family.displayName);
    setEditMinMinutes(String(family.minMinutes));
    setEditMaxMinutes(String(family.maxMinutes));
    setIsEditingBasicInfo(true);
  };

  const saveBasicInfo = async () => {
    if (!family) return;
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/role-families/${familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName,
          minMinutes: parseInt(editMinMinutes) || 0,
          maxMinutes: parseInt(editMaxMinutes) || 480,
        }),
      });

      if (res.ok) {
        // Update local state
        setFamily({
          ...family,
          displayName: editDisplayName,
          minMinutes: parseInt(editMinMinutes) || 0,
          maxMinutes: parseInt(editMaxMinutes) || 480,
        });
        setIsEditingBasicInfo(false);
      }
    } catch (err) {
      console.error('Failed to save basic info:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !family) {
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
          {error || 'Role family not found'}
        </div>
      </CardContainer>
    );
  }

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
      <style>{`
        @keyframes iosWiggle {
          0% { transform: rotate(-1deg); }
          25% { transform: rotate(1deg); }
          50% { transform: rotate(-1deg); }
          75% { transform: rotate(1deg); }
          100% { transform: rotate(-1deg); }
        }
        .ios-wiggle {
          animation: iosWiggle 0.3s ease-in-out infinite;
        }
        /* Hide number input spinners */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <div className="flex flex-col gap-6">
        {/* Basic Info Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
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
            {!isEditingBasicInfo ? (
              <button
                onClick={startEditingBasicInfo}
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B6B6B',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Edit
              </button>
            ) : (
              <button
                onClick={saveBasicInfo}
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'hsl(0, 84%, 60%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                {saving ? 'Saving...' : 'Done'}
              </button>
            )}
          </div>

          {/* Fields - consistent height whether editing or not */}
          <div className="flex flex-col gap-2">
            {/* Name */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Name</span>
              {!isEditingBasicInfo ? (
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500 }}>{family.displayName}</span>
              ) : (
                <div
                  className="ai-glass-border ios-wiggle"
                  style={aiGlassLightBorderStyle('9999px')}
                >
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '2px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      textAlign: 'center',
                      height: '24px',
                      lineHeight: '20px',
                    }}
                    size={Math.max(editDisplayName.length, 5)}
                  />
                </div>
              )}
            </div>

            {/* Code */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Code</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C', fontWeight: 500, letterSpacing: '0.05em' }}>{family.name}</span>
            </div>

            {/* Min Minutes */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Min Minutes</span>
              {!isEditingBasicInfo ? (
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{family.minMinutes}</span>
              ) : (
                <div
                  className="ai-glass-border ios-wiggle"
                  style={aiGlassLightBorderStyle('9999px')}
                >
                  <input
                    type="number"
                    value={editMinMinutes}
                    onChange={(e) => setEditMinMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '2px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      textAlign: 'center',
                      width: '60px',
                      height: '24px',
                      lineHeight: '20px',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Max Minutes */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Max Minutes</span>
              {!isEditingBasicInfo ? (
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{family.maxMinutes}</span>
              ) : (
                <div
                  className="ai-glass-border ios-wiggle"
                  style={aiGlassLightBorderStyle('9999px')}
                >
                  <input
                    type="number"
                    value={editMaxMinutes}
                    onChange={(e) => setEditMaxMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '2px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      textAlign: 'center',
                      width: '60px',
                      height: '24px',
                      lineHeight: '20px',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Roles Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
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
              Roles ({family.roles.length})
            </h3>
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '12px',
                fontWeight: 500,
                color: isEditMode ? 'hsl(0, 84%, 60%)' : '#6B6B6B',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {family.roles.length > 0 ? (
              family.roles.map((role) => (
                <div
                  key={role.id}
                  className={`ai-glass-border ${isEditMode ? 'ios-wiggle' : ''}`}
                  style={{
                    ...aiGlassLightBorderStyle('9999px'),
                    cursor: isEditMode ? 'pointer' : 'default',
                  }}
                  onClick={() => isEditMode && handleRemoveRole(role.id)}
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
                    {role.displayName}
                  </div>
                </div>
              ))
            ) : (
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>
                No roles in this family
              </span>
            )}

            {/* Add Role Dropdown - shown in edit mode */}
            {isEditMode && availableRoles.length > 0 && (
              <Menu as="div" style={{ position: 'relative' }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <MenuButton
                    disabled={saving}
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '4px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'hsl(0, 84%, 60%)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                    Add
                  </MenuButton>
                </div>
                <MenuItems
                  anchor="bottom start"
                  portal={false}
                  transition
                  className="w-48 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                  style={{
                    zIndex: 100,
                    ...aiGlassLightBorderStyle('0.75rem'),
                    marginTop: 8,
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  <div
                    className="py-1"
                    style={{
                      ...aiGlassLightContentStyle('0.75rem', 0.95),
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    }}
                  >
                    {availableRoles.map((role) => (
                      <MenuItem key={role.id}>
                        <div className="px-4 py-2">
                          <button
                            onClick={() => handleAddRole(role.id)}
                            className="text-left text-sm focus:outline-none w-full"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: '#2C2C2C',
                              backgroundColor: 'transparent',
                            }}
                            onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                          >
                            {role.displayName}
                          </button>
                        </div>
                      </MenuItem>
                    ))}
                  </div>
                </MenuItems>
              </Menu>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Delete Family Button */}
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
            Delete Family
          </button>
        </div>
      </div>
    </CardContainer>
  );
}
