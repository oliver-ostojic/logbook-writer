import { useEffect, useState, useRef } from "react";
import { MinusIcon, PlusIcon } from '@heroicons/react/20/solid'
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass'

export type DailyAssignmentItem = {
  id: string;
  roleId: number;
  crewId: string;
  roleTitle: string;        // e.g., "Order Writer"
  crewName: string;         // e.g., "Vaughn"
  specialization?: string;  // CrewRole.specialization (e.g., "Frozen", "Dry Pro"); show in top-right when present
  subgroup?: string;        // optional legacy grouping label
};

type DailyAssignmentGridProps = {
  items: DailyAssignmentItem[];
  selectAll?: boolean;
  initialAssignments?: Record<string, number> | null;
  onAssignmentsChange?: (assignments: Array<{ id: string; roleId: number; crewId: string; requiredHours: number }>) => void;
};

export default function DailyAssignmentGrid({ items, selectAll, initialAssignments, onAssignmentsChange }: DailyAssignmentGridProps) {
  const [hours, setHours] = useState<Record<string, number>>({});
  const selectAllPrev = useRef<boolean | undefined>(undefined);

  // Hydrate selection/hours from persisted assignments
  useEffect(() => {
    if (!initialAssignments) return;
    setHours(() => {
      const next: Record<string, number> = {};
      Object.entries(initialAssignments).forEach(([id, value]) => {
          const parsed = Number(value);
          next[id] = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      });
      return next;
    });
  }, [initialAssignments]);

  // When selectAll changes, toggle all items accordingly
  useEffect(() => {
    if (selectAll === undefined) return;

    // Skip clearing on initial render when selectAll defaults to false
    if (selectAllPrev.current === undefined) {
      selectAllPrev.current = selectAll;
      if (!selectAll) return;
    }

    if (selectAll) {
      setHours(prev => {
        const next = { ...prev } as Record<string, number>;
        items.forEach(i => {
          if (!next[i.id] || next[i.id] <= 0) next[i.id] = 1;
        });
        return next;
      });
    } else if (selectAllPrev.current) {
      setHours(prev => {
        const next = { ...prev } as Record<string, number>;
        items.forEach(i => {
          next[i.id] = 0;
        });
        return next;
      });
    }

    selectAllPrev.current = selectAll;
  }, [selectAll, items]);

  const toggle = (id: string) => {
    setHours(prevHours => {
      const current = prevHours[id] ?? 0;
      if (current > 0) {
        return { ...prevHours, [id]: 0 };
      }
      return { ...prevHours, [id]: 1 };
    });
  };

  const adjustHours = (id: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling the card
    setHours(prev => {
      const current = prev[id] || 1;
      const raw = current + delta;
      const rounded = Math.round(raw * 2) / 2;
      const newValue = Math.max(0.5, rounded);
      return { ...prev, [id]: newValue };
    });
  };

  // Notify parent when selected assignments change
  useEffect(() => {
    if (!onAssignmentsChange) return;
    const assignments = items
      .map(item => {
        const requiredHours = hours[item.id] || 0;
        if (requiredHours <= 0) return undefined;
        return {
          id: item.id,
          roleId: item.roleId,
          crewId: item.crewId,
          requiredHours,
        };
      })
      .filter((entry): entry is { id: string; roleId: number; crewId: string; requiredHours: number } => Boolean(entry));

    onAssignmentsChange(assignments);
  }, [hours, items, onAssignmentsChange]);

  return (
    <fieldset>
      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const currentHours = hours[item.id] ?? 0;
          const isSelected = currentHours > 0;
          const displayHours = isSelected ? currentHours : 1;
          const formattedHours = Number.isInteger(displayHours)
            ? `${displayHours} ${displayHours === 1 ? 'hr' : 'hrs'}`
            : `${displayHours.toFixed(1)} hrs`;
          return (
            <div
              key={item.id}
              className={`${isSelected ? '' : 'ai-glass-border'} rounded-[1.5rem] cursor-pointer`}
              style={isSelected
                ? { borderRadius: '1.5rem', position: 'relative' as const, overflow: 'hidden', boxShadow: '0 0 0 1.6px hsl(var(--brand-h) var(--brand-s) var(--brand-l)), 0 4px 24px rgba(0, 0, 0, 0.06)' }
                : { ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08, '1.6px'), overflow: 'hidden' }}
            >
              <div
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => toggle(item.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle(item.id);
                  }
                }}
                className="group relative flex flex-col px-5 py-4 rounded-[1.5rem]"
                style={{
                  background: isSelected ? 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))' : 'white',
                }}
              >
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`block text-sm ${isSelected ? 'text-white font-semibold' : 'text-gray-900 font-medium'}`}
                    style={{ fontFamily: 'var(--font-brand)' }}
                  >
                    {item.roleTitle}
                  </span>
                  {(item.specialization || item.subgroup) && (
                    <span className={`text-xs font-sans ml-2 ${isSelected ? 'text-white font-normal' : 'text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]'}`}>
                      {item.specialization ?? item.subgroup}
                    </span>
                  )}
                </div>
                <p className={`mt-0.5 text-xs font-sans ${isSelected ? 'text-white font-medium' : 'text-gray-600'}`}>{item.crewName}</p>
              </div>
              
              {/* Reserve space for controls so card height is consistent */}
              <div className="mt-2 h-8 flex items-center justify-between">
                {isSelected ? (
                  <>
                    <button
                      onClick={(e) => adjustHours(item.id, -0.5, e)}
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      aria-label="Decrease hours"
                    >
                      <MinusIcon className="w-4 h-4 text-white" />
                    </button>
                    <span className="text-white font-normal text-sm font-sans">
                      {formattedHours}
                    </span>
                    <button
                      onClick={(e) => adjustHours(item.id, 0.5, e)}
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      aria-label="Increase hours"
                    >
                      <PlusIcon className="w-4 h-4 text-white" />
                    </button>
                  </>
                ) : (
                  // Empty placeholders to keep spacing identical when not selected
                  <>
                    <span className="inline-block w-6" />
                    <span className="inline-block w-12" />
                    <span className="inline-block w-6" />
                  </>
                )}
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
