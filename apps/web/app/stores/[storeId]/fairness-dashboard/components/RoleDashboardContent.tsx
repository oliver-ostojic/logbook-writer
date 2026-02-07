'use client';

import React from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, CardSmall } from '@/components/ui/ai-glass';
import { StatGraphCard } from './StatGraphCard';
import { LargeGraphCard } from './LargeGraphCard';
import { BoxPlotGraph } from './BoxPlotGraph';
import { RoleHeatmap } from './RoleHeatmap';
import { CrewFairnessTable, CrewFairnessRow } from './CrewFairnessTable';
import { TimeWindowHeader } from './TimeWindowHeader';
import type { RoleCardData } from './RoleQuickLookCard';

interface RoleDashboardContentProps {
  role: RoleCardData;
  availableDates: string[];
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  roleBoxPlotLabel: string | null;
  setRoleBoxPlotLabel: (label: string | null) => void;
  computedRoleBoxPlot: {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    hasDistribution: boolean;
  };
  computedRoleHeatmap: {
    weeks: string[];
    data: { week: string; dayOfWeek: string; avgHours: number }[];
  };
  computedCrewFairnessTable: CrewFairnessRow[];
  formatMinutesToReadable: (minutes: number) => string;
  sparklineData: number[];
}

export function RoleDashboardContent({
  role,
  availableDates,
  selectedDates,
  onSelectionChange,
  roleBoxPlotLabel,
  setRoleBoxPlotLabel,
  computedRoleBoxPlot,
  computedRoleHeatmap,
  computedCrewFairnessTable,
  formatMinutesToReadable,
  sparklineData,
}: RoleDashboardContentProps) {
  return (
    <div
      className="ai-glass-border"
      style={{
        ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08),
        ...aiGlassLightContentStyle('1.5rem', 0.6),
      }}
    >
      {/* Time Window Header */}
      <TimeWindowHeader
        availableDates={availableDates}
        selectedDates={selectedDates}
        onSelectionChange={onSelectionChange}
        borderRadius="1.5rem 1.5rem 0 0"
      />

      {/* Dashboard content */}
      <div style={{ padding: '16px' }}>
        {/* Mini cards wrapper */}
        <CardSmall
          lightMode={true}
          borderRadius="1.5rem"
          contentStyle={{ padding: '16px' }}
        >
          {/* 2 Mini cards in a row - Fairness Index and Time Share */}
          <div className="grid grid-cols-2 gap-4">
            <StatGraphCard
              data={{
                type: 'sparkline',
                title: 'Fairness index',
                value: role.avgFairnessIndexPct !== null && role.avgFairnessIndexPct !== undefined
                  ? Math.round(role.avgFairnessIndexPct * 100) / 100
                  : Math.round((1 - role.giniCoefficient) * 10000) / 100,
                unit: '%',
                status: role.trend === 'improving' ? 'Good' : role.trend === 'worsening' ? 'Alert' : 'Stable',
                sparklineData: sparklineData,
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm4.5 7.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-2.25a.75.75 0 0 1 .75-.75Zm3.75-1.5a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0V12Zm2.25-3a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0V9.75A.75.75 0 0 1 13.5 9Zm3.75-1.5a.75.75 0 0 0-1.5 0v9a.75.75 0 0 0 1.5 0v-9Z" clipRule="evenodd" />
                  </svg>
                ),
              }}
            />
            <StatGraphCard
              data={{
                type: 'pie',
                title: 'Time share',
                value: Math.round((role.minutesOnRoleVsTotalWorkPct || 0) * 100) / 100,
                unit: '%',
                status: `${Math.round((role.minutesWorkedOnRoleTotal || 0) / 60 * 10) / 10} / ${Math.round((role.totalMinutesWorkedSelection || 0) / 60 * 10) / 10} hr`,
                pieData: {
                  met: role.minutesOnRoleVsTotalWorkPct || 0,
                  notMet: 100 - (role.minutesOnRoleVsTotalWorkPct || 0)
                },
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M2.25 13.5a8.25 8.25 0 0 1 8.25-8.25.75.75 0 0 1 .75.75v6.75H18a.75.75 0 0 1 .75.75 8.25 8.25 0 0 1-16.5 0Z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M12.75 3a.75.75 0 0 1 .75-.75 8.25 8.25 0 0 1 8.25 8.25.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V3Z" clipRule="evenodd" />
                  </svg>
                ),
              }}
            />
          </div>
        </CardSmall>

        {/* Crew mins distribution box plot */}
        {computedRoleBoxPlot.hasDistribution && (
          <LargeGraphCard
            title="Crew Mins/Shift Spread"
            highlightLabel={roleBoxPlotLabel ?? undefined}
            legend={
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: '8px 12px', fontFamily: 'var(--font-open-sans)', fontSize: '12px', fontWeight: 600, color: '#2C2C2C', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {role.name}
                </div>
              </div>
            }
            className="mt-4"
          >
            <BoxPlotGraph
              data={[{
                label: role.name,
                min: computedRoleBoxPlot.min,
                q1: computedRoleBoxPlot.q1,
                median: computedRoleBoxPlot.median,
                q3: computedRoleBoxPlot.q3,
                max: computedRoleBoxPlot.max,
              }]}
              unit=""
              valueFormatter={formatMinutesToReadable}
              xAxisFormatter={formatMinutesToReadable}
              onActiveLabelChange={setRoleBoxPlotLabel}
              insetXAxisLabels
            />
          </LargeGraphCard>
        )}

        {/* Role assignment heatmap */}
        <LargeGraphCard
          title={`Avg hours each crew worked on ${role.name?.toLowerCase() || 'role'}`}
          className="mt-4"
        >
          <RoleHeatmap
            weeks={computedRoleHeatmap.weeks}
            data={computedRoleHeatmap.data}
          />
        </LargeGraphCard>

        {/* Crew fairness details table */}
        <div className="mt-4">
          <CrewFairnessTable
            data={computedCrewFairnessTable}
          />
        </div>
      </div>{/* End dashboard content */}
    </div>
  );
}

export default RoleDashboardContent;
