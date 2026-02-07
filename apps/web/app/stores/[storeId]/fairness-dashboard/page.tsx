'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { MagnifyingGlassIcon, ChartBarIcon, UserGroupIcon, ShieldCheckIcon } from '@heroicons/react/20/solid';
import { StatGraphCard, GraphCardWithStatsTransparent, GraphCardSimple, SatisfactionLineGraph, RoleHeatmap, CrewFairnessTable, CrewCardData, RoleCardData, CrewQuickLookCardStatic, RoleQuickLookCardStatic, CrewQuickLookCardGlass, RoleQuickLookCardGlass, TimeWindowHeader, LargeGraphCard, PreferenceLegend, BoxPlotGraph, StackedPillBarGraph, CrewDashboardContent, RoleDashboardContent } from './components';
import type { DashboardPanel, SidePanel, TimeInterval, DashboardDate } from '@logbook-writer/shared-types';
import { buildDashboardSnapshot } from '../../../../src/dashboard/buildDashboardSnapshot';
import type { DashboardSnapshot } from '../../../../src/dashboard/types';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, aiGlassAnimations, GlassPillCard, CardSmall } from '@/components/ui/ai-glass';
import { NavStatsCard, TopNavHeader } from '../home/components';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';

// =============================================================================
// Dashboard API Response Types
// =============================================================================

interface LogbookSummary {
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

interface DashboardApiResponse {
  panel: DashboardPanel;
  sidePanel: SidePanel;
  logbooks: LogbookSummary[];
}

// =============================================================================


const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Store = { id: number; name: string };

const DASHBOARD_VIEWS = [
  { name: 'Overview', id: 'overview', hasExpand: false },
  { name: 'Roles', id: 'roles', hasExpand: true },
  { name: 'Crew', id: 'crew', hasExpand: true },
];

// Expanded panel types
type ExpandedPanel = 'none' | 'date' | 'roles' | 'crew';

// Dashboard data types
interface SparklineCardData {
  type: 'sparkline';
  title: string;
  value: number;
  unit: string;
  status: string;
  sparklineData: number[];
  icon?: React.ReactNode;
}

interface PieCardData {
  type: 'pie';
  title: string;
  value: number;
  unit: string;
  status: string;
  pieData: { met: number; notMet: number };
  icon?: React.ReactNode;
}

interface BarCardData {
  type: 'bar';
  title: string;
  value: number;
  unit: string;
  status: string;
  barData: { role: string; hours: number }[];
  icon?: React.ReactNode;
}

interface StatusBarCardData {
  type: 'statusBar';
  title: string;
  status: string;
  barData: { role: string; value: number; status: string }[];
  icon?: React.ReactNode;
}

type MiniCardData = SparklineCardData | PieCardData | BarCardData | StatusBarCardData;

interface ExpandedDashboard {
  name: string;
  miniCards: MiniCardData[];
  // Future: largeGraphs will go here
}

interface DashboardData {
  expandedDashboards: {
    [key: string]: ExpandedDashboard;
  };
}

// Placeholder data - will come from API in future
const dashboardData: DashboardData = {
  expandedDashboards: {
    'Overview': {
      name: 'Overview',
      miniCards: [
        {
          type: 'sparkline',
          title: 'Fairness index',
          value: 91.3,
          unit: '%',
          status: 'Enforced roles',
          sparklineData: [88, 90, 87, 92, 89, 93, 91.3],
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v.756a49.106 49.106 0 0 1 9.152 1 .75.75 0 0 1-.152 1.485h-1.918l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 18.75 18a6.723 6.723 0 0 1-3.181-.795.75.75 0 0 1-.375-.84l2.474-10.124H12.75v13.28c1.293.076 2.534.343 3.697.776a.75.75 0 0 1-.262 1.453h-8.37a.75.75 0 0 1-.262-1.453c1.162-.433 2.404-.7 3.697-.775V6.24H6.332l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 5.25 18a6.723 6.723 0 0 1-3.181-.795.75.75 0 0 1-.375-.84L4.168 6.241H2.25a.75.75 0 0 1-.152-1.485 49.105 49.105 0 0 1 9.152-1V3a.75.75 0 0 1 .75-.75Zm4.878 13.543 1.872-7.662 1.872 7.662h-3.744Zm-9.756 0L5.25 8.131l-1.872 7.662h3.744Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          type: 'bar',
          title: 'Time per shift',
          value: 1.3,
          unit: 'hrs',
          status: 'Roles',
          barData: [
            { role: 'Register', hours: 1.3 },
            { role: 'Floor', hours: 1.1 },
            { role: 'Stock', hours: 0.9 },
            { role: 'Drive-thru', hours: 1.2 },
            { role: 'Kitchen', hours: 0.8 },
            { role: 'Manager', hours: 1.0 },
          ],
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          type: 'statusBar',
          title: 'Fairness status',
          status: 'All roles',
          barData: [
            { role: 'Register', value: 92.1, status: 'Excellent' },
            { role: 'Floor', value: 89.5, status: 'Good' },
            { role: 'Stock', value: 95.2, status: 'Excellent' },
            { role: 'Drive-thru', value: 91.8, status: 'Excellent' },
            { role: 'Kitchen', value: 88.3, status: 'Good' },
            { role: 'Manager', value: 96.7, status: 'Excellent' },
          ],
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm2.023 6.828a.75.75 0 1 0-1.06-1.06 3.75 3.75 0 0 1-5.304 0 .75.75 0 0 0-1.06 1.06 5.25 5.25 0 0 0 7.424 0Z" clipRule="evenodd" />
            </svg>
          ),
        },
        {
          type: 'pie',
          title: 'Preferences met',
          value: 67.5,
          unit: '%',
          status: 'Crew',
          pieData: { met: 67.5, notMet: 32.5 },
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
              <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
            </svg>
          ),
        },
      ],
    },
  },
};

export default function FairnessDashboardPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const router = useRouter();
  const { user, logout: logoutStore } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  // Placeholder state for embedded header controls (visual only for now)
  const [headerPage, setHeaderPage] = useState(1);
  const [headerFilter1, setHeaderFilter1] = useState<'everyone' | 'mine'>('everyone');
  const [headerFilter2, setHeaderFilter2] = useState<'recent' | 'today' | 'oneweek' | 'onemonth'>('recent');
  const totalHeaderPages = 3;
  const HEADER_FILTER1_OPTIONS = [
    { id: 'everyone' as const, label: 'Everyone' },
    { id: 'mine' as const, label: 'Mine' },
  ];
  const HEADER_FILTER2_OPTIONS = [
    { id: 'recent' as const, label: 'Recent' },
    { id: 'today' as const, label: 'Today' },
    { id: 'oneweek' as const, label: 'One week' },
    { id: 'onemonth' as const, label: 'One month' },
  ];

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideButton = userMenuRef.current && !userMenuRef.current.contains(target);
      const isOutsideDropdown = userDropdownRef.current && !userDropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

  // Helper to get localStorage key scoped to store
  const getStorageKey = (key: string) => `fairness-dashboard-${storeId}-${key}`;

  // Helper to load from localStorage
  const loadState = <T,>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const saved = localStorage.getItem(getStorageKey(key));
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (e) {
      console.error(`Failed to load ${key}:`, e);
      return defaultValue;
    }
  };

  // Helper to save to localStorage
  const saveState = (key: string, value: any) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(getStorageKey(key), JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
    }
  };

  // Track if component is mounted (client-side) to prevent hydration mismatches
  const [mounted, setMounted] = useState(false);

  const [storeName, setStoreName] = useState<string>('');
  const [activeDashboard, setActiveDashboard] = useState<string>('Overview');
  const [activeView, setActiveView] = useState<string>('overview');
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>('none');
  const [selectedCrew, setSelectedCrew] = useState<CrewCardData | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleCardData | null>(null);
  // Split panel state - for showing dashboard in side panel without navigating away
  const [crewPanelCard, setCrewPanelCard] = useState<CrewCardData | null>(null);
  const [rolePanelCard, setRolePanelCard] = useState<RoleCardData | null>(null);
  // Hover state for list view cards
  const [hoveredCrewCardId, setHoveredCrewCardId] = useState<string | null>(null);
  const [hoveredRoleCardId, setHoveredRoleCardId] = useState<string | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [crewLineGraphActiveData, setCrewLineGraphActiveData] = useState<{shiftDate?: string} | null>(null);
  const [overviewLineGraphActiveData, setOverviewLineGraphActiveData] = useState<{shiftDate?: string} | null>(null);
  const [crewLineGraphSelectedIndex, setCrewLineGraphSelectedIndex] = useState<number | undefined>(undefined);
  const [overviewLineGraphSelectedIndex, setOverviewLineGraphSelectedIndex] = useState<number | undefined>(undefined);
  // Active labels for graph title bubbles (date or stat name)
  const [crewLineGraphLabel, setCrewLineGraphLabel] = useState<string | null>(null);
  const [crewBoxPlotLabel, setCrewBoxPlotLabel] = useState<string | null>(null);
  const [roleBoxPlotLabel, setRoleBoxPlotLabel] = useState<string | null>(null);
  const [overviewLineGraphLabel, setOverviewLineGraphLabel] = useState<string | null>(null);
  const [overviewBoxPlotLabel, setOverviewBoxPlotLabel] = useState<string | null>(null);
  const [crewPreferencesLabel, setCrewPreferencesLabel] = useState<string | null>(null);
  const [overviewPreferencesLabel, setOverviewPreferencesLabel] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [crewPage, setCrewPage] = useState(1);
  const [rolePage, setRolePage] = useState(1);
  const [crewSearchQuery, setCrewSearchQuery] = useState('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  
  // Dashboard API data state
  const [dashboardApiData, setDashboardApiData] = useState<DashboardApiResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardSnapshot, setDashboardSnapshot] = useState<DashboardSnapshot | null>(null);
  
  const [timeSelectionIndex, setTimeSelectionIndex] = useState(0);
  const [yearSelectionIndex, setYearSelectionIndex] = useState(0);
  const [selectedDays, setSelectedDays] = useState<Record<string, Set<number>>>({});
  const [selectedMonths, setSelectedMonths] = useState<Record<number, Set<number>>>({}); // yearIndex -> Set of selected month numbers (0-11)
  const [hoveredDay, setHoveredDay] = useState<{ month: number; day: number } | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<{ year: number; month: number } | null>(null);
  const [hoveredMonthCardIndex, setHoveredMonthCardIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ month: number; day: number } | null>(null);
  const [dragStartMonth, setDragStartMonth] = useState<{ year: number; month: number } | null>(null);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select'); // Whether drag is selecting or deselecting

  // Available dates from API (logbook dates)
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Selected dates for TimeWindowHeader (controlled by the header component)
  const [timeSelectedDates, setTimeSelectedDates] = useState<string[]>([]);

  const CREW_CARDS_PER_PAGE = 7;
  const ROLE_CARDS_PER_PAGE = 6;
  
  // Helper to get the starting day of week for a given month/year
  // Returns 0=Sunday, 1=Monday, ..., 6=Saturday
  const getMonthStartDay = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };
  
  // Helper to get days in a month (handles leap years)
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  // Compute available years from logbook dates
  const availableYears = React.useMemo(() => {
    if (availableDates.length === 0) {
      return [new Date().getFullYear()]; // Default to current year if no dates
    }
    const years = new Set<number>();
    availableDates.forEach(dateStr => {
      const year = new Date(dateStr).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [availableDates]);

  const yearCardCount = availableYears.length;

  // Generate month options for the selected year (includes monthIndex for selection mapping)
  const generateMonthOptions = (year: number) => {
    return [
      { value: 'Jan', label: '', days: getDaysInMonth(year, 0), startDay: getMonthStartDay(year, 0), monthIndex: 0 },
      { value: 'Feb', label: '', days: getDaysInMonth(year, 1), startDay: getMonthStartDay(year, 1), monthIndex: 1 },
      { value: 'Mar', label: '', days: getDaysInMonth(year, 2), startDay: getMonthStartDay(year, 2), monthIndex: 2 },
      { value: 'Apr', label: '', days: getDaysInMonth(year, 3), startDay: getMonthStartDay(year, 3), monthIndex: 3 },
      { value: 'May', label: '', days: getDaysInMonth(year, 4), startDay: getMonthStartDay(year, 4), monthIndex: 4 },
      { value: 'Jun', label: '', days: getDaysInMonth(year, 5), startDay: getMonthStartDay(year, 5), monthIndex: 5 },
      { value: 'Jul', label: '', days: getDaysInMonth(year, 6), startDay: getMonthStartDay(year, 6), monthIndex: 6 },
      { value: 'Aug', label: '', days: getDaysInMonth(year, 7), startDay: getMonthStartDay(year, 7), monthIndex: 7 },
      { value: 'Sep', label: '', days: getDaysInMonth(year, 8), startDay: getMonthStartDay(year, 8), monthIndex: 8 },
      { value: 'Oct', label: '', days: getDaysInMonth(year, 9), startDay: getMonthStartDay(year, 9), monthIndex: 9 },
      { value: 'Nov', label: '', days: getDaysInMonth(year, 10), startDay: getMonthStartDay(year, 10), monthIndex: 10 },
      { value: 'Dec', label: '', days: getDaysInMonth(year, 11), startDay: getMonthStartDay(year, 11), monthIndex: 11 },
    ];
  };

  const selectedYear = availableYears[yearSelectionIndex] || new Date().getFullYear();
  const allMonthOptions = generateMonthOptions(selectedYear);

  // Compute disabled days for the selected year (days without logbooks)
  // Map: monthIndex (0-11) -> Set of day numbers (1-31)
  const disabledDays = React.useMemo(() => {
    const availableDatesSet = new Set(availableDates);
    const disabled: Record<number, Set<number>> = {};

    // For each month in the selected year, mark days as disabled if not in availableDates
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const daysInMonth = getDaysInMonth(selectedYear, monthIdx);
      const disabledDaysInMonth = new Set<number>();

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (!availableDatesSet.has(dateStr)) {
          disabledDaysInMonth.add(day);
        }
      }

      disabled[monthIdx] = disabledDaysInMonth;
    }

    return disabled;
  }, [availableDates, selectedYear]);

  // Filter months to only show those with at least one available date
  const monthOptions = React.useMemo(() => {
    return allMonthOptions.filter(option => {
      const monthDisabled = disabledDays[option.monthIndex] || new Set();
      // Month has data if at least one day is NOT disabled
      for (let d = 1; d <= option.days; d++) {
        if (!monthDisabled.has(d)) {
          return true;
        }
      }
      return false;
    });
  }, [allMonthOptions, disabledDays]);

  const monthCardCount = monthOptions.length;

  // Helper to create a composite key for year-month selection
  const getSelectionKey = (year: number, monthIndex: number) => `${year}-${monthIndex}`;
  
  // Toggle day selection (single click)
  const toggleDaySelection = (monthIndex: number, day: number) => {
    const key = getSelectionKey(selectedYear, monthIndex);
    setSelectedDays(prev => {
      const monthDays = new Set(prev[key] || []);
      if (monthDays.has(day)) {
        monthDays.delete(day);
      } else {
        monthDays.add(day);
      }
      return { ...prev, [key]: monthDays };
    });
  };

  // Handle drag start
  const handleDragStart = (monthIndex: number, day: number) => {
    const key = getSelectionKey(selectedYear, monthIndex);
    const monthDays = selectedDays[key] || new Set();
    const isCurrentlySelected = monthDays.has(day);
    setIsDragging(true);
    setDragStart({ month: monthIndex, day });
    setDragMode(isCurrentlySelected ? 'deselect' : 'select');
    // Immediately toggle the starting day
    toggleDaySelection(monthIndex, day);
  };
  
  // Handle drag over a day
  const handleDragOver = (monthIndex: number, day: number) => {
    if (!isDragging || !dragStart) return;
    // Only allow drag within same month
    if (monthIndex !== dragStart.month) return;

    const key = getSelectionKey(selectedYear, monthIndex);
    setSelectedDays(prev => {
      const monthDays = new Set(prev[key] || []);
      if (dragMode === 'select') {
        monthDays.add(day);
      } else {
        monthDays.delete(day);
      }
      return { ...prev, [key]: monthDays };
    });
  };
  
  // Toggle month selection for yearly view
  const toggleMonthSelection = (yearIndex: number, month: number) => {
    setSelectedMonths(prev => {
      const yearMonths = new Set(prev[yearIndex] || []);
      if (yearMonths.has(month)) {
        yearMonths.delete(month);
      } else {
        yearMonths.add(month);
      }
      return { ...prev, [yearIndex]: yearMonths };
    });
  };
  
  // Handle drag start for yearly view
  const handleMonthDragStart = (yearIndex: number, month: number) => {
    const yearMonths = selectedMonths[yearIndex] || new Set();
    const isCurrentlySelected = yearMonths.has(month);
    setIsDragging(true);
    setDragStartMonth({ year: yearIndex, month });
    setDragMode(isCurrentlySelected ? 'deselect' : 'select');
    toggleMonthSelection(yearIndex, month);
  };
  
  // Handle drag over a month for yearly view
  const handleMonthDragOver = (yearIndex: number, month: number) => {
    if (!isDragging || !dragStartMonth) return;
    if (yearIndex !== dragStartMonth.year) return;
    
    setSelectedMonths(prev => {
      const yearMonths = new Set(prev[yearIndex] || []);
      if (dragMode === 'select') {
        yearMonths.add(month);
      } else {
        yearMonths.delete(month);
      }
      return { ...prev, [yearIndex]: yearMonths };
    });
  };
  
  // Track if we just finished dragging (to prevent card click after drag)
  const justFinishedDraggingRef = useRef(false);
  
  // Handle drag end
  const handleDragEnd = () => {
    if (isDragging) {
      justFinishedDraggingRef.current = true;
      // Reset the flag after a short delay (after click event would have fired)
      setTimeout(() => {
        justFinishedDraggingRef.current = false;
      }, 50);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragStartMonth(null);
  };
  
  // Global mouse up listener for drag end
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);
  
  // Reset selection index if it exceeds card count
  useEffect(() => {
    if (timeSelectionIndex >= monthCardCount) {
      setTimeSelectionIndex(0);
    }
  }, [monthCardCount, timeSelectionIndex]);
  
  // Time deck ref and dimensions
  const timeDeckRef = useRef<HTMLDivElement>(null);
  const [timeDeckWidth, setTimeDeckWidth] = useState(0);
  
  useEffect(() => {
    const updateWidth = () => {
      if (timeDeckRef.current) {
        setTimeDeckWidth(timeDeckRef.current.offsetWidth);
      }
    };
    // Small delay to allow dropdown to render before measuring
    const timeoutId = setTimeout(updateWidth, 10);
    window.addEventListener('resize', updateWidth);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateWidth);
    };
  }, [expandedPanel]);
  
  // Carousel navigation state
  const [carouselNav, setCarouselNav] = useState<{
    canGoUp: boolean;
    canGoDown: boolean;
    goUp: () => void;
    goDown: () => void;
    totalCount: number;
    currentIndex: number;
  }>({
    canGoUp: false,
    canGoDown: true,
    goUp: () => {},
    goDown: () => {},
    totalCount: 0,
    currentIndex: 0,
  });

  // Callback to receive navigation functions from carousel
  const handleCarouselNavigationChange = useCallback((
    canGoUp: boolean,
    canGoDown: boolean,
    goUp: () => void,
    goDown: () => void,
    totalCount: number,
    currentIndex: number
  ) => {
    setCarouselNav({ canGoUp, canGoDown, goUp, goDown, totalCount, currentIndex });
  }, []);

  // Role carousel navigation state
  const [roleCarouselNav, setRoleCarouselNav] = useState<{
    canGoUp: boolean;
    canGoDown: boolean;
    goUp: () => void;
    goDown: () => void;
    totalCount: number;
    currentIndex: number;
  }>({
    canGoUp: false,
    canGoDown: true,
    goUp: () => {},
    goDown: () => {},
    totalCount: 0,
    currentIndex: 0,
  });

  // Callback to receive navigation functions from role carousel
  const handleRoleCarouselNavigationChange = useCallback((
    canGoUp: boolean,
    canGoDown: boolean,
    goUp: () => void,
    goDown: () => void,
    totalCount: number,
    currentIndex: number
  ) => {
    setRoleCarouselNav({ canGoUp, canGoDown, goUp, goDown, totalCount, currentIndex });
  }, []);

  // Toggle expanded panel
  const togglePanel = (panel: ExpandedPanel) => {
    setExpandedPanel(prev => prev === panel ? 'none' : panel);
  };

  // Compute dashboard data from snapshot (replaces placeholder)
  const computedDashboardData: DashboardData = React.useMemo(() => {
    if (!dashboardSnapshot) {
      // Return placeholder data if snapshot not loaded
      return dashboardData;
    }

    const snapshot = dashboardSnapshot;
    const firstLogbook = snapshot.selection.logbooks[0];
    const aggregates = snapshot.selection.selectionAggregates;

    // Transform snapshot data to miniCards format
    const overviewMiniCards: MiniCardData[] = [
      // Fairness index (avg across enforced roles)
      {
        type: 'sparkline',
        title: 'Fairness index',
        value: Math.round((aggregates.roleAveragesPerStore.fairnessIndexPctAvgEnforcedOnly || 0) * 100) / 100,
        unit: '%',
        status: 'Enforced roles',
        sparklineData: snapshot.selection.logbooks.map(lb => {
          const enforcedRoles = lb.roleStats.filter(r => r.isEnforced && r.fairnessScore !== null);
          if (enforcedRoles.length === 0) return 0;
          const avgFairness = enforcedRoles.reduce((sum, r) => sum + (r.giniCoefficient ? (1 - r.giniCoefficient) * 100 : 0), 0) / enforcedRoles.length;
          return Math.round(avgFairness * 100) / 100;
        }),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v.756a49.106 49.106 0 0 1 9.152 1 .75.75 0 0 1-.152 1.485h-1.918l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 18.75 18a6.723 6.723 0 0 1-3.181-.795.75.75 0 0 1-.375-.84l2.474-10.124H12.75v13.28c1.293.076 2.534.343 3.697.776a.75.75 0 0 1-.262 1.453h-8.37a.75.75 0 0 1-.262-1.453c1.162-.433 2.404-.7 3.697-.775V6.24H6.332l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 5.25 18a6.723 6.723 0 0 1-3.181-.795.75.75 0 0 1-.375-.84L4.168 6.241H2.25a.75.75 0 0 1-.152-1.485 49.105 49.105 0 0 1 9.152-1V3a.75.75 0 0 1 .75-.75Zm4.878 13.543 1.872-7.662 1.872 7.662h-3.744Zm-9.756 0L5.25 8.131l-1.872 7.662h3.744Z" clipRule="evenodd" />
          </svg>
        ),
      },
      // Avg shift time
      (() => {
        if (!firstLogbook) {
          return {
            type: 'bar' as const,
            title: 'Avg shift time',
            value: 0,
            unit: 'min',
            status: 'Roles',
            barData: [],
          };
        }

        const avgMinutes = Math.round(firstLogbook.roleStats.reduce((sum, r) => sum + r.avgMinutesPerAssignment, 0) / firstLogbook.roleStats.length);

        return {
          type: 'bar' as const,
          title: 'Avg shift time',
          value: avgMinutes,
          unit: 'min',
          status: 'Roles',
          barData: firstLogbook.roleStats.map(r => ({
            role: r.roleName,
            hours: Math.round(r.avgMinutesPerAssignment),
          })),
          barUnit: 'min',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
            </svg>
          ),
        };
      })(),
      // Fairness status by role
      {
        type: 'statusBar',
        title: 'Fairness status',
        status: 'All roles',
        barData: firstLogbook ? firstLogbook.roleStats
          .filter(r => r.isEnforced)
          .map(r => ({
            role: r.roleName,
            value: r.giniCoefficient ? (1 - r.giniCoefficient) * 100 : 0,
            status: (r.fairnessStatus || 'ok').charAt(0).toUpperCase() + (r.fairnessStatus || 'ok').slice(1),
          })) : [],
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm2.023 6.828a.75.75 0 1 0-1.06-1.06 3.75 3.75 0 0 1-5.304 0 .75.75 0 0 0-1.06 1.06 5.25 5.25 0 0 0 7.424 0Z" clipRule="evenodd" />
          </svg>
        ),
      },
      // Preferences met
      {
        type: 'pie',
        title: 'Avg. preferences met',
        value: Math.round((aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0) * 100) / 100,
        unit: '%',
        status: 'All crew',
        pieData: {
          met: Math.round((aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0) * 100) / 100,
          notMet: Math.round((100 - (aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0)) * 100) / 100,
        },
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
            <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
          </svg>
        ),
      },
    ];

    return {
      expandedDashboards: {
        Overview: {
          name: 'Overview',
          miniCards: overviewMiniCards,
        },
      },
    };
  }, [dashboardSnapshot]);

  // Compute crew cards from snapshot - uses selectionCrewRollups for multi-day data
  const computedCrewCards: CrewCardData[] = React.useMemo(() => {
    console.log('🔄 computedCrewCards useMemo triggered', {
      hasSnapshot: !!dashboardSnapshot,
      hasCrewRollups: !!dashboardSnapshot?.selection?.selectionCrewRollups?.length,
      crewRollupCount: dashboardSnapshot?.selection?.selectionCrewRollups?.length,
    });

    if (!dashboardSnapshot || !dashboardSnapshot.selection.selectionCrewRollups?.length) {
      console.log('📊 No crew rollup data available');
      return [];
    }

    const crewRollups = dashboardSnapshot.selection.selectionCrewRollups;
    
    // Build roleId → roleName map from first logbook
    const roleNameMap: Record<string, string> = {};
    if (dashboardSnapshot.selection.logbooks[0]) {
      dashboardSnapshot.selection.logbooks[0].roleStats.forEach(role => {
        roleNameMap[role.roleId] = role.roleName;
      });
    }
    
    console.log('📊 Computing crew cards from selectionCrewRollups:', {
      crewCount: crewRollups.length,
      firstCrew: crewRollups[0]?.crewName,
    });

    // Separate crew with preferences from those without
    const crewWithPrefs = crewRollups.filter(c => c.preferencesTotalSelection > 0);
    const crewWithoutPrefs = crewRollups.filter(c => c.preferencesTotalSelection === 0);

    // Sort crew WITH preferences by satisfaction descending for ranking
    const sortedWithPrefs = [...crewWithPrefs].sort((a, b) => 
      b.avgSatisfactionPctOverSelection - a.avgSatisfactionPctOverSelection
    );

    // Compute ranks with ties (same satisfaction = same rank)
    // Round to nearest integer for tie comparison
    const getRoundedSatisfaction = (crew: typeof sortedWithPrefs[0]) => 
      Math.round(crew.avgSatisfactionPctOverSelection);
    
    let currentRank = 1;
    let previousSatisfaction: number | null = null;
    const ranksMap = new Map<string, number>();
    
    sortedWithPrefs.forEach((crew, index) => {
      const roundedSat = getRoundedSatisfaction(crew);
      if (previousSatisfaction !== null && roundedSat < previousSatisfaction) {
        // Different satisfaction than previous, get new rank based on position
        currentRank = index + 1;
      }
      ranksMap.set(crew.crewId, currentRank);
      previousSatisfaction = roundedSat;
    });

    // Get total unique rank tiers (number of distinct ranks, not highest rank number)
    const uniqueRanks = new Set(ranksMap.values());
    const totalRanks = uniqueRanks.size;

    // Create cards for crew WITH preferences (they get ranks)
    const cardsWithPrefs = sortedWithPrefs.map((crew) => ({
      title: crew.crewName,
      id: crew.crewId,
      satisfactionScore: Math.round(crew.avgSatisfactionPctOverSelection * 100) / 100,
      satisfactionRank: ranksMap.get(crew.crewId) || 1,
      totalRankedCrew: totalRanks, // Total unique rank tiers
      preferencesTotal: crew.preferencesTotalSelection,
      preferencesMetCount: crew.preferencesMetSelection,
      vsCrewAvg: Math.round(crew.avgVsCrewAvgDeltaOverSelection * 100) / 100,
      satisfactionByDate: crew.satisfactionByDate || [],
      satisfactionHistory: crew.satisfactionByDate?.map(d => d.satisfactionPct) || [],
      avgMinutesPerRole: Object.entries(crew.avgMinutesPerAssignmentByRoleSelection || {}).map(([roleId, avgMinutes]) => ({
        roleId,
        roleName: roleNameMap[roleId] || roleId,
        avgMinutes: Math.round(avgMinutes),
      })),
      preferenceBreakdownByRuleType: crew.preferenceBreakdownByRuleType || [],
    }));

    // Create cards for crew WITHOUT preferences (no ranks, dashes for satisfaction metrics)
    const cardsWithoutPrefs = crewWithoutPrefs.map((crew) => ({
      title: crew.crewName,
      id: crew.crewId,
      satisfactionScore: undefined, // Will show as dash
      satisfactionRank: undefined,  // Will show as dash
      totalRankedCrew: undefined,   // Will show as dash
      preferencesTotal: 0,
      preferencesMetCount: 0,
      vsCrewAvg: undefined,         // Will show as dash
      satisfactionByDate: crew.satisfactionByDate || [],
      satisfactionHistory: crew.satisfactionByDate?.map(d => d.satisfactionPct) || [],
      avgMinutesPerRole: Object.entries(crew.avgMinutesPerAssignmentByRoleSelection || {}).map(([roleId, avgMinutes]) => ({
        roleId,
        roleName: roleNameMap[roleId] || roleId,
        avgMinutes: Math.round(avgMinutes),
      })),
      preferenceBreakdownByRuleType: [],
    }));

    // Combine: crew with prefs first (sorted by satisfaction), then crew without prefs (sorted alphabetically)
    return [
      ...cardsWithPrefs,
      ...cardsWithoutPrefs.sort((a, b) => a.title.localeCompare(b.title)),
    ];
  }, [dashboardSnapshot]);

  // Helper function to format minutes to "1 hr 30 min" or "30 min"
  const formatMinutesToReadable = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins === 0) {
      return `${hours} hr`;
    }
    return `${hours} hr ${mins} min`;
  };

  // Helper function to format rule type to human-readable label
  const formatRuleTypeLabel = (ruleType: string): string => {
    const labels: Record<string, string> = {
      'FIRST_HOUR': 'First Hour',
      'FAVORITE': 'Favorite',
      'CONSECUTIVE': 'Consecutive',
      'POSITION_IN_SHIFT': 'Position',
      'FORBID_ROLE': 'Avoid Role',
      'TIME_ON_ROLE': 'Time On Role',
      'MAX_TIME_ON_ROLE': 'Max Time',
      'MIN_TIME_ON_ROLE': 'Min Time',
    };
    return labels[ruleType] || ruleType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  // Helper function to calculate fairness trend based on stability
  const calculateFairnessTrend = (byDateAverages: any[]): 'significantly_improving' | 'improving' | 'stable' | 'worsening' | 'significantly_worsening' => {
    if (!byDateAverages || byDateAverages.length < 2) {
      return 'stable';
    }

    // Get fairness values (we'll use avgMinutesPerCrewOnRole as a proxy for fairness distribution)
    const values = byDateAverages.map(d => d.avgMinutesPerCrewOnRole);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;

    // Also check if recent values are trending up or down
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstHalfAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    const percentChange = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

    // Determine trend based on stability (CV) and direction
    if (coefficientOfVariation < 5) {
      return 'stable'; // Very stable
    } else if (coefficientOfVariation < 10) {
      if (percentChange > 10) return 'improving';
      if (percentChange < -10) return 'worsening';
      return 'stable';
    } else if (coefficientOfVariation < 20) {
      if (percentChange > 15) return 'improving';
      if (percentChange < -15) return 'worsening';
      return 'stable';
    } else {
      if (percentChange > 20) return 'significantly_improving';
      if (percentChange < -20) return 'significantly_worsening';
      return 'stable';
    }
  };

  // Compute role cards from snapshot selection rollups
  const computedRoleCards: RoleCardData[] = React.useMemo(() => {
    if (!dashboardSnapshot || !dashboardSnapshot.selection.selectionRoleRollups) {
      console.log('📊 No role rollup data available');
      return [];
    }

    const roleRollups = dashboardSnapshot.selection.selectionRoleRollups;
    const logbooks = dashboardSnapshot.selection.logbooks;

    console.log('📊 Computing role cards from selection rollups:', {
      roleCount: roleRollups.length,
      firstRole: roleRollups[0]?.roleName,
    });

    // Calculate average fairness across all roles for vsRoleAvgPct
    const fairnessValues = roleRollups
      .map(r => r.avgFairnessIndexPct)
      .filter((f): f is number => f !== null);
    const avgFairnessAcrossRoles = fairnessValues.length > 0
      ? fairnessValues.reduce((sum, f) => sum + f, 0) / fairnessValues.length
      : 0;

    return roleRollups.map(role => {
      // Map role codes to emojis (fallback to default)
      const roleEmojis: Record<string, string> = {
        'REGISTER': '🛒',
        'PRODUCT': '📦',
        'DEMO': '🎤',
        'BREAK': '☕',
        'OFFICE': '💼',
        'PARKING HELMS': '🅿️',
        'SECTION LEADER': '👔',
        'ART': '🎨',
        'WINE DEMO': '🍷',
        'FOOD DEMO': '🍴',
      };
      const emoji = roleEmojis[role.roleName.toUpperCase()] || '⭐';

      // Get avg minutes from first logbook's role stats (for display purposes)
      let avgMinutesPerDay = 0;

      if (logbooks[0]) {
        const roleStats = logbooks[0].roleStats.find((r: any) => r.roleId === role.roleId);
        if (roleStats) {
          avgMinutesPerDay = roleStats.avgMinutesPerAssignment || 0;
        }
      }

      // Get total eligible crew who worked during the interval
      // This is crew who HAVE this role capability (CrewRole) AND worked on any shift during the interval
      // Use the max eligibleCrew across all dates (this is relatively stable)
      // Note: eligibleCrew from snapshot represents crew with CrewRole for this role
      const eligibleCrewCounts = logbooks
        .map(lb => lb.roleStats.find((r: any) => r.roleId === role.roleId)?.eligibleCrew || 0)
        .filter(count => count > 0);
      const totalEligibleCrew = eligibleCrewCounts.length > 0
        ? Math.max(...eligibleCrewCounts)
        : 0;

      // Use crewWorkedOnRoleCount from selection rollup - this is the count of unique
      // crew who actually worked this role across all selected logbooks (minutes > 0)
      const crewWhoWorkedRole = role.crewWorkedOnRoleCount || 0;

      // Calculate vsRoleAvgPct (simple difference from average fairness, displayed as %)
      // Example: If role is 46% and avg is 38%, shows +8%
      // Only calculate for tracked roles where we have meaningful fairness data
      const vsRoleAvgPct = role.avgFairnessIndexPct !== null && avgFairnessAcrossRoles > 0
        ? role.avgFairnessIndexPct - avgFairnessAcrossRoles
        : null;

      // Calculate trend
      const trend = calculateFairnessTrend(role.byDateAverages || []);

      // Transform lorenz curve data
      const lorenzData = role.lorenzCurveData?.map(point => ({
        crewPct: point.populationShare * 100,
        hoursPct: point.workShare * 100,
      })) || [];

      return {
        id: role.roleId,
        name: role.roleName,
        emoji,
        giniCoefficient: role.avgGiniCoefficient || 0,
        trend,
        crewCount: crewWhoWorkedRole,
        totalCrew: totalEligibleCrew,
        avgMinutes: avgMinutesPerDay,
        medianHours: role.minutesWorkedOnRoleTotal ? role.minutesWorkedOnRoleTotal / 60 : 0,
        vsRoleAvgPct,
        lorenzData,
        // Additional stats for role dashboard
        minutesWorkedOnRoleTotal: role.minutesWorkedOnRoleTotal,
        totalMinutesWorkedSelection: role.totalMinutesWorkedSelection,
        minutesOnRoleVsTotalWorkPct: role.minutesOnRoleVsTotalWorkPct,
        avgFairnessIndexPct: role.avgFairnessIndexPct,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboardSnapshot]);

  // Compute satisfaction by date graph data
  const computedSatisfactionByDate = React.useMemo(() => {
    if (!dashboardSnapshot) return [];

    return dashboardSnapshot.selection.logbooks.map((lb, index) => {
      // Parse date string manually to avoid timezone issues
      // Date format is "YYYY-MM-DD"
      const [year, month, day] = lb.logbook.date.split('-').map(Number);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNames[month - 1]; // month is 1-indexed in ISO string
      const yearShort = String(year).slice(-2);

      return {
        shiftNumber: index + 1,
        shiftDate: `${day} ${monthName}, ${yearShort}`,
        satisfaction: Math.round(lb.dayAggregate.satisfactionPct * 100) / 100,
      };
    });
  }, [dashboardSnapshot]);

  // Compute satisfaction distribution box plot data
  const computedSatisfactionBoxPlot = React.useMemo(() => {
    if (!dashboardSnapshot) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
    }

    // Gather all crew satisfaction scores from all logbooks
    // Only include crew who have preferences (total > 0)
    const allSatisfactionScores = dashboardSnapshot.selection.logbooks.flatMap(lb =>
      lb.crewStats
        .filter(cs => cs.preferencesTotal > 0) // Only crew with preferences
        .map(cs => {
          console.log(`Crew ${cs.crewName}: ${cs.preferencesMet}/${cs.preferencesTotal} = ${cs.satisfactionPct}%`);
          return cs.satisfactionPct;
        })
    );

    console.log('📊 Total crew with preferences:', allSatisfactionScores.length);
    console.log('📊 Raw satisfaction scores:', allSatisfactionScores);

    if (allSatisfactionScores.length === 0) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
    }

    // Sort scores
    const sorted = [...allSatisfactionScores].sort((a, b) => a - b);

    // Calculate quartiles
    const q1Index = Math.floor(sorted.length * 0.25);
    const q2Index = Math.floor(sorted.length * 0.5);
    const q3Index = Math.floor(sorted.length * 0.75);

    const minVal = sorted[0];
    const q1 = sorted[q1Index];
    const median = sorted[q2Index];
    const q3 = sorted[q3Index];
    const maxVal = sorted[sorted.length - 1];

    // Calculate IQR and outliers
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const outliers = sorted.filter(val => val < lowerBound || val > upperBound);

    // For box plot: min/max should be the whiskers (non-outlier extremes)
    const nonOutliers = sorted.filter(val => val >= lowerBound && val <= upperBound);
    const whiskerMin = nonOutliers.length > 0 ? nonOutliers[0] : minVal;
    const whiskerMax = nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : maxVal;

    const result = {
      min: Math.round(whiskerMin * 100) / 100,
      q1: Math.round(q1 * 100) / 100,
      median: Math.round(median * 100) / 100,
      q3: Math.round(q3 * 100) / 100,
      max: Math.round(whiskerMax * 100) / 100,
      outliers: outliers.map(o => Math.round(o * 100) / 100),
    };

    console.log('📊 Box plot data:', result);
    console.log('📊 All satisfaction scores:', sorted);

    return result;
  }, [dashboardSnapshot]);

  // Store role rules fetched from API
  const [roleRules, setRoleRules] = React.useState<any[]>([]);

  // Compute preference data for GraphCardSimple
  const computedPreferenceData = React.useMemo(() => {
    if (!dashboardSnapshot) return [];

    const firstLogbook = dashboardSnapshot.selection.logbooks[0];
    if (!firstLogbook) return [];

    // Transform breakdownByRuleType into GraphCardSimple format
    return firstLogbook.dayAggregate.breakdownByRuleType.map(breakdown => {
      // Find the corresponding role rule and use its description
      const rule = roleRules.find(r => r.roleRuleId === breakdown.roleRuleId);
      // Use formatRuleTypeLabel for human-readable label
      const label = rule?.type ? formatRuleTypeLabel(rule.type) : `Rule ${breakdown.roleRuleId}`;
      const description = rule?.description || undefined;

      return {
        label,
        description,
        totalCount: breakdown.eligible,
        satisfiedCount: breakdown.met,
      };
    });
  }, [dashboardSnapshot, roleRules]);

  // Compute role dashboard box plot data (crew mins/shift spread for selected role)
  const computedRoleBoxPlot = React.useMemo(() => {
    if (!dashboardSnapshot || !selectedRole) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], hasDistribution: false };
    }

    // Gather all crew minutes for this role across all logbooks (per-day granularity)
    const allCrewMinutes: number[] = dashboardSnapshot.selection.logbooks.flatMap(lb =>
      lb.crewStats
        .map(cs => cs.avgMinutesPerAssignmentByRole[selectedRole.id] || 0)
        .filter(minutes => minutes > 0)
    );

    if (allCrewMinutes.length === 0) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], hasDistribution: false };
    }

    const sorted = allCrewMinutes.slice().sort((a, b) => a - b);

    // Check if there's meaningful distribution (at least 2 unique values)
    const uniqueValues = new Set(sorted);
    if (uniqueValues.size < 2) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], hasDistribution: false };
    }

    // Compute quantiles
    const q1Index = Math.floor(sorted.length * 0.25);
    const medianIndex = Math.floor(sorted.length * 0.5);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const median = sorted[medianIndex];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    // Outliers: values beyond 1.5 * IQR from quartiles
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outliers = sorted.filter(val => val < lowerBound || val > upperBound);

    // Whiskers: min/max of non-outliers
    const nonOutliers = sorted.filter(val => val >= lowerBound && val <= upperBound);
    const whiskerMin = nonOutliers.length > 0 ? nonOutliers[0] : sorted[0];
    const whiskerMax = nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : sorted[sorted.length - 1];

    return {
      min: Math.round(whiskerMin * 100) / 100,
      q1: Math.round(q1 * 100) / 100,
      median: Math.round(median * 100) / 100,
      q3: Math.round(q3 * 100) / 100,
      max: Math.round(whiskerMax * 100) / 100,
      outliers: outliers.map(o => Math.round(o * 100) / 100),
      hasDistribution: true,
    };
  }, [dashboardSnapshot, selectedRole]);

  // Compute role heatmap data (avg hours per crew per day for selected role)
  // Uses selectedRole for full-page dashboard, or rolePanelCard for split panel
  const computedRoleHeatmap = React.useMemo(() => {
    const roleToUse = selectedRole ?? rolePanelCard;
    if (!dashboardSnapshot || !roleToUse) {
      return { weeks: [], data: [] };
    }

    const logbooks = dashboardSnapshot.selection.logbooks;
    if (logbooks.length === 0) {
      return { weeks: [], data: [] };
    }

    // Group logbooks by week
    const weekMap = new Map<string, { weekLabel: string; dates: { date: string; dayOfWeek: string; avgHours: number }[] }>();

    logbooks.forEach(lb => {
      const date = new Date(lb.logbook.date);

      // Get the start of the week (Sunday)
      const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
      const startOfWeek = new Date(date);
      startOfWeek.setUTCDate(date.getUTCDate() - dayOfWeek);

      // Format week label (e.g., "25 Nov-1 Dec, 25")
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);

      const startDay = startOfWeek.getUTCDate();
      const endDay = endOfWeek.getUTCDate();
      const startMonth = startOfWeek.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const endMonth = endOfWeek.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const year = String(startOfWeek.getUTCFullYear()).slice(-2);

      const weekLabel = startMonth === endMonth
        ? `${startDay}-${endDay} ${startMonth}, ${year}`
        : `${startDay} ${startMonth}-${endDay} ${endMonth}, ${year}`;

      const weekKey = startOfWeek.toISOString().split('T')[0];

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { weekLabel, dates: [] });
      }

      // Get day of week label
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayLabel = dayLabels[dayOfWeek];

      // Calculate average hours for this role on this date
      const roleStats = lb.crewStats.filter(cs => {
        const minutes = cs.avgMinutesPerAssignmentByRole[roleToUse.id] || 0;
        return minutes > 0;
      });

      const totalMinutes = roleStats.reduce((sum, cs) => sum + (cs.avgMinutesPerAssignmentByRole[roleToUse.id] || 0), 0);
      const avgHours = roleStats.length > 0 ? totalMinutes / roleStats.length / 60 : 0;

      weekMap.get(weekKey)!.dates.push({
        date: lb.logbook.date,
        dayOfWeek: dayLabel,
        avgHours,
      });
    });

    // Convert to weeks array and data array
    const weeks: string[] = [];
    const data: { week: string; dayOfWeek: string; avgHours: number }[] = [];

    // Sort weeks chronologically
    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    sortedWeeks.forEach(([weekKey, weekData]) => {
      weeks.push(weekData.weekLabel);

      weekData.dates.forEach(dateData => {
        data.push({
          week: weekData.weekLabel,
          dayOfWeek: dateData.dayOfWeek,
          avgHours: dateData.avgHours,
        });
      });
    });

    return { weeks, data };
  }, [dashboardSnapshot, selectedRole, rolePanelCard]);

  // Compute crew fairness table data for selected role
  // Uses selectedRole for full-page dashboard, or rolePanelCard for split panel
  const computedCrewFairnessTable = React.useMemo(() => {
    const roleToUse = selectedRole ?? rolePanelCard;
    if (!dashboardSnapshot || !roleToUse) {
      return [];
    }

    const crewRollups = dashboardSnapshot.selection.selectionCrewRollups;
    const roleId = roleToUse.id;

    // Filter crew who have been assigned to this role
    const crewWithRole = crewRollups.filter(crew => {
      const minutes = crew.avgMinutesPerAssignmentByRoleSelection[roleId];
      return minutes !== undefined && minutes > 0;
    });

    if (crewWithRole.length === 0) {
      return [];
    }

    // Calculate overall average for deviation
    const totalMinutes = crewWithRole.reduce((sum, crew) =>
      sum + crew.avgMinutesPerAssignmentByRoleSelection[roleId], 0
    );
    const overallAvg = totalMinutes / crewWithRole.length;

    // Today's date for calculating days ago
    const today = new Date();

    // Map to table format
    return crewWithRole.map(crew => {
      const minsPerShift = crew.avgMinutesPerAssignmentByRoleSelection[roleId];
      const lastAssignedDate = crew.lastAssignedDateByRoleSelection[roleId];

      // Calculate days ago
      let lastAssignedDays = 0;
      if (lastAssignedDate) {
        const lastDate = new Date(lastAssignedDate);
        const diffTime = today.getTime() - lastDate.getTime();
        lastAssignedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // Calculate deviation percentage
      const deviation = overallAvg > 0
        ? ((minsPerShift - overallAvg) / overallAvg) * 100
        : 0;

      return {
        name: crew.crewName,
        minsPerShift,
        lastAssignedDays,
        deviation,
      };
    });
  }, [dashboardSnapshot, selectedRole, rolePanelCard]);

  // Get current dashboard data
  const currentDashboard = computedDashboardData.expandedDashboards[activeDashboard];

  // Format time interval for display (e.g., "7-13 Jan, 26")
  const formatTimeInterval = (interval: TimeInterval | undefined): string => {
    if (!interval) return 'Loading...';
    return `${interval.startDay}-${interval.endDay} ${interval.month}, ${interval.year}`;
  };

  // Get the time interval string from API data
  const timeIntervalDisplay = formatTimeInterval(dashboardApiData?.panel.header.timeInterval);

  // Load state from localStorage after mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);

    // Load all persisted state
    setActiveDashboard(loadState('activeDashboard', 'Overview'));
    setCrewPage(loadState('crewPage', 1));
    setRolePage(loadState('rolePage', 1));
    setTimeSelectionIndex(loadState('timeSelectionIndex', 0));
    setYearSelectionIndex(loadState('yearSelectionIndex', 0));
    setSelectedCrewId(loadState('selectedCrewId', null));
    setSelectedRoleId(loadState('selectedRoleId', null));

    // Load selectedDays (convert arrays back to Sets)
    const saved = loadState<Record<string, number[]>>('selectedDays', {});
    const result: Record<string, Set<number>> = {};
    for (const [key, value] of Object.entries(saved)) {
      result[key] = new Set(value);
    }
    setSelectedDays(result);
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    if (!mounted) return;
    saveState('activeDashboard', activeDashboard);
  }, [activeDashboard, mounted]);

  useEffect(() => {
    if (!mounted) return;
    saveState('crewPage', crewPage);
  }, [crewPage, mounted]);

  useEffect(() => {
    if (!mounted) return;
    saveState('rolePage', rolePage);
  }, [rolePage, mounted]);

  useEffect(() => {
    if (!mounted) return;
    saveState('timeSelectionIndex', timeSelectionIndex);
  }, [timeSelectionIndex, mounted]);

  useEffect(() => {
    if (!mounted) return;
    saveState('yearSelectionIndex', yearSelectionIndex);
  }, [yearSelectionIndex, mounted]);

  useEffect(() => {
    if (!mounted) return;
    // Convert Sets to arrays for JSON serialization
    const serializable: Record<string, number[]> = {};
    for (const [key, value] of Object.entries(selectedDays)) {
      serializable[key] = Array.from(value);
    }
    saveState('selectedDays', serializable);
  }, [selectedDays, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (selectedCrew) {
      saveState('selectedCrewId', selectedCrew.id);
      setSelectedCrewId(selectedCrew.id);
    } else {
      saveState('selectedCrewId', null);
    }
  }, [selectedCrew, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (selectedRole) {
      saveState('selectedRoleId', selectedRole.id);
      setSelectedRoleId(selectedRole.id);
    } else {
      saveState('selectedRoleId', null);
    }
  }, [selectedRole, mounted]);

  // Restore selected crew/role from IDs after data loads
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

  // Update selected crew with fresh data when computedCrewCards changes (e.g., dates selected)
  useEffect(() => {
    if (!selectedCrew || !dashboardSnapshot) return;
    const updatedCrew = computedCrewCards.find(c => c.id === selectedCrew.id);
    if (updatedCrew) {
      setSelectedCrew(updatedCrew);
    }
  }, [computedCrewCards, dashboardSnapshot]);

  // Update selected role with fresh data when computedRoleCards changes (e.g., dates selected)
  useEffect(() => {
    if (!selectedRole || !dashboardSnapshot) return;
    const updatedRole = computedRoleCards.find(r => r.id === selectedRole.id);
    if (updatedRole) {
      setSelectedRole(updatedRole);
    }
  }, [computedRoleCards, dashboardSnapshot]);

  // Fetch store info
  useEffect(() => {
    // Fetch store details
    async function fetchStore() {
      if (!API_URL || !storeId) return;
      try {
        const res = await fetch(`${API_URL}/stores`);
        if (!res.ok) throw new Error(await res.text());
        const stores = (await res.json()) as Store[];
        const store = stores.find(s => s.id === parseInt(storeId, 10));
        if (store) setStoreName(store.name);
      } catch (e) {
        console.error('Failed to load store:', e);
      }
    }
    fetchStore();
  }, [storeId]);

  // Fetch available logbook dates
  useEffect(() => {
    async function fetchAvailableDates() {
      if (!API_URL || !storeId) return;
      try {
        const res = await fetch(`${API_URL}/api/stores/${storeId}/dashboard/dates`);
        if (!res.ok) throw new Error(await res.text());
        const { dates } = await res.json();
        setAvailableDates(dates);
      } catch (e) {
        console.error('Failed to load available dates:', e);
      }
    }
    fetchAvailableDates();
  }, [storeId]);

  // Auto-navigate to most recent month with shifts when dates load (only if no saved state)
  useEffect(() => {
    if (availableDates.length === 0) return;

    // Check if we have saved state - if so, don't auto-navigate
    const hasSavedYearIndex = loadState('yearSelectionIndex', null) !== null;
    const hasSavedTimeIndex = loadState('timeSelectionIndex', null) !== null;
    if (hasSavedYearIndex || hasSavedTimeIndex) return;

    // Find the most recent date (dates are sorted descending from API)
    const mostRecentDate = availableDates[0];
    const date = new Date(mostRecentDate);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11

    // Find the year index
    const yearIdx = availableYears.findIndex(y => y === year);
    if (yearIdx !== -1) {
      setYearSelectionIndex(yearIdx);
      setTimeSelectionIndex(month);
    }
  }, [availableDates, availableYears]);

  // Fetch dashboard data from API
  useEffect(() => {
    console.log('🔄 Dashboard fetch effect triggered', {
      storeId,
      availableDatesCount: availableDates.length,
      selectedDaysKeys: Object.keys(selectedDays).length,
      timestamp: new Date().toISOString(),
    });

    async function fetchDashboardData() {
      if (!API_URL || !storeId) return;

      // Wait for available dates to load first
      if (availableDates.length === 0 && Object.keys(selectedDays).length === 0) {
        console.log('📊 Waiting for available dates to load...');
        return;
      }

      console.log('📊 Starting dashboard fetch...');
      setDashboardLoading(true);
      setDashboardError(null);

      try {
        // Use timeSelectedDates from TimeWindowHeader, or fallback to all available dates
        const datesToFetch = timeSelectedDates.length > 0 ? timeSelectedDates : availableDates;

        console.log('📊 Fetching data for dates:', {
          selectedCount: timeSelectedDates.length,
          availableCount: availableDates.length,
          usingDates: datesToFetch.length,
          sampleDates: datesToFetch.slice(0, 3),
        });

        // Skip if no dates to fetch
        if (datesToFetch.length === 0) {
          console.log('📊 No dates to fetch, skipping');
          setDashboardLoading(false);
          return;
        }

        // Fetch logbook data from NEW endpoint
        const datesParam = datesToFetch.join(',');
        console.log('📊 Fetching from URL:', `${API_URL}/api/stores/${storeId}/dashboard/logbooks?dates=${datesParam}&status=PUBLISHED`);
        const res = await fetch(`${API_URL}/api/stores/${storeId}/dashboard/logbooks?dates=${datesParam}&status=PUBLISHED`);
        if (!res.ok) throw new Error(await res.text());

        const { logbooks, roleRules } = await res.json();

        console.log('📊 Logbook data fetched:', {
          logbookCount: logbooks.length,
          datesRequested: datesToFetch.length,
          roleRulesCount: roleRules?.length || 0,
        });

        // Store role rules for preference sentence generation
        if (roleRules) {
          setRoleRules(roleRules);
        }

        // Transform roleRules to match the expected format for builder
        // The API returns roleRules with crewId as an array, we need to flatten
        const flattenedRoleRules = (roleRules || []).flatMap((rule: any) => {
          // If crewId is an array, create one entry per crew
          if (Array.isArray(rule.crewIds)) {
            return rule.crewIds.map((crewId: string) => ({
              crewId,
              roleId: String(rule.roleId),
              type: rule.type,
            }));
          }
          // Single crewId
          return [{
            crewId: rule.crewId,
            roleId: String(rule.roleId),
            type: rule.type,
          }];
        });

        // Build dashboard snapshot
        const snapshot = buildDashboardSnapshot({
          storeId,
          timezone: 'America/New_York', // TODO: get from store
          selectionId: 'dashboard-view',
          selectionLabel: 'Fairness Dashboard',
          selectedDates: datesToFetch,
          logbooks,
          roleRules: flattenedRoleRules,
        });

        console.log('✅ Setting dashboard snapshot with data:', {
          logbookCount: snapshot.selection.logbooks.length,
          crewCount: snapshot.selection.selectionCrewRollups.length,
          roleCount: snapshot.selection.selectionRoleRollups.length,
        });

        setDashboardSnapshot(snapshot);

        console.log('📊 Dashboard snapshot state updated');

        // Also fetch legacy dashboard API for compatibility (for now)
        if (datesToFetch.length > 0) {
          const sortedDates = [...datesToFetch].sort();
          const legacyParams = new URLSearchParams({
            startDate: sortedDates[0],
            endDate: sortedDates[sortedDates.length - 1],
            title: 'Fairness Dashboard',
          });

          const legacyRes = await fetch(`${API_URL}/api/stores/${storeId}/dashboard?${legacyParams}`);
          if (legacyRes.ok) {
            const legacyData = await legacyRes.json() as DashboardApiResponse;
            setDashboardApiData(legacyData);
          }
        }
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
        setDashboardError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        setDashboardLoading(false);
      }
    }

    fetchDashboardData();
  }, [storeId, timeSelectedDates, availableDates]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <div style={{ isolation: 'isolate' }}>
        <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
          <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9 flex flex-col gap-6">
          {/* Responsive panel width */}
          <style>{`
            @media (min-width: 1200px) {
              .dashboard-outer-panel { flex: 0 0 80%; max-width: 80%; }
            }
          `}</style>

          {/* Outer card - 80% width centered */}
          <div className="flex flex-col min-[1200px]:flex-row min-[1200px]:justify-center">
            <div className="ai-glass-border w-full dashboard-outer-panel" style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}>
              <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), height: 'auto', padding: '24px' }}>
                <TopNavHeader storeId={storeId} activeNav="dashboard" />

                {/* Secondary nav - Overview/Crew/Roles */}
                <div className="sticky top-7 z-40" style={{ marginTop: '24px' }}>
                  <div
                    className="ai-glass-border"
                    style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
                  >
                    <div
                      style={{
                        ...aiGlassLightContentStyle('1.5rem', 0.6),
                        height: 'auto',
                        padding: '16px 8px',
                        overflowX: 'auto',
                      }}
                    >
                      <nav style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedCrew || selectedRole || crewPanelCard || rolePanelCard ? 4 : 3}, 1fr)`, width: '100%', transition: 'grid-template-columns 200ms ease-out' }}>
                        <NavStatsCard
                          icon={<ChartBarIcon />}
                          label="Overview"
                          subtext="Dashboard"
                          isActive={activeView === 'overview' && !selectedCrew && !selectedRole}
                          onClick={() => {
                            setActiveView('overview');
                            setSelectedCrew(null);
                            setSelectedRole(null);
                            setSelectedCrewId(null);
                            setSelectedRoleId(null);
                            setCrewPanelCard(null);
                            setRolePanelCard(null);
                          }}
                          isFirst
                        />
                        <NavStatsCard
                          icon={<UserGroupIcon />}
                          label="Crew"
                          count={computedCrewCards.length}
                          isActive={activeView === 'crew' && !selectedCrew && !crewPanelCard}
                          onClick={() => {
                            setActiveView('crew');
                            setSelectedCrew(null);
                            setSelectedRole(null);
                            setSelectedCrewId(null);
                            setSelectedRoleId(null);
                            setCrewPanelCard(null);
                            setRolePanelCard(null);
                            setCrewPage(1);
                          }}
                        />
                        <NavStatsCard
                          icon={<ShieldCheckIcon />}
                          label="Roles"
                          count={computedRoleCards.length}
                          isActive={activeView === 'roles' && !selectedRole && !rolePanelCard}
                          onClick={() => {
                            setActiveView('roles');
                            setSelectedCrew(null);
                            setSelectedRole(null);
                            setSelectedCrewId(null);
                            setSelectedRoleId(null);
                            setCrewPanelCard(null);
                            setRolePanelCard(null);
                            setRolePage(1);
                          }}
                          isLast={!selectedCrew && !selectedRole && !crewPanelCard && !rolePanelCard}
                        />
                        {/* Animated 4th nav button for individual views */}
                        {(selectedCrew || selectedRole || crewPanelCard || rolePanelCard) && (
                          <div
                            className="animate-in fade-in slide-in-from-right-4 duration-200"
                            style={{ animationFillMode: 'both' }}
                          >
                            <NavStatsCard
                              label={selectedCrew?.title || crewPanelCard?.title || selectedRole?.name || rolePanelCard?.name || ''}
                              subtext="Statistics"
                              isActive={true}
                              onClick={() => {}}
                              isLast
                              activeColor="#dc2626"
                            />
                          </div>
                        )}
                      </nav>
                    </div>
                  </div>
                </div>

                {/* Main content area */}
                <div style={{ marginTop: '24px' }}>
                  {/* Main content - takes remaining space */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Dashboard content - full width */}
                    <div>
              {/* Conditional content: Individual Crew Dashboard, Dashboard, or Expanded Quick Looks */}
              {selectedCrew ? (
                /* Individual Crew Dashboard */
                <CrewDashboardContent
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
                /* Individual Role Dashboard */
                <RoleDashboardContent
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
                /* Crew List View - Split Panel Layout (inside single card) */
                (() => {
                  // Filter crew cards: must have 1+ preferences, match search query, sort alphabetically
                  const filteredCrewCards = computedCrewCards
                    .filter(card => (card.preferencesTotal ?? 0) > 0)
                    .filter(card => card.title.toLowerCase().includes(crewSearchQuery.toLowerCase()))
                    .sort((a, b) => a.title.localeCompare(b.title));
                  const crewTotalPages = Math.ceil(filteredCrewCards.length / CREW_CARDS_PER_PAGE);
                  const showCrewPagination = filteredCrewCards.length > CREW_CARDS_PER_PAGE;
                  const hasCrewPanel = crewPanelCard !== null;

                  return (
                    <div
                      className="ai-glass-border"
                      style={{
                        ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08),
                        ...aiGlassLightContentStyle('1.5rem', 0.6),
                        minHeight: '400px',
                      }}
                    >
                      {/* Embedded header with search bar and pagination */}
                      <div style={{ margin: '0', width: '100%' }}>
                        <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
                          <div className="flex items-center" style={{ width: '100%', gap: '12px' }}>
                            {/* Search bar - fills available space */}
                            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flex: 1, minWidth: 0 }}>
                              <div
                                className="flex items-center"
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.6),
                                  padding: '0 14px',
                                  height: '36px',
                                  width: '100%',
                                }}
                              >
                                <MagnifyingGlassIcon style={{ width: 14, height: 14, color: '#6B6B6B', flexShrink: 0 }} />
                                <input
                                  type="text"
                                  placeholder="Search crew..."
                                  value={crewSearchQuery}
                                  onChange={(e) => {
                                    setCrewSearchQuery(e.target.value);
                                    setCrewPage(1);
                                  }}
                                  className="focus:outline-none focus:ring-0 flex-1"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#2C2C2C',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '14px',
                                    fontWeight: 400,
                                    width: '100%',
                                    marginLeft: '8px',
                                  }}
                                />
                              </div>
                            </div>
                            {/* Pagination - right aligned, only show if needed */}
                            {showCrewPagination && (
                              <div
                                className="ai-glass-border"
                                style={{
                                  ...aiGlassLightBorderStyle('9999px'),
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  className="flex items-center gap-1"
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.4),
                                    padding: '0 6px',
                                    height: '36px',
                                  }}
                                >
                                  <button
                                    onClick={() => setCrewPage(p => Math.max(1, p - 1))}
                                    disabled={crewPage === 1}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: '0 8px',
                                      cursor: crewPage === 1 ? 'default' : 'pointer',
                                      color: crewPage === 1 ? '#9A999E' : '#6B6B6B',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '14px',
                                    }}
                                  >
                                    ◀
                                  </button>
                                  <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '0 4px' }}>
                                    {crewPage} / {crewTotalPages}
                                  </span>
                                  <button
                                    onClick={() => setCrewPage(p => Math.min(crewTotalPages, p + 1))}
                                    disabled={crewPage >= crewTotalPages}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: '0 8px',
                                      cursor: crewPage >= crewTotalPages ? 'default' : 'pointer',
                                      color: crewPage >= crewTotalPages ? '#9A999E' : '#6B6B6B',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '14px',
                                    }}
                                  >
                                    ▶
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </GlassPillCard>
                      </div>

                      {/* Content area - flex row with list and panel side by side */}
                      <div className="flex" style={{ padding: '16px', gap: '16px' }}>
                        {/* List column - shrinks when panel open */}
                        <div
                          className="flex flex-col gap-3"
                          style={{
                            width: hasCrewPanel ? '20%' : '100%',
                            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            flexShrink: 0,
                          }}
                        >
                          {filteredCrewCards
                            .slice((crewPage - 1) * CREW_CARDS_PER_PAGE, crewPage * CREW_CARDS_PER_PAGE)
                            .map((card) => {
                              const isSelected = crewPanelCard?.id === card.id;
                              const isHovered = hoveredCrewCardId === card.id;
                              return (
                                <div
                                  key={card.id}
                                  className="ai-glass-border cursor-pointer transition-all"
                                  style={{
                                    ...aiGlassLightBorderStyle('1rem', '0, 0, 0', isSelected || isHovered ? 0 : 0.08),
                                    filter: isSelected || isHovered ? 'brightness(0.94)' : undefined,
                                    transform: isSelected || isHovered ? 'scale(1.01)' : undefined,
                                  }}
                                  onMouseEnter={() => setHoveredCrewCardId(card.id)}
                                  onMouseLeave={() => setHoveredCrewCardId(null)}
                                  onClick={() => {
                                    if (isSelected) {
                                      setCrewPanelCard(null);
                                    } else {
                                      setCrewPanelCard(card);
                                    }
                                  }}
                                >
                                  <CrewQuickLookCardGlass card={card} condensed={hasCrewPanel} />
                                </div>
                              );
                            })}
                          {filteredCrewCards.length === 0 && (
                            <div
                              style={{
                                textAlign: 'center',
                                padding: '2rem',
                                color: '#6B6B6B',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                              }}
                            >
                              No crew members found
                            </div>
                          )}
                        </div>

                        {/* Detail panel - expands in from right */}
                        <div
                          style={{
                            width: hasCrewPanel ? '80%' : '0%',
                            overflow: 'hidden',
                            borderRadius: '1.5rem',
                            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            willChange: 'width',
                          }}
                        >
                          {crewPanelCard && (
                            <CrewDashboardContent
                              crew={crewPanelCard}
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
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : activeView === 'roles' ? (
                /* Roles List View - Split Panel Layout (inside single card) */
                (() => {
                  // Filter role cards by search query
                  const filteredRoleCards = computedRoleCards.filter(card =>
                    card.name.toLowerCase().includes(roleSearchQuery.toLowerCase())
                  );
                  const roleTotalPages = Math.ceil(filteredRoleCards.length / ROLE_CARDS_PER_PAGE);
                  const showRolePagination = filteredRoleCards.length > ROLE_CARDS_PER_PAGE;
                  const hasRolePanel = rolePanelCard !== null;

                  return (
                    <div
                      className="ai-glass-border"
                      style={{
                        ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08),
                        ...aiGlassLightContentStyle('1.5rem', 0.6),
                        minHeight: '400px',
                      }}
                    >
                      {/* Embedded header with search bar and pagination */}
                      <div style={{ margin: '0', width: '100%' }}>
                        <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
                          <div className="flex items-center" style={{ width: '100%', gap: '12px' }}>
                            {/* Search bar - fills available space */}
                            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flex: 1, minWidth: 0 }}>
                              <div
                                className="flex items-center"
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.6),
                                  padding: '0 14px',
                                  height: '36px',
                                  width: '100%',
                                }}
                              >
                                <MagnifyingGlassIcon style={{ width: 14, height: 14, color: '#6B6B6B', flexShrink: 0 }} />
                                <input
                                  type="text"
                                  placeholder="Search roles..."
                                  value={roleSearchQuery}
                                  onChange={(e) => {
                                    setRoleSearchQuery(e.target.value);
                                    setRolePage(1);
                                  }}
                                  className="focus:outline-none focus:ring-0 flex-1"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#2C2C2C',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '14px',
                                    fontWeight: 400,
                                    width: '100%',
                                    marginLeft: '8px',
                                  }}
                                />
                              </div>
                            </div>
                            {/* Pagination - right aligned, only show if needed */}
                            {showRolePagination && (
                              <div
                                className="ai-glass-border"
                                style={{
                                  ...aiGlassLightBorderStyle('9999px'),
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  className="flex items-center gap-1"
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.4),
                                    padding: '0 6px',
                                    height: '36px',
                                  }}
                                >
                                  <button
                                    onClick={() => setRolePage(p => Math.max(1, p - 1))}
                                    disabled={rolePage === 1}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: '0 8px',
                                      cursor: rolePage === 1 ? 'default' : 'pointer',
                                      color: rolePage === 1 ? '#9A999E' : '#6B6B6B',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '14px',
                                    }}
                                  >
                                    ◀
                                  </button>
                                  <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '0 4px' }}>
                                    {rolePage} / {roleTotalPages}
                                  </span>
                                  <button
                                    onClick={() => setRolePage(p => Math.min(roleTotalPages, p + 1))}
                                    disabled={rolePage >= roleTotalPages}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: '0 8px',
                                      cursor: rolePage >= roleTotalPages ? 'default' : 'pointer',
                                      color: rolePage >= roleTotalPages ? '#9A999E' : '#6B6B6B',
                                      fontFamily: 'var(--font-open-sans)',
                                      fontSize: '14px',
                                    }}
                                  >
                                    ▶
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </GlassPillCard>
                      </div>

                      {/* Content area - flex row with list and panel side by side */}
                      <div className="flex" style={{ padding: '16px', gap: '16px' }}>
                        {/* List column - shrinks when panel open */}
                        <div
                          className="flex flex-col gap-3"
                          style={{
                            width: hasRolePanel ? '20%' : '100%',
                            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            flexShrink: 0,
                          }}
                        >
                          {filteredRoleCards
                            .slice((rolePage - 1) * ROLE_CARDS_PER_PAGE, rolePage * ROLE_CARDS_PER_PAGE)
                            .map((card) => {
                              const isSelected = rolePanelCard?.id === card.id;
                              const isHovered = hoveredRoleCardId === card.id;
                              return (
                                <div
                                  key={card.id}
                                  className="ai-glass-border cursor-pointer transition-all"
                                  style={{
                                    ...aiGlassLightBorderStyle('1rem', '0, 0, 0', isSelected || isHovered ? 0 : 0.08),
                                    filter: isSelected || isHovered ? 'brightness(0.94)' : undefined,
                                    transform: isSelected || isHovered ? 'scale(1.01)' : undefined,
                                  }}
                                  onMouseEnter={() => setHoveredRoleCardId(card.id)}
                                  onMouseLeave={() => setHoveredRoleCardId(null)}
                                  onClick={() => {
                                    if (isSelected) {
                                      setRolePanelCard(null);
                                    } else {
                                      setRolePanelCard(card);
                                    }
                                  }}
                                >
                                  <RoleQuickLookCardGlass card={card} condensed={hasRolePanel} />
                                </div>
                              );
                            })}
                          {filteredRoleCards.length === 0 && (
                            <div
                              style={{
                                textAlign: 'center',
                                padding: '2rem',
                                color: '#6B6B6B',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                              }}
                            >
                              No roles found
                            </div>
                          )}
                        </div>

                        {/* Detail panel - expands in from right */}
                        <div
                          style={{
                            width: hasRolePanel ? '80%' : '0%',
                            overflow: 'hidden',
                            borderRadius: '1.5rem',
                            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            willChange: 'width',
                          }}
                        >
                          {rolePanelCard && (
                            <RoleDashboardContent
                                role={rolePanelCard}
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
                                  const roleStats = lb.roleStats.find((r: any) => r.roleId === rolePanelCard.id);
                                  if (!roleStats || roleStats.giniCoefficient === null) return 0;
                                  return Math.round((1 - roleStats.giniCoefficient) * 10000) / 100;
                                }) || [0]}
                              />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  {/* Outer glass card wrapper with embedded header */}
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
                      selectedDates={timeSelectedDates}
                      onSelectionChange={setTimeSelectedDates}
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
                    {/* Mini cards - 2x2 grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <StatGraphCard key={0} data={currentDashboard.miniCards[0]} />
                      <StatGraphCard key={2} data={currentDashboard.miniCards[2]} />
                      <StatGraphCard key={3} data={currentDashboard.miniCards[3]} />
                      <StatGraphCard key={1} data={currentDashboard.miniCards[1]} />
                    </div>
                  </CardSmall>

                  {/* Crew preferences met by date line graph */}
                  <LargeGraphCard
                    title="Preferences met"
                    highlightLabel={overviewLineGraphLabel ?? undefined}
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
                      onActiveDataChange={setOverviewLineGraphActiveData}
                      onActiveLabelChange={setOverviewLineGraphLabel}
                      selectedIndex={overviewLineGraphSelectedIndex}
                      onSelectIndex={setOverviewLineGraphSelectedIndex}
                      data={computedSatisfactionByDate}
                    />
                  </LargeGraphCard>

                  {/* Satisfaction distribution box plot */}
                  <LargeGraphCard
                    title="Crew Preference Distribution"
                    highlightLabel={overviewBoxPlotLabel ?? undefined}
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
                        min: computedSatisfactionBoxPlot.min,
                        q1: computedSatisfactionBoxPlot.q1,
                        median: computedSatisfactionBoxPlot.median,
                        q3: computedSatisfactionBoxPlot.q3,
                        max: computedSatisfactionBoxPlot.max,
                      }]}
                      unit="%"
                      onActiveLabelChange={setOverviewBoxPlotLabel}
                    />
                  </LargeGraphCard>

                  {/* Crew preferences met graph */}
                  <LargeGraphCard
                    title="Crew preferences met"
                    highlightLabel={overviewPreferencesLabel ?? undefined}
                    highlightLabelColor="#2C2C2C"
                    className="mt-4"
                  >
                    <StackedPillBarGraph
                      preferenceData={computedPreferenceData}
                      onActiveLabelChange={setOverviewPreferencesLabel}
                    />
                  </LargeGraphCard>
                    </div>{/* End dashboard content */}
                  </div>{/* End outer glass card */}
                </>
              )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* User dropdown menu - rendered at root level with fixed positioning */}
      {isUserMenuOpen && userMenuRef.current && (
        <div
          ref={(el) => {
            userDropdownRef.current = el;
            if (el && userMenuRef.current) {
              const rect = userMenuRef.current.getBoundingClientRect();
              el.style.top = `${rect.bottom + 16}px`;
              el.style.left = `${rect.left}px`;
              el.style.width = `${rect.width}px`;
            }
          }}
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1rem', '0, 0, 0', 0.08),
            position: 'fixed',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1rem', 0.6),
              padding: '8px',
              position: 'relative',
              zIndex: 5,
            }}
          >
            {user && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#DBDADB',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: '#7C7F82',
                    marginTop: '2px',
                  }}
                >
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </div>
              </div>
            )}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  router.push('/admin');
                }}
                className="w-full transition-all"
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#DBDADB',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Back to stores
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full transition-all"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#DBDADB',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
