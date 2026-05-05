import type { DashboardPanel, SidePanel } from '@logbook-writer/shared-types';
import type React from 'react';

export interface LogbookSummary {
  id: string;
  date: string;
  status: string;
  metadata: {
    solver?: {
      status: string;
      runtimeMs: number;
      objectiveScore: number;
      numCrew: number;
      numAssignments: number;
    };
    schedule?: {
      totalAssignments: number;
      crewScheduled: number;
      totalHours: number;
    };
    preferences?: {
      total: number;
      met: number;
      averageSatisfaction: number;
    };
  } | null;
  preferenceMetadata: {
    eligiblePreferences: number;
    preferencesMet: number;
    percentMet: number;
    avgSatisfaction: number;
    fairnessIndex: number;
    fairnessGrade: string;
  } | null;
}

export interface DashboardApiResponse {
  panel: DashboardPanel;
  sidePanel: SidePanel;
  logbooks: LogbookSummary[];
}

export type ExpandedPanel = 'none' | 'date' | 'roles' | 'crew';

export interface SparklineCardData {
  type: 'sparkline';
  title: string;
  value: number;
  unit: string;
  status: string;
  sparklineData: number[];
  icon?: React.ReactNode;
}

export interface PieCardData {
  type: 'pie';
  title: string;
  value: number;
  unit: string;
  status: string;
  pieData: { met: number; notMet: number };
  icon?: React.ReactNode;
}

export interface BarCardData {
  type: 'bar';
  title: string;
  value: number;
  unit: string;
  status: string;
  barData: { role: string; hours: number }[];
  icon?: React.ReactNode;
}

export interface StatusBarCardData {
  type: 'statusBar';
  title: string;
  status: string;
  barData: { role: string; value: number; status: string }[];
  icon?: React.ReactNode;
}

export type MiniCardData = SparklineCardData | PieCardData | BarCardData | StatusBarCardData;

export interface ExpandedDashboard {
  name: string;
  miniCards: MiniCardData[];
}

export interface DashboardData {
  expandedDashboards: {
    [key: string]: ExpandedDashboard;
  };
}
