'use client';

import React, { useEffect, useState, useRef } from 'react';
import { CrewCardData, RoleCardData, CrewDetailView, RoleDetailView, SecondaryNav, OverviewView, CrewListView, RoleListView } from '../fairness-dashboard/components';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, aiGlassAnimations } from '@/components/ui/ai-glass';
import { TopNavHeader } from '../home/components';
import { useTutorialStore } from '@/lib/tutorialStore';
import { useAvailableDates } from '@/lib/hooks/useAvailableDates';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { useStorePersistedState } from '@/lib/hooks/useStorePersistedState';
import type { ExpandedPanel } from '../fairness-dashboard/types';
import { useDashboardComputed } from '../fairness-dashboard/useDashboardComputed';
import { formatMinutesToReadable, formatRuleTypeLabel } from '../fairness-dashboard/utils';

const EMPTY_DATES: string[] = [];
const EMPTY_ROLE_RULES: any[] = [];

type Tab = 'home' | 'dashboard' | 'settings';

interface FairnessContentProps {
  storeId: string;
  onNavChange: (tab: Tab) => void;
}

export function FairnessContent({ storeId, onNavChange }: FairnessContentProps) {
  const [activeDashboard, , hydrated] = useStorePersistedState<string>(storeId, 'activeDashboard', 'Overview');
  const [activeView, setActiveView] = useState<string>('overview');
  const [, setExpandedPanel] = useState<ExpandedPanel>('none');
  const [selectedCrew, setSelectedCrew] = useState<CrewCardData | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleCardData | null>(null);
  const [crewPanelCard, setCrewPanelCard] = useState<CrewCardData | null>(null);
  const [rolePanelCard, setRolePanelCard] = useState<RoleCardData | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useStorePersistedState<string | null>(storeId, 'selectedCrewId', null);
  const [, setCrewLineGraphActiveData] = useState<{shiftDate?: string} | null>(null);
  const [, setOverviewLineGraphActiveData] = useState<{shiftDate?: string} | null>(null);
  const [crewLineGraphSelectedIndex, setCrewLineGraphSelectedIndex] = useState<number | undefined>(undefined);
  const [overviewLineGraphSelectedIndex, setOverviewLineGraphSelectedIndex] = useState<number | undefined>(undefined);
  const [crewLineGraphLabel, setCrewLineGraphLabel] = useState<string | null>(null);
  const [crewBoxPlotLabel, setCrewBoxPlotLabel] = useState<string | null>(null);
  const [roleBoxPlotLabel, setRoleBoxPlotLabel] = useState<string | null>(null);
  const [overviewLineGraphLabel, setOverviewLineGraphLabel] = useState<string | null>(null);
  const [overviewBoxPlotLabel, setOverviewBoxPlotLabel] = useState<string | null>(null);
  const [crewPreferencesLabel, setCrewPreferencesLabel] = useState<string | null>(null);
  const [overviewPreferencesLabel, setOverviewPreferencesLabel] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useStorePersistedState<string | null>(storeId, 'selectedRoleId', null);
  const [crewPage, setCrewPage] = useStorePersistedState<number>(storeId, 'crewPage', 1);
  const [rolePage, setRolePage] = useStorePersistedState<number>(storeId, 'rolePage', 1);
  const [crewSearchQuery, setCrewSearchQuery] = useState('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

  const { data: availableDatesData } = useAvailableDates(storeId);
  const availableDates = availableDatesData ?? EMPTY_DATES;

  const [timeSelectedDates, setTimeSelectedDates] = useState<string[]>([]);

  const datesToFetch = React.useMemo(
    () => (timeSelectedDates.length > 0 ? timeSelectedDates : availableDates),
    [timeSelectedDates, availableDates]
  );

  const { data: dashboardQueryData } = useDashboardData(storeId, datesToFetch);

  const dashboardSnapshot = dashboardQueryData?.snapshot ?? null;
  const roleRules = dashboardQueryData?.roleRules ?? EMPTY_ROLE_RULES;

  const {
    computedDashboardData,
    computedCrewCards,
    computedRoleCards,
    computedSatisfactionByDate,
    computedSatisfactionBoxPlot,
    computedPreferenceData,
    computedRoleBoxPlot,
    computedRoleHeatmap,
    computedCrewFairnessTable,
    rolePanelSparkline,
  } = useDashboardComputed({
    dashboardSnapshot,
    selectedRole,
    rolePanelCard,
    roleRules,
  });

  const currentDashboard = computedDashboardData.expandedDashboards[activeDashboard];

  const switchView = (view: 'overview' | 'crew' | 'roles') => {
    setActiveView(view);
    setSelectedCrew(null);
    setSelectedRole(null);
    setSelectedCrewId(null);
    setSelectedRoleId(null);
    setCrewPanelCard(null);
    setRolePanelCard(null);
  };

  useEffect(() => {
    if (!hydrated) return;
    setSelectedCrewId(selectedCrew ? selectedCrew.id : null);
  }, [selectedCrew, hydrated, setSelectedCrewId]);

  useEffect(() => {
    if (!hydrated) return;
    setSelectedRoleId(selectedRole ? selectedRole.id : null);
  }, [selectedRole, hydrated, setSelectedRoleId]);

  useEffect(() => {
    if (!dashboardSnapshot || !selectedCrewId || selectedCrew) return;
    const crew = computedCrewCards.find(c => c.id === selectedCrewId);
    if (crew) {
      setSelectedCrew(crew);
      setExpandedPanel('crew');
    }
  }, [dashboardSnapshot, selectedCrewId, selectedCrew, computedCrewCards]);

  useEffect(() => {
    if (!dashboardSnapshot || !selectedRoleId || selectedRole) return;
    const role = computedRoleCards.find(r => r.id === selectedRoleId);
    if (role) {
      setSelectedRole(role);
      setExpandedPanel('roles');
    }
  }, [dashboardSnapshot, selectedRoleId, selectedRole, computedRoleCards]);

  useEffect(() => {
    if (!selectedCrew || !dashboardSnapshot) return;
    const updatedCrew = computedCrewCards.find(c => c.id === selectedCrew.id);
    if (updatedCrew && updatedCrew !== selectedCrew) setSelectedCrew(updatedCrew);
  }, [computedCrewCards, dashboardSnapshot, selectedCrew]);

  useEffect(() => {
    if (!selectedRole || !dashboardSnapshot) return;
    const updatedRole = computedRoleCards.find(r => r.id === selectedRole.id);
    if (updatedRole && updatedRole !== selectedRole) setSelectedRole(updatedRole);
  }, [computedRoleCards, dashboardSnapshot, selectedRole]);

  useEffect(() => {
    if (!crewPanelCard || !dashboardSnapshot) return;
    const updatedCrew = computedCrewCards.find(c => c.id === crewPanelCard.id);
    if (updatedCrew && updatedCrew !== crewPanelCard) setCrewPanelCard(updatedCrew);
  }, [computedCrewCards, dashboardSnapshot, crewPanelCard]);

  useEffect(() => {
    if (!rolePanelCard || !dashboardSnapshot) return;
    const updatedRole = computedRoleCards.find(r => r.id === rolePanelCard.id);
    if (updatedRole && updatedRole !== rolePanelCard) setRolePanelCard(updatedRole);
  }, [computedRoleCards, dashboardSnapshot, rolePanelCard]);

  const { isActive: tutorialIsActive, viewHint } = useTutorialStore();
  useEffect(() => {
    if (!viewHint || !tutorialIsActive) return;
    if (viewHint === 'dashboard-overview') {
      setActiveView('overview');
      setCrewPanelCard(null);
      setRolePanelCard(null);
    } else if (viewHint === 'dashboard-crew') {
      setActiveView('crew');
      setCrewPanelCard(null);
      setRolePanelCard(null);
    } else if (viewHint === 'dashboard-roles') {
      setActiveView('roles');
      setCrewPanelCard(null);
      setRolePanelCard(null);
    } else if (viewHint.startsWith('dashboard-role:')) {
      const roleName = viewHint.replace('dashboard-role:', '').toLowerCase();
      setActiveView('roles');
      const match = computedRoleCards.find(r => r.name?.toLowerCase().includes(roleName));
      if (match) setRolePanelCard(match);
    }
  }, [viewHint, tutorialIsActive, computedRoleCards]);

  const hasSetTutorialDates = useRef(false);
  useEffect(() => {
    if (!tutorialIsActive || hasSetTutorialDates.current) return;
    if (availableDates.length === 0) return;
    const dates2025 = availableDates.filter(d => d.startsWith('2025'));
    if (dates2025.length > 0) {
      setTimeSelectedDates(dates2025);
      hasSetTutorialDates.current = true;
    }
  }, [availableDates, tutorialIsActive]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <div style={{ isolation: 'isolate' }}>
        <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
          <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9 flex flex-col gap-6">
          <style>{`
            @media (min-width: 1200px) {
              .dashboard-outer-panel { flex: 0 0 80%; max-width: 80%; }
            }
          `}</style>

          <div className="flex flex-col min-[1200px]:flex-row min-[1200px]:justify-center">
            <div className="ai-glass-border w-full dashboard-outer-panel" style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}>
              <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), height: 'auto', padding: '24px' }}>
                <TopNavHeader storeId={storeId} activeNav="dashboard" onNavChange={onNavChange} />

                <SecondaryNav
                  activeView={activeView}
                  crewCount={computedCrewCards.length}
                  roleCount={computedRoleCards.length}
                  hasSelection={!!(selectedCrew || selectedRole || crewPanelCard || rolePanelCard)}
                  selectionLabel={selectedCrew?.title || crewPanelCard?.title || selectedRole?.name || rolePanelCard?.name || ''}
                  isOverviewActive={activeView === 'overview' && !selectedCrew && !selectedRole}
                  isCrewActive={activeView === 'crew' && !selectedCrew && !crewPanelCard}
                  isRolesActive={activeView === 'roles' && !selectedRole && !rolePanelCard}
                  onSelectOverview={() => switchView('overview')}
                  onSelectCrew={() => { switchView('crew'); setCrewPage(1); }}
                  onSelectRoles={() => { switchView('roles'); setRolePage(1); }}
                />

                <div style={{ marginTop: '24px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
              {selectedCrew ? (
                <CrewDetailView
                  crew={selectedCrew}
                  availableDates={availableDates}
                  selectedDates={timeSelectedDates}
                  onSelectionChange={setTimeSelectedDates}
                  crewLineGraphLabel={crewLineGraphLabel}
                  setCrewLineGraphActiveData={setCrewLineGraphActiveData}
                  setCrewLineGraphLabel={setCrewLineGraphLabel}
                  crewLineGraphSelectedIndex={crewLineGraphSelectedIndex}
                  setCrewLineGraphSelectedIndex={setCrewLineGraphSelectedIndex}
                  crewBoxPlotLabel={crewBoxPlotLabel}
                  setCrewBoxPlotLabel={setCrewBoxPlotLabel}
                  crewPreferencesLabel={crewPreferencesLabel}
                  setCrewPreferencesLabel={setCrewPreferencesLabel}
                  roleRules={roleRules}
                  formatRuleTypeLabel={formatRuleTypeLabel}
                />
              ) : selectedRole ? (
                <RoleDetailView
                  role={selectedRole}
                  availableDates={availableDates}
                  selectedDates={timeSelectedDates}
                  onSelectionChange={setTimeSelectedDates}
                  roleBoxPlotLabel={roleBoxPlotLabel}
                  setRoleBoxPlotLabel={setRoleBoxPlotLabel}
                  computedRoleBoxPlot={computedRoleBoxPlot}
                  computedRoleHeatmap={computedRoleHeatmap}
                  computedCrewFairnessTable={computedCrewFairnessTable}
                  formatMinutesToReadable={formatMinutesToReadable}
                  sparklineData={dashboardSnapshot?.selection.logbooks.map(lb => {
                    const roleStats = lb.roleStats.find((r: any) => r.roleId === selectedRole.id);
                    if (!roleStats || roleStats.giniCoefficient === null) return 0;
                    return Math.round((1 - roleStats.giniCoefficient) * 10000) / 100;
                  }) || [0]}
                />
              ) : activeView === 'crew' ? (
                <CrewListView
                  crewCards={computedCrewCards}
                  searchQuery={crewSearchQuery}
                  setSearchQuery={setCrewSearchQuery}
                  page={crewPage}
                  setPage={setCrewPage}
                  panelCard={crewPanelCard}
                  setPanelCard={setCrewPanelCard}
                  availableDates={availableDates}
                  selectedDates={timeSelectedDates}
                  onSelectionChange={setTimeSelectedDates}
                  crewLineGraphLabel={crewLineGraphLabel}
                  setCrewLineGraphActiveData={setCrewLineGraphActiveData}
                  setCrewLineGraphLabel={setCrewLineGraphLabel}
                  crewLineGraphSelectedIndex={crewLineGraphSelectedIndex}
                  setCrewLineGraphSelectedIndex={setCrewLineGraphSelectedIndex}
                  crewBoxPlotLabel={crewBoxPlotLabel}
                  setCrewBoxPlotLabel={setCrewBoxPlotLabel}
                  crewPreferencesLabel={crewPreferencesLabel}
                  setCrewPreferencesLabel={setCrewPreferencesLabel}
                  roleRules={roleRules}
                  formatRuleTypeLabel={formatRuleTypeLabel}
                />
              ) : activeView === 'roles' ? (
                <RoleListView
                  roleCards={computedRoleCards}
                  searchQuery={roleSearchQuery}
                  setSearchQuery={setRoleSearchQuery}
                  page={rolePage}
                  setPage={setRolePage}
                  panelCard={rolePanelCard}
                  setPanelCard={setRolePanelCard}
                  availableDates={availableDates}
                  selectedDates={timeSelectedDates}
                  onSelectionChange={setTimeSelectedDates}
                  roleBoxPlotLabel={roleBoxPlotLabel}
                  setRoleBoxPlotLabel={setRoleBoxPlotLabel}
                  computedRoleBoxPlot={computedRoleBoxPlot}
                  computedRoleHeatmap={computedRoleHeatmap}
                  computedCrewFairnessTable={computedCrewFairnessTable}
                  formatMinutesToReadable={formatMinutesToReadable}
                  sparklineData={rolePanelSparkline}
                />
              ) : (
                <OverviewView
                  availableDates={availableDates}
                  selectedDates={timeSelectedDates}
                  onSelectionChange={setTimeSelectedDates}
                  miniCards={currentDashboard.miniCards}
                  satisfactionByDate={computedSatisfactionByDate}
                  satisfactionBoxPlot={computedSatisfactionBoxPlot}
                  preferenceData={computedPreferenceData}
                  lineGraphLabel={overviewLineGraphLabel}
                  boxPlotLabel={overviewBoxPlotLabel}
                  preferencesLabel={overviewPreferencesLabel}
                  lineGraphSelectedIndex={overviewLineGraphSelectedIndex}
                  setLineGraphActiveData={setOverviewLineGraphActiveData}
                  setLineGraphLabel={setOverviewLineGraphLabel}
                  setLineGraphSelectedIndex={setOverviewLineGraphSelectedIndex}
                  setBoxPlotLabel={setOverviewBoxPlotLabel}
                  setPreferencesLabel={setOverviewPreferencesLabel}
                />
              )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      </div>
    </>
  );
}
