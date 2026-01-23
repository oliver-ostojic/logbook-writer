'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardContainer, GlassPillCard, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Role {
  id: number;
  code: string;
  displayName: string;
}

interface AvailableRole extends Role {
  timingRuleId: number; // The existing TIMING RoleRule ID for this role
}

interface TimingPreference {
  id: number;
  crewRoleRuleId: number;
  roleId: number;
  roleName: string;
  valueInt: number; // -1 = Early, 0 = Middle, 1 = Late
}

interface TimingPreferenceCardProps {
  crewId: string;
  storeId: string;
  onRefresh?: () => void;
}

// Draggable role bubble component
function DraggableRoleBubble({
  id,
  roleName,
  isEditing,
  onRemove,
}: {
  id: string;
  roleName: string;
  isEditing: boolean;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: !isEditing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s ease',
      }}
      {...(isEditing ? { ...listeners, ...attributes } : {})}
      className={isEditing && !isDragging ? 'ios-wiggle' : ''}
    >
      {/* Remove button - appears in top-left corner during edit mode */}
      {isEditing && onRemove && (
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('50%', '0, 0, 0', 0.12),
            position: 'absolute',
            top: '-4px',
            left: '-4px',
            width: '16px',
            height: '16px',
            zIndex: 10,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              ...aiGlassLightContentStyle('50%', 1),
              width: '100%',
              height: '100%',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: '#6B6B6B',
              lineHeight: 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(0.96)';
              e.currentTarget.style.color = '#2C2C2C';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)';
              e.currentTarget.style.color = '#6B6B6B';
            }}
          >
            −
          </button>
        </div>
      )}
      <div
        className="ai-glass-border"
        style={{
          boxShadow: 'inset 0 0 0 1px rgba(34, 197, 94, 0.4)',
          borderRadius: '9999px',
          cursor: isEditing ? 'grab' : 'default',
        }}
      >
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.15)',
            borderRadius: '9999px',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            padding: '4px 10px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '12px',
            fontWeight: 500,
            color: 'rgb(22, 163, 74)',
          }}
        >
          {roleName}
        </div>
      </div>
    </div>
  );
}

// Drag overlay bubble (shown while dragging)
function DragOverlayBubble({ roleName }: { roleName: string }) {
  return (
    <div className="ai-glass-border" style={{ boxShadow: 'inset 0 0 0 1px rgba(34, 197, 94, 0.4)', borderRadius: '9999px' }}>
      <div
        style={{
          background: 'rgba(34, 197, 94, 0.15)',
          borderRadius: '9999px',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          padding: '4px 10px',
          fontFamily: 'var(--font-open-sans)',
          fontSize: '12px',
          fontWeight: 500,
          color: 'rgb(22, 163, 74)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        {roleName}
      </div>
    </div>
  );
}

// Droppable container component - horizontal row with title followed by role bubbles
function DroppableContainer({
  id,
  label,
  children,
  isEditing,
  isOver,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  isEditing: boolean;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });
  const hasChildren = React.Children.count(children) > 0;

  return (
    <GlassPillCard
      borderRadius="9999px"
      padding="16px"
      style={{
        width: 'fit-content',
        transition: 'filter 0.2s ease, box-shadow 0.2s ease',
        ...(isEditing && isOver && {
          filter: 'brightness(0.96)',
          boxShadow: '0 0 0 2px hsla(0, 84%, 60%, 0.3)',
        }),
      }}
      contentStyle={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: hasChildren || (isEditing && isOver) ? '10px' : '0px',
        minHeight: '36px',
      }}
    >
      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content', flexShrink: 0 }}>
        <div
          style={{
            ...aiGlassLightContentStyle('9999px', 0.6),
            padding: '6px 14px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            fontWeight: 500,
            color: '#2C2C2C',
          }}
        >
          {label}
        </div>
      </div>
      <div
        ref={setNodeRef}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          minHeight: hasChildren || (isEditing && isOver) ? '28px' : '0px',
          minWidth: !hasChildren && isEditing && isOver ? '60px' : '0px',
          transition: 'min-height 0.15s ease, min-width 0.15s ease',
        }}
      >
        {children}
      </div>
    </GlassPillCard>
  );
}

export function TimingPreferenceCard({ crewId, storeId, onRefresh }: TimingPreferenceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [timingPreferences, setTimingPreferences] = useState<TimingPreference[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );


  // Fetch timing preferences and available roles
  const fetchData = async () => {
    setLoading(true);
    try {
      // Single call with all necessary data
      const crewRes = await fetch(`${API_URL}/crew/${crewId}?include=roleRules`);
      if (!crewRes.ok) {
        console.error('Failed to fetch crew data');
        return;
      }
      const crewData = await crewRes.json();

      // Extract crew's accessible roles (from CrewRole)
      const crewRoles = crewData.roles || []; // Already includes Role data

      if (crewRoles.length === 0) {
        setTimingPreferences([]);
        setAvailableRoles([]);
        return;
      }

      // Get TIMING RoleRules from crew's roleRules (already included in crew API response)
      const timingRoleRules = (crewData.roleRules || []).filter(
        (crr: any) => crr.roleRule?.type === 'TIMING'
      );

      // Map existing preferences - use role data from roleRule.role (already included)
      const existingPreferences = timingRoleRules.map((crr: any) => {
        const roleId = crr.roleRule?.role?.id;
        const roleName = crr.roleRule?.role?.displayName || crr.roleRule?.role?.code || 'Unknown';

        return {
          id: crr.id,
          crewRoleRuleId: crr.id,
          roleId: roleId,
          roleName: roleName,
          valueInt: crr.valueInt ?? 0,
        };
      });

      setTimingPreferences(existingPreferences);

      // Now fetch ALL TIMING role rules for the store to find available roles
      // We need to fetch all TIMING rules to know which roles have timing preferences available
      const allTimingRulesRes = await fetch(`${API_URL}/role-rules?storeId=${storeId}`);
      if (!allTimingRulesRes.ok) {
        console.error('Failed to fetch role rules');
        setAvailableRoles([]);
        return;
      }
      const allRoleRules = await allTimingRulesRes.json();
      const allTimingRules = (Array.isArray(allRoleRules) ? allRoleRules : []).filter(
        (rr: any) => rr.type === 'TIMING'
      );

      // Available roles = crew roles that have TIMING rules AND aren't already assigned
      const assignedRoleIds = new Set(existingPreferences.map((p: TimingPreference) => p.roleId));
      const availableRoles = crewRoles
        .filter((cr: any) => {
          const hasTimingRule = allTimingRules.some((tr: any) => tr.roleId === cr.roleId);
          const notAssigned = !assignedRoleIds.has(cr.roleId);
          return hasTimingRule && notAssigned;
        })
        .map((cr: any) => {
          const timingRule = allTimingRules.find((tr: any) => tr.roleId === cr.roleId);
          return {
            id: cr.roleId,
            code: cr.role.code,
            displayName: cr.role.displayName,
            timingRuleId: timingRule!.id,
          };
        });

      setAvailableRoles(availableRoles);
    } catch (err) {
      console.error('Failed to fetch timing preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (crewId && storeId) {
      fetchData();
    }
  }, [crewId, storeId]);

  // Get roles in each container
  const earlyRoles = timingPreferences.filter((p) => p.valueInt === -1);
  const middleRoles = timingPreferences.filter((p) => p.valueInt === 0);
  const lateRoles = timingPreferences.filter((p) => p.valueInt === 1);

  // Get roles not yet assigned a timing preference
  const assignedRoleIds = new Set(timingPreferences.map((p) => p.roleId));
  const unassignedRoles = availableRoles.filter((r) => !assignedRoleIds.has(r.id));

  // Find the active preference being dragged
  const activePreference = activeId
    ? timingPreferences.find((p) => `pref-${p.id}` === activeId)
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: any) => {
    setOverId(event.over?.id as string || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const prefId = (active.id as string).replace('pref-', '');
    const preference = timingPreferences.find((p) => p.id === parseInt(prefId));
    if (!preference) return;

    const targetContainer = over.id as string;
    let newValueInt: number;

    switch (targetContainer) {
      case 'early':
        newValueInt = -1;
        break;
      case 'middle':
        newValueInt = 0;
        break;
      case 'late':
        newValueInt = 1;
        break;
      default:
        return;
    }

    // Skip if dropped in same container
    if (preference.valueInt === newValueInt) return;

    // Optimistic update
    setTimingPreferences((prev) =>
      prev.map((p) => (p.id === preference.id ? { ...p, valueInt: newValueInt } : p))
    );

    // Update via API - we need to update the CrewRoleRule's valueInt
    try {
      const res = await fetch(`${API_URL}/crew-role-rules/${preference.crewRoleRuleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInt: newValueInt }),
      });

      if (!res.ok) {
        // Revert on failure
        setTimingPreferences((prev) =>
          prev.map((p) => (p.id === preference.id ? { ...p, valueInt: preference.valueInt } : p))
        );
        setError('Failed to update timing preference');
        console.error('Failed to update timing preference');
      }
    } catch (err) {
      // Revert on error
      setTimingPreferences((prev) =>
        prev.map((p) => (p.id === preference.id ? { ...p, valueInt: preference.valueInt } : p))
      );
      setError('Failed to update timing preference');
      console.error('Failed to update timing preference:', err);
    }
  };

  const handleAddRole = async (roleId: number, timingRuleId: number, valueInt: number) => {
    setShowAddDropdown(false);

    try {
      // Directly create CrewRoleRule (RoleRule already exists)
      const createCrewRuleRes = await fetch(`${API_URL}/crew-role-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewId,
          roleRuleId: timingRuleId,
          valueInt,
        }),
      });

      if (!createCrewRuleRes.ok) {
        const errorData = await createCrewRuleRes.json();
        console.error('Failed to create crew timing preference:', errorData);
        setError('Failed to add timing preference');
        return;
      }

      // Refresh data
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Failed to add timing preference:', err);
      setError('Failed to add timing preference');
    }
  };

  const handleRemoveRole = async (preferenceId: number) => {
    const preference = timingPreferences.find((p) => p.id === preferenceId);
    if (!preference) return;

    // Optimistic update
    setTimingPreferences((prev) => prev.filter((p) => p.id !== preferenceId));

    try {
      const res = await fetch(`${API_URL}/crew-role-rules/${preference.crewRoleRuleId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        // Revert on failure
        await fetchData();
        setError('Failed to remove timing preference');
        console.error('Failed to remove timing preference');
      } else {
        // Refresh data to update available roles
        await fetchData();
        onRefresh?.();
      }
    } catch (err) {
      // Revert on error
      await fetchData();
      setError('Failed to remove timing preference');
      console.error('Failed to remove timing preference:', err);
    }
  };

  return (
    <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
      <div className="flex flex-col" style={{ gap: '1rem' }}>
        {/* Embedded header bar */}
        <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
          <div
            className="ai-glass-border"
            style={aiGlassLightBorderStyle('1rem 1rem 0 0', '0, 0, 0', 0.08)}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('1rem 1rem 0 0', 0.6),
                padding: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    Timing
                  </div>
                </div>

                {/* Add button (edit mode only) */}
                {isEditing && unassignedRoles.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    <GlassPillButton
                      onClick={() => setShowAddDropdown(!showAddDropdown)}
                      isSelected={false}
                      padding="6px 14px"
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#6B6B6B',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span style={{ color: 'hsl(0, 84%, 60%)', fontSize: '16px', lineHeight: 1 }}>+</span>
                        Add
                      </span>
                    </GlassPillButton>

                    {/* Dropdown for role selection */}
                    {showAddDropdown && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: '4px',
                          backgroundColor: 'white',
                          borderRadius: '12px',
                          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                          padding: '8px',
                          zIndex: 100,
                          minWidth: '160px',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#9B9B9B',
                            padding: '4px 8px',
                            marginBottom: '4px',
                          }}
                        >
                          Select role to add
                        </div>
                        {unassignedRoles.map((role) => (
                          <button
                            key={role.id}
                            onClick={() => handleAddRole(role.id, role.timingRuleId, 0)}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 12px',
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '13px',
                              color: '#2C2C2C',
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              borderRadius: '8px',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            {role.displayName || role.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <GlassPillButton
                onClick={() => {
                  setIsEditing(!isEditing);
                  setShowAddDropdown(false);
                }}
                isSelected={false}
                padding="6px 14px"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: isEditing ? '#DC2626' : '#6B6B6B',
                  }}
                >
                  {isEditing ? 'Done' : 'Edit'}
                </span>
              </GlassPillButton>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'hsla(0, 84%, 60%, 0.1)',
              border: '1px solid hsla(0, 84%, 60%, 0.3)',
              borderRadius: '8px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '12px',
              color: '#C53030',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#C53030',
                fontWeight: 600,
                fontSize: '16px',
                lineHeight: 1,
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Three glass pill cards with title bubbles inside */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <DroppableContainer id="early" label="Early" isEditing={isEditing} isOver={overId === 'early'}>
              {earlyRoles.map((pref) => (
                <DraggableRoleBubble
                  key={pref.id}
                  id={`pref-${pref.id}`}
                  roleName={pref.roleName}
                  isEditing={isEditing}
                  onRemove={() => handleRemoveRole(pref.id)}
                />
              ))}
            </DroppableContainer>

            <DroppableContainer id="middle" label="Middle" isEditing={isEditing} isOver={overId === 'middle'}>
              {middleRoles.map((pref) => (
                <DraggableRoleBubble
                  key={pref.id}
                  id={`pref-${pref.id}`}
                  roleName={pref.roleName}
                  isEditing={isEditing}
                  onRemove={() => handleRemoveRole(pref.id)}
                />
              ))}
            </DroppableContainer>

            <DroppableContainer id="late" label="Late" isEditing={isEditing} isOver={overId === 'late'}>
              {lateRoles.map((pref) => (
                <DraggableRoleBubble
                  key={pref.id}
                  id={`pref-${pref.id}`}
                  roleName={pref.roleName}
                  isEditing={isEditing}
                  onRemove={() => handleRemoveRole(pref.id)}
                />
              ))}
            </DroppableContainer>
          </div>

          {typeof window !== 'undefined' &&
            createPortal(
              <DragOverlay dropAnimation={null}>
                {activePreference ? <DragOverlayBubble roleName={activePreference.roleName} /> : null}
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>
    </CardContainer>
  );
}
