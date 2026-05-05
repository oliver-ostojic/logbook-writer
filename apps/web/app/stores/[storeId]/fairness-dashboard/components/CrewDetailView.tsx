'use client';

import React from 'react';
import { CardContainer, CardSmall, GlassPillCard } from '@/components/ui/ai-glass';
import { StatGraphCard } from './StatGraphCard';
import { LargeGraphCard } from './LargeGraphCard';
import { SatisfactionLineGraph } from './SatisfactionLineGraph';
import { BoxPlotGraph } from './BoxPlotGraph';
import { StackedPillBarGraph } from './StackedPillBarGraph';
import { TimeWindowHeader } from './TimeWindowHeader';
import type { CrewCardData } from './CrewQuickLookCard';

interface CrewDetailViewProps {
  crew: CrewCardData;
  availableDates: string[];
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  crewLineGraphLabel: string | null;
  setCrewLineGraphActiveData: (data: { shiftDate?: string } | null) => void;
  setCrewLineGraphLabel: (label: string | null) => void;
  crewLineGraphSelectedIndex: number | undefined;
  setCrewLineGraphSelectedIndex: (index: number | undefined) => void;
  crewBoxPlotLabel: string | null;
  setCrewBoxPlotLabel: (label: string | null) => void;
  crewPreferencesLabel: string | null;
  setCrewPreferencesLabel: (label: string | null) => void;
  roleRules: Array<{ type: string; description?: string }>;
  formatRuleTypeLabel: (ruleType: string) => string;
}

export function CrewDetailView({
  crew,
  availableDates,
  selectedDates,
  onSelectionChange,
  crewLineGraphLabel,
  setCrewLineGraphActiveData,
  setCrewLineGraphLabel,
  crewLineGraphSelectedIndex,
  setCrewLineGraphSelectedIndex,
  crewBoxPlotLabel,
  setCrewBoxPlotLabel,
  crewPreferencesLabel,
  setCrewPreferencesLabel,
  roleRules,
  formatRuleTypeLabel,
}: CrewDetailViewProps) {
  const lineGraphData = React.useMemo(() => {
    const satByDate = crew.satisfactionByDate || [];
    if (satByDate.length === 0) {
      return [{ shiftNumber: 1, shiftDate: '—', satisfaction: 70 }];
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return satByDate.map((d, index) => {
      const [year, month, day] = d.date.split('-').map(Number);
      return {
        shiftNumber: index + 1,
        shiftDate: `${day} ${monthNames[month - 1]}, ${String(year).slice(-2)}`,
        satisfaction: Math.round(d.satisfactionPct * 100) / 100,
      };
    });
  }, [crew.satisfactionByDate]);

  return (
    <CardContainer lightMode borderRadius="1.5rem" padding="0">
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
          {/* 2 Mini cards in a row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Time per shift bar chart - uses avgMinutesPerRole (matches overview format) */}
            {(() => {
              const roleData = crew.avgMinutesPerRole || [];
              const avgMinutes = roleData.length > 0
                ? Math.round(roleData.reduce((sum, r) => sum + r.avgMinutes, 0) / roleData.length)
                : 0;

              return (
                <StatGraphCard
                  data={{
                    type: 'bar',
                    title: 'Avg shift time',
                    value: avgMinutes,
                    unit: 'min',
                    status: 'Roles',
                    barData: roleData.map(r => ({
                      role: r.roleName,
                      hours: Math.round(r.avgMinutes),
                    })),
                    barUnit: 'min',
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
                      </svg>
                    ),
                  }}
                />
              );
            })()}
            {/* Preferences met pie chart - uses satisfactionScore */}
            <StatGraphCard
              data={{
                type: 'pie',
                title: 'Preferences met',
                value: crew.satisfactionScore ?? 67.5,
                unit: '%',
                status: `${crew.preferencesMetCount ?? 0}/${crew.preferencesTotal ?? 0}`,
                pieData: {
                  met: crew.satisfactionScore ?? 67.5,
                  notMet: 100 - (crew.satisfactionScore ?? 67.5)
                },
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
                    <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
                  </svg>
                ),
              }}
            />
          </div>
        </CardSmall>

        {/* Crew preferences met by date line graph */}
        <LargeGraphCard
          title="Preferences met"
          highlightLabel={crewLineGraphLabel ?? undefined}
          legend={
            <GlassPillCard borderRadius="9999px" backgroundOpacity={0.5} padding="8px 12px" style={{ width: 'fit-content' }} contentStyle={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 400, color: '#2C2C2C', lineHeight: 1, whiteSpace: 'nowrap' }}>
              All crew
            </GlassPillCard>
          }
          className="mt-4"
        >
          <SatisfactionLineGraph
            onActiveDataChange={setCrewLineGraphActiveData}
            onActiveLabelChange={setCrewLineGraphLabel}
            selectedIndex={crewLineGraphSelectedIndex}
            onSelectIndex={setCrewLineGraphSelectedIndex}
            data={lineGraphData}
          />
        </LargeGraphCard>

        {/* Satisfaction distribution box plot - only show if there's variance */}
        {(() => {
          // Check if there's variance before rendering the entire section
          // Use avgSatisfactionPct (continuous) for meaningful spread, not satisfactionPct (binary met/total)
          const values = (crew.satisfactionByDate || [])
            .map(d => d.avgSatisfactionPct)
            .sort((a, b) => a - b);

          // Don't show box plot if no data or no variance
          if (values.length === 0 || values[0] === values[values.length - 1]) {
            return null;
          }

          // Compute box plot stats
          const min = values[0];
          const max = values[values.length - 1];

          const median = values.length % 2 === 0
            ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
            : values[Math.floor(values.length / 2)];

          const lowerHalf = values.slice(0, Math.floor(values.length / 2));
          const q1 = lowerHalf.length > 0
            ? (lowerHalf.length % 2 === 0
              ? (lowerHalf[lowerHalf.length / 2 - 1] + lowerHalf[lowerHalf.length / 2]) / 2
              : lowerHalf[Math.floor(lowerHalf.length / 2)])
            : min;

          const upperHalf = values.slice(Math.ceil(values.length / 2));
          const q3 = upperHalf.length > 0
            ? (upperHalf.length % 2 === 0
              ? (upperHalf[upperHalf.length / 2 - 1] + upperHalf[upperHalf.length / 2]) / 2
              : upperHalf[Math.floor(upperHalf.length / 2)])
            : max;

          const iqr = q3 - q1;
          const lowerBound = q1 - 1.5 * iqr;
          const upperBound = q3 + 1.5 * iqr;
          const whiskerMin = values.find(v => v >= lowerBound) ?? min;
          const whiskerMax = [...values].reverse().find(v => v <= upperBound) ?? max;

          return (
            <LargeGraphCard
              title="Shift Satisfaction Spread"
              highlightLabel={crewBoxPlotLabel ?? undefined}
              legend={
                <GlassPillCard borderRadius="9999px" backgroundOpacity={0.5} padding="8px 12px" style={{ width: 'fit-content' }} contentStyle={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', fontWeight: 600, color: '#2C2C2C', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {crew.title}
                </GlassPillCard>
              }
              className="mt-4"
            >
              <BoxPlotGraph
                data={[{
                  label: crew.title,
                  min: Math.round(whiskerMin * 100) / 100,
                  q1: Math.round(q1 * 100) / 100,
                  median: Math.round(median * 100) / 100,
                  q3: Math.round(q3 * 100) / 100,
                  max: Math.round(whiskerMax * 100) / 100,
                }]}
                unit="%"
                onActiveLabelChange={setCrewBoxPlotLabel}
              />
            </LargeGraphCard>
          );
        })()}

        {/* Preferences met graph - individual crew level */}
        <LargeGraphCard
          title="Preferences met"
          highlightLabel={crewPreferencesLabel ?? undefined}
          highlightLabelColor="#2C2C2C"
          className="mt-4"
        >
          <StackedPillBarGraph
            preferenceData={(crew.preferenceBreakdownByRuleType || []).map(b => {
              // Find a roleRule of this type to get its description
              const rule = roleRules.find(r => r.type === b.ruleType);
              return {
                label: formatRuleTypeLabel(b.ruleType),
                description: rule?.description,
                totalCount: b.total,
                satisfiedCount: b.met,
              };
            })}
            onActiveLabelChange={setCrewPreferencesLabel}
          />
        </LargeGraphCard>
      </div>{/* End dashboard content */}
    </CardContainer>
  );
}

export default CrewDetailView;
