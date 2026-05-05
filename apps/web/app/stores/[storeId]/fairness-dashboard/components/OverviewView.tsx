'use client';

import { aiGlassLightBorderStyle, aiGlassLightContentStyle, CardSmall } from '@/components/ui/ai-glass';
import { TimeWindowHeader } from './TimeWindowHeader';
import { LargeGraphCard } from './LargeGraphCard';
import { SatisfactionLineGraph } from './SatisfactionLineGraph';
import { BoxPlotGraph } from './BoxPlotGraph';
import { StackedPillBarGraph } from './StackedPillBarGraph';
import { StatGraphCard } from './StatGraphCard';

interface SatisfactionPoint {
  shiftNumber: number;
  shiftDate: string;
  satisfaction: number;
}

interface BoxPlotStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

interface OverviewViewProps {
  availableDates: string[];
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  miniCards: any[];
  satisfactionByDate: SatisfactionPoint[];
  satisfactionBoxPlot: BoxPlotStats;
  preferenceData: any;
  lineGraphLabel: string | null;
  boxPlotLabel: string | null;
  preferencesLabel: string | null;
  lineGraphSelectedIndex: number | undefined;
  setLineGraphActiveData: (data: { shiftDate?: string } | null) => void;
  setLineGraphLabel: (label: string | null) => void;
  setLineGraphSelectedIndex: (index: number | undefined) => void;
  setBoxPlotLabel: (label: string | null) => void;
  setPreferencesLabel: (label: string | null) => void;
}

export function OverviewView({
  availableDates,
  selectedDates,
  onSelectionChange,
  miniCards,
  satisfactionByDate,
  satisfactionBoxPlot,
  preferenceData,
  lineGraphLabel,
  boxPlotLabel,
  preferencesLabel,
  lineGraphSelectedIndex,
  setLineGraphActiveData,
  setLineGraphLabel,
  setLineGraphSelectedIndex,
  setBoxPlotLabel,
  setPreferencesLabel,
}: OverviewViewProps) {
  return (
    <div
      className="ai-glass-border"
      style={{
        ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08),
        background: `rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.6) * 1.0000))`,
      }}
    >
      <TimeWindowHeader
        availableDates={availableDates}
        selectedDates={selectedDates}
        onSelectionChange={onSelectionChange}
        borderRadius="1.5rem 1.5rem 0 0"
      />

      <div style={{ padding: '16px' }}>
        <CardSmall lightMode={true} borderRadius="1.5rem" contentStyle={{ padding: '16px' }}>
          <div className="grid grid-cols-2 gap-4">
            <div data-tutorial-id="dashboard-mini-fairness-index"><StatGraphCard key={0} data={miniCards[0]} /></div>
            <div data-tutorial-id="dashboard-mini-fairness-status"><StatGraphCard key={2} data={miniCards[2]} /></div>
            <div data-tutorial-id="dashboard-mini-preferences"><StatGraphCard key={3} data={miniCards[3]} /></div>
            <div data-tutorial-id="dashboard-mini-time"><StatGraphCard key={1} data={miniCards[1]} /></div>
          </div>
        </CardSmall>

        <div data-tutorial-id="overview-graph-line">
          <LargeGraphCard
            title="Preferences met"
            highlightLabel={lineGraphLabel ?? undefined}
            legend={
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.5),
                    padding: '8px 12px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 400,
                    color: '#2C2C2C',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  All crew
                </div>
              </div>
            }
            className="mt-4"
          >
            <SatisfactionLineGraph
              onActiveDataChange={setLineGraphActiveData}
              onActiveLabelChange={setLineGraphLabel}
              selectedIndex={lineGraphSelectedIndex}
              onSelectIndex={setLineGraphSelectedIndex}
              data={satisfactionByDate}
            />
          </LargeGraphCard>
        </div>

        <div data-tutorial-id="overview-graph-boxplot">
          <LargeGraphCard
            title="Crew Preference Distribution"
            highlightLabel={boxPlotLabel ?? undefined}
            legend={
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: '8px 12px', fontFamily: 'var(--font-open-sans)', fontSize: '12px', fontWeight: 600, color: '#2C2C2C', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  All crew
                </div>
              </div>
            }
            className="mt-4"
          >
            <BoxPlotGraph
              data={[{
                label: 'All Crew',
                min: satisfactionBoxPlot.min,
                q1: satisfactionBoxPlot.q1,
                median: satisfactionBoxPlot.median,
                q3: satisfactionBoxPlot.q3,
                max: satisfactionBoxPlot.max,
              }]}
              unit="%"
              onActiveLabelChange={setBoxPlotLabel}
            />
          </LargeGraphCard>
        </div>

        <div data-tutorial-id="overview-graph-stacked">
          <LargeGraphCard
            title="Crew preferences met"
            highlightLabel={preferencesLabel ?? undefined}
            highlightLabelColor="#2C2C2C"
            className="mt-4"
          >
            <StackedPillBarGraph
              preferenceData={preferenceData}
              onActiveLabelChange={setPreferencesLabel}
            />
          </LargeGraphCard>
        </div>
      </div>
    </div>
  );
}
