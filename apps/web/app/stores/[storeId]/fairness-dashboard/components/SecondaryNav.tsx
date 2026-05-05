'use client';

import { ChartBarIcon, UserGroupIcon, ShieldCheckIcon } from '@heroicons/react/20/solid';
import { CardContainer } from '@/components/ui/ai-glass';
import { NavStatsCard } from '../../home/components';

interface SecondaryNavProps {
  activeView: string;
  crewCount: number;
  roleCount: number;
  hasSelection: boolean;
  selectionLabel: string;
  isOverviewActive: boolean;
  isCrewActive: boolean;
  isRolesActive: boolean;
  onSelectOverview: () => void;
  onSelectCrew: () => void;
  onSelectRoles: () => void;
}

export function SecondaryNav({
  crewCount,
  roleCount,
  hasSelection,
  selectionLabel,
  isOverviewActive,
  isCrewActive,
  isRolesActive,
  onSelectOverview,
  onSelectCrew,
  onSelectRoles,
}: SecondaryNavProps) {
  const columns = hasSelection ? 4 : 3;

  return (
    <div data-tutorial-id="dashboard-secondary-nav" className="sticky top-7 z-40" style={{ marginTop: '24px' }}>
      <CardContainer lightMode borderRadius="1.5rem" padding="16px 8px" contentStyle={{ height: 'auto', overflowX: 'auto' }}>
          <nav
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              width: '100%',
              transition: 'grid-template-columns 200ms ease-out',
            }}
          >
            <NavStatsCard
              icon={<ChartBarIcon />}
              label="Overview"
              subtext="Dashboard"
              isActive={isOverviewActive}
              onClick={onSelectOverview}
              isFirst
            />
            <NavStatsCard
              icon={<UserGroupIcon />}
              label="Crew"
              count={crewCount}
              tutorialId="dashboard-nav-crew"
              isActive={isCrewActive}
              onClick={onSelectCrew}
            />
            <NavStatsCard
              icon={<ShieldCheckIcon />}
              label="Roles"
              count={roleCount}
              tutorialId="dashboard-nav-roles"
              isActive={isRolesActive}
              onClick={onSelectRoles}
              isLast={!hasSelection}
            />
            {hasSelection && (
              <div
                className="animate-in fade-in slide-in-from-right-4 duration-200"
                style={{ animationFillMode: 'both' }}
              >
                <NavStatsCard
                  label={selectionLabel}
                  subtext="Statistics"
                  isActive={true}
                  onClick={() => {}}
                  isLast
                  activeColor="#dc2626"
                />
              </div>
            )}
          </nav>
      </CardContainer>
    </div>
  );
}
