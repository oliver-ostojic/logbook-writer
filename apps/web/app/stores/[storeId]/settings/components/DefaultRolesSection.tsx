'use client';

import { useState, useEffect, useRef } from 'react';
import { CardContainer, GlassPillCard, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { XMarkIcon } from '@heroicons/react/20/solid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface DefaultRolesSectionProps {
  storeId: string;
  defaultRoles: any[];
  onRefresh: () => void;
  canEdit?: boolean;
}

export function DefaultRolesSection({ storeId, defaultRoles, onRefresh, canEdit = false }: DefaultRolesSectionProps) {
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch all roles for the store
    fetch(`${API_URL}/roles?storeId=${storeId}`)
      .then((r) => r.json())
      .then((roles) => setAllRoles(roles))
      .catch((err) => console.error('Failed to fetch roles:', err));
  }, [storeId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddDropdown(false);
      }
    };

    if (showAddDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddDropdown]);

  const handleAddRole = async (roleId: number) => {
    try {
      const res = await fetch(`${API_URL}/stores/${storeId}/default-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });
      if (res.ok) {
        onRefresh();
        setShowAddDropdown(false);
      }
    } catch (err) {
      console.error('Failed to add default role:', err);
    }
  };

  const handleRemoveRole = async (roleId: number) => {
    try {
      const res = await fetch(`${API_URL}/stores/${storeId}/default-roles/${roleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to remove default role:', err);
    }
  };

  const availableRoles = allRoles.filter(
    (role) => !defaultRoles.some((dr) => dr.roleId === role.id)
  );

  return (
    <CardContainer lightMode={true} borderRadius="1rem" padding="1rem" borderOpacity={0.15}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div style={{
            padding: '6px 14px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            fontWeight: 500,
            color: '#2C2C2C',
          }}>
            Default Roles
          </div>

        {/* Add Dropdown - only for CAPTAIN/ADMIN */}
        {canEdit && (
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setShowAddDropdown(!showAddDropdown)}
              disabled={availableRoles.length === 0}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                border: 'none',
                borderRadius: '9999px',
                padding: '6px 14px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 400,
                color: availableRoles.length === 0 ? '#9A999E' : '#2C2C2C',
                cursor: availableRoles.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              + Add Role
            </button>

            {showAddDropdown && availableRoles.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: '0.75rem',
                  padding: '8px',
                  zIndex: 100,
                  minWidth: '180px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
              >
                {availableRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleAddRole(role.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '8px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      color: '#2C2C2C',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = 'transparent')
                    }
                  >
                    {role.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Roles Grid */}
      {defaultRoles.length === 0 ? (
        <div
          style={{
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            color: '#6B6B6B',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          No default roles set
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {defaultRoles.map((dr) => (
            <GlassPillCard
              key={dr.id}
              padding="10px 12px"
              borderRadius="0.75rem"
              contentStyle={{ justifyContent: canEdit ? 'space-between' : 'flex-start' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: '#2C2C2C',
                }}
              >
                {dr.Role.displayName}
              </span>
              {canEdit && (
                <button
                  onClick={() => handleRemoveRole(dr.roleId)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <XMarkIcon
                    style={{
                      width: '16px',
                      height: '16px',
                      color: '#9A999E',
                    }}
                  />
                </button>
              )}
            </GlassPillCard>
          ))}
        </div>
      )}
      </div>
    </CardContainer>
  );
}
