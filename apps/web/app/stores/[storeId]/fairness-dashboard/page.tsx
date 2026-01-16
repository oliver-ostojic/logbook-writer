'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon, PlusIcon, UserIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import Footer from '../../../../components/Footer';
import { StatGraphCard, statGraphCardStyles, GraphCardWithStatsTransparent, GraphCardSimple, SatisfactionLineGraph, CrewQuickLookCarousel, RoleQuickLookCarousel, CrewQuickLookCardStatic, RoleQuickLookCardStatic, defaultCrewCards, defaultRoleCards, CrewCardData, RoleCardData, RoleHeatmap, CrewFairnessTable } from './components';
import type { DashboardPanel, SidePanel, TimeInterval, DashboardDate } from '@logbook-writer/shared-types';
import { buildDashboardSnapshot } from '../../../../src/dashboard/buildDashboardSnapshot';
import type { DashboardSnapshot } from '../../../../src/dashboard/types';

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
// AI Glass Style Template - Reusable glass effect with border
// =============================================================================

// Border style - just sets up positioning for the pseudo-element border
// borderColor: RGB values as string e.g. "255, 255, 255" for white, "100, 150, 255" for blue
// borderOpacity: 0-1 value for border visibility
const aiGlassBorderStyle = (
  borderRadius: string | number = '1.5rem',
  borderColor?: string,
  borderOpacity?: number
): React.CSSProperties => ({
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
  position: 'relative' as const,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
  ...(borderColor && { '--border-color': borderColor } as React.CSSProperties),
  ...(borderOpacity !== undefined && { '--border-opacity': borderOpacity } as React.CSSProperties),
});

// Inner content styles (translucent with backdrop blur)
// opacity parameter: lower = more transparent/lighter, higher = more opaque/darker
const aiGlassContentStyle = (borderRadius: string | number = '1.5rem', opacity: number = 0.85): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  background: `rgba(28, 27, 31, ${opacity})`,
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
});

// Wrapper component for easy reuse
interface AiGlassCardProps {
  children: React.ReactNode;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
}

const AiGlassCard: React.FC<AiGlassCardProps> = ({ 
  children, 
  borderRadius = '1.5rem', 
  className = '',
  style = {},
  contentStyle = {},
}) => (
  <div className="ai-glass-border" style={{ ...aiGlassBorderStyle(borderRadius), ...style }} data-radius={typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius}>
    <div 
      className={className}
      style={{ ...aiGlassContentStyle(borderRadius), ...contentStyle }}
    >
      {children}
    </div>
  </div>
);

// =============================================================================

// Flowing gradient animation - colors morph into each other
const blobAnimationStyles = `
  .ai-glass-border {
    position: relative;
    --border-color: 255, 255, 255; /* Default: white, can be overridden inline */
    --border-opacity: 0.11;
  }
  .ai-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes flowingGradient {
    0% {
      background-position: 0% 50%;
      filter: hue-rotate(0deg);
    }
    25% {
      background-position: 50% 100%;
    }
    50% {
      background-position: 100% 50%;
      filter: hue-rotate(15deg);
    }
    75% {
      background-position: 50% 0%;
    }
    100% {
      background-position: 0% 50%;
      filter: hue-rotate(0deg);
    }
  }
  @keyframes flowingGradientReverse {
    0% {
      background-position: 100% 50%;
      filter: hue-rotate(0deg);
    }
    25% {
      background-position: 50% 0%;
    }
    50% {
      background-position: 0% 50%;
      filter: hue-rotate(-15deg);
    }
    75% {
      background-position: 50% 100%;
    }
    100% {
      background-position: 100% 50%;
      filter: hue-rotate(0deg);
    }
  }
  @keyframes flowDiagonal {
    0% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 100% 100%;
    }
    100% {
      background-position: 0% 0%;
    }
  }
  @keyframes flowDiagonalReverse {
    0% {
      background-position: 100% 0%;
    }
    50% {
      background-position: 0% 100%;
    }
    100% {
      background-position: 100% 0%;
    }
  }
  @keyframes flowVertical {
    0% {
      background-position: 50% 0%;
    }
    50% {
      background-position: 50% 100%;
    }
    100% {
      background-position: 50% 0%;
    }
  }
  @keyframes flowCircular {
    0% {
      background-position: 50% 0%;
    }
    25% {
      background-position: 100% 50%;
    }
    50% {
      background-position: 50% 100%;
    }
    75% {
      background-position: 0% 50%;
    }
    100% {
      background-position: 50% 0%;
    }
  }
  @keyframes floatFree1 {
    0% { transform: translate(0%, 0%) scale(1); }
    20% { transform: translate(15%, -25%) scale(1.2); }
    40% { transform: translate(-10%, 20%) scale(0.8); }
    60% { transform: translate(25%, 10%) scale(1.1); }
    80% { transform: translate(-20%, -15%) scale(0.9); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree2 {
    0% { transform: translate(0%, 0%) scale(1); }
    25% { transform: translate(-20%, 15%) scale(0.9); }
    50% { transform: translate(10%, -20%) scale(1.3); }
    75% { transform: translate(20%, 25%) scale(0.7); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree3 {
    0% { transform: translate(0%, 0%) scale(1); }
    15% { transform: translate(20%, 20%) scale(1.1); }
    35% { transform: translate(-15%, -10%) scale(0.85); }
    55% { transform: translate(-25%, 15%) scale(1.25); }
    75% { transform: translate(10%, -25%) scale(0.95); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree4 {
    0% { transform: translate(0%, 0%) scale(1); }
    30% { transform: translate(-10%, -20%) scale(1.15); }
    50% { transform: translate(25%, 5%) scale(0.8); }
    70% { transform: translate(-5%, 25%) scale(1.2); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree5 {
    0% { transform: translate(0%, 0%) scale(1); }
    20% { transform: translate(10%, 15%) scale(0.9); }
    45% { transform: translate(-20%, -5%) scale(1.3); }
    65% { transform: translate(15%, -20%) scale(0.85); }
    85% { transform: translate(-15%, 10%) scale(1.1); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree6 {
    0% { transform: translate(0%, 0%) scale(1); }
    25% { transform: translate(-25%, -15%) scale(1.2); }
    55% { transform: translate(20%, 20%) scale(0.75); }
    80% { transform: translate(5%, -25%) scale(1.15); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes iosWiggle {
    0% { transform: rotate(-1deg); }
    25% { transform: rotate(1deg); }
    50% { transform: rotate(-1deg); }
    75% { transform: rotate(1deg); }
    100% { transform: rotate(-1deg); }
  }
  .ios-wiggle {
    animation: iosWiggle 0.3s ease-in-out infinite;
  }
  @keyframes settleDown {
    0% {
      transform: rotate(-1deg) scale(1.02);
      filter: brightness(1.1);
    }
    50% {
      transform: rotate(0deg) scale(1.05);
      filter: brightness(1.15);
    }
    100% {
      transform: rotate(0deg) scale(1);
      filter: brightness(1);
    }
  }
  .settle-animation {
    animation: settleDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
`;

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

// Helper component for list row with hover state
function ListRowItem({ 
  itemNumber, 
  isFirst, 
  isLast, 
  children,
  onClick
}: { 
  itemNumber: number; 
  isFirst: boolean; 
  isLast: boolean; 
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      className="flex" 
      style={{ position: 'relative', gap: 16 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Number column with lines */}
      <div className="flex flex-col items-center" style={{ width: 24, position: 'relative' }}>
        {/* Top line for first item - half height, faded at both ends */}
        {isFirst && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: 'calc(50% - 12px)',
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(255,255,255,0.15) 40%, transparent 95%, transparent 100%)',
            }}
          />
        )}
        {/* Number badge - centered */}
        <div 
          className="flex items-center justify-center rounded-full transition-all duration-200 circle-button-glass-border"
          style={{
            width: 24,
            height: 24,
            background: isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
          }}
        >
          <span
            className="text-[11px] transition-colors duration-200"
            style={{
              fontFamily: 'var(--font-open-sans)',
              color: isHovered ? '#DBDADB' : '#7C7F82',
              fontWeight: 350,
            }}
          >
            {itemNumber}
          </span>
        </div>
        {/* Connecting line to next number - spans from bottom of this number to top of next */}
        {!isLast && (
          <div 
            style={{
              position: 'absolute',
              top: 'calc(50% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: 'calc(100% - 24px + 12px)',
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.15) 60%, transparent 95%, transparent 100%)',
            }}
          />
        )}
        {/* Bottom line for last item - half height, faded at both ends */}
        {isLast && (
          <div 
            style={{
              position: 'absolute',
              top: 'calc(50% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: 'calc(50% - 12px)',
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(255,255,255,0.15) 60%, transparent 95%, transparent 100%)',
            }}
          />
        )}
      </div>
      <div
        className="flex-1 ai-glass-border"
        style={{
          ...aiGlassBorderStyle('1rem', '180, 170, 200', 0.15),
          overflow: 'hidden',
        }}
      >
        <div style={{ ...aiGlassContentStyle('1rem', 0.75), position: 'relative', zIndex: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function FairnessDashboardPage() {
  const params = useParams();
  const storeId = params.storeId as string;

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
  const [expandedQuickLook, setExpandedQuickLook] = useState<'crew' | 'roles' | 'none'>('none');
  const [selectedCrew, setSelectedCrew] = useState<CrewCardData | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleCardData | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [crewPage, setCrewPage] = useState(1);
  const [rolePage, setRolePage] = useState(1);
  const [crewSearchQuery, setCrewSearchQuery] = useState('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  
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

  // Generate month options for the selected year
  const generateMonthOptions = (year: number) => {
    return [
      { value: 'Jan', label: '', days: getDaysInMonth(year, 0), startDay: getMonthStartDay(year, 0) },
      { value: 'Feb', label: '', days: getDaysInMonth(year, 1), startDay: getMonthStartDay(year, 1) },
      { value: 'Mar', label: '', days: getDaysInMonth(year, 2), startDay: getMonthStartDay(year, 2) },
      { value: 'Apr', label: '', days: getDaysInMonth(year, 3), startDay: getMonthStartDay(year, 3) },
      { value: 'May', label: '', days: getDaysInMonth(year, 4), startDay: getMonthStartDay(year, 4) },
      { value: 'Jun', label: '', days: getDaysInMonth(year, 5), startDay: getMonthStartDay(year, 5) },
      { value: 'Jul', label: '', days: getDaysInMonth(year, 6), startDay: getMonthStartDay(year, 6) },
      { value: 'Aug', label: '', days: getDaysInMonth(year, 7), startDay: getMonthStartDay(year, 7) },
      { value: 'Sep', label: '', days: getDaysInMonth(year, 8), startDay: getMonthStartDay(year, 8) },
      { value: 'Oct', label: '', days: getDaysInMonth(year, 9), startDay: getMonthStartDay(year, 9) },
      { value: 'Nov', label: '', days: getDaysInMonth(year, 10), startDay: getMonthStartDay(year, 10) },
      { value: 'Dec', label: '', days: getDaysInMonth(year, 11), startDay: getMonthStartDay(year, 11) },
    ];
  };
  
  const selectedYear = availableYears[yearSelectionIndex] || new Date().getFullYear();
  const monthOptions = generateMonthOptions(selectedYear);
  const monthCardCount = monthOptions.length;

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
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
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
        title: 'Preferences met',
        value: Math.round((aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0) * 100) / 100,
        unit: '%',
        status: 'Crew',
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
      console.log('📊 Using default crew cards (no snapshot data)');
      return defaultCrewCards;
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
      console.log('📊 Using default role cards (no snapshot data)');
      return defaultRoleCards;
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
  const computedRoleHeatmap = React.useMemo(() => {
    if (!dashboardSnapshot || !selectedRole) {
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
        const minutes = cs.avgMinutesPerAssignmentByRole[selectedRole.id] || 0;
        return minutes > 0;
      });

      const totalMinutes = roleStats.reduce((sum, cs) => sum + (cs.avgMinutesPerAssignmentByRole[selectedRole.id] || 0), 0);
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
  }, [dashboardSnapshot, selectedRole]);

  // Compute crew fairness table data for selected role
  const computedCrewFairnessTable = React.useMemo(() => {
    if (!dashboardSnapshot || !selectedRole) {
      return [];
    }

    const crewRollups = dashboardSnapshot.selection.selectionCrewRollups;
    const roleId = selectedRole.id;

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
  }, [dashboardSnapshot, selectedRole]);

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
    setExpandedQuickLook(loadState('expandedQuickLook', 'none'));
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
    saveState('expandedQuickLook', expandedQuickLook);
  }, [expandedQuickLook, mounted]);

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
      setExpandedQuickLook('crew');
    }
  }, [dashboardSnapshot, selectedCrewId, selectedCrew, computedCrewCards]);

  useEffect(() => {
    if (!dashboardSnapshot || !selectedRoleId || selectedRole) return;
    const role = computedRoleCards.find(r => r.id === selectedRoleId);
    if (role) {
      setSelectedRole(role);
      setExpandedQuickLook('roles');
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
        // Build array of selected dates from calendar
        const selectedDateStrings: string[] = [];
        for (const [key, daysSet] of Object.entries(selectedDays)) {
          // Key format is "year-monthIndex"
          const [yearStr, monthIndexStr] = key.split('-');
          const year = parseInt(yearStr, 10);
          const monthIndex = parseInt(monthIndexStr, 10);

          // Add each selected day
          for (const day of Array.from(daysSet)) {
            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            selectedDateStrings.push(dateStr);
          }
        }

        // If no dates selected, use available dates (all logbook dates)
        const datesToFetch = selectedDateStrings.length > 0 ? selectedDateStrings : availableDates;

        console.log('📊 Fetching data for dates:', {
          selectedCount: selectedDateStrings.length,
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
  }, [storeId, selectedDays, availableDates]);

  return (
    <main className="bg-black min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: blobAnimationStyles + statGraphCardStyles }} />
      <div className="bg-black min-h-screen">
        {/* Floating pill header - positioned to align with dashboard content */}
        <div className="fixed top-4 left-0 right-0 px-6 lg:px-8" style={{ zIndex: 200 }}>
          {/* Flex container: empty left spacer, centered nav, right-aligned user button */}
          <div className="flex items-center justify-between">
            {/* Left spacer - same width as user button for centering */}
            <div style={{ width: 48, height: 48 }} />
            
            {/* Centered nav menu */}
            <div className="ai-glass-border" style={{ ...aiGlassBorderStyle('9999px') }}>
              <nav
                style={{
                  ...aiGlassContentStyle('9999px'),
                  padding: '12px 36px',
                }}
              >
                <div className="flex items-center gap-9">
                  <a
                    href={`/stores/${storeId}/home`}
                    className="text-base transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontWeight: 400 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#9A999E'}
                  >
                    Home
                  </a>
                  <a
                    href={`/stores/${storeId}/crew`}
                    className="text-base transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontWeight: 400 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#9A999E'}
                  >
                    Crew
                  </a>
                  <a
                    href={`/stores/${storeId}/fairness-dashboard`}
                    className="text-base transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#FFFFFF', fontWeight: 500 }}
                  >
                    Dashboard
                  </a>
                  <a
                    href={`/stores/${storeId}/settings`}
                    className="text-base transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontWeight: 400 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#9A999E'}
                  >
                    Settings
                  </a>
                </div>
              </nav>
            </div>
          
            {/* User account circle - right side */}
            <div
              className="ai-glass-border"
              style={{
                ...aiGlassBorderStyle('9999px'),
                width: 48,
                height: 48,
              }}
            >
              <button
                className="flex items-center justify-center transition-all"
                style={{
                  ...aiGlassContentStyle('9999px'),
                  background: 'rgba(255, 255, 255, 0.01)',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)'}
              >
                <UserIcon className="w-5 h-5" style={{ color: '#9A999E' }} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 lg:px-8 pt-20 pb-9">
          {/* Main content area */}
          <div className="flex flex-col min-[1200px]:flex-row gap-3">
            {/* Left card - dashboard (full width when stacked, 55% when side-by-side) */}
            <div
              className="w-full min-[1200px]:w-[55%] rounded-3xl px-4 py-4 relative"
              style={{ 
                background: '#141318',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Header card - Dashboard title, dropdown, and date */}
              <div
                className="flex flex-col mb-4 ai-glass-border"
                style={{
                  ...aiGlassBorderStyle('1.5rem', '180, 170, 200', 0.15),
                  ...aiGlassContentStyle('1.5rem'),
                  height: 'auto',
                  padding: 16,
                  zIndex: 50,
                }}
              >
                <div className="relative flex items-center justify-center">
                  {/* Left: Dropdown for view selection */}
                  <Menu as="div" className="absolute left-0" style={{ zIndex: 100 }}>
                    <div className="ai-glass-border" style={{ ...aiGlassBorderStyle('9999px') }}>
                      <MenuButton
                        className="inline-flex items-center text-med focus:outline-none focus:ring-0 transition-all"
                        style={{
                          position: 'relative' as const,
                          zIndex: 0,
                          width: '100%',
                          height: '100%',
                          background: 'hsla(0, 84%, 60%, 0.7)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          borderRadius: '9999px',
                          fontFamily: 'var(--font-open-sans)',
                          color: '#FFFFFF',
                          fontWeight: 500,
                          padding: '6px 14px',
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'hsla(0, 84%, 55%, 0.85)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'hsla(0, 84%, 60%, 0.7)'}
                      >
                        {DASHBOARD_VIEWS.find(v => v.id === activeView)?.name || 'Overview'}
                      </MenuButton>
                    </div>
                    <MenuItems
                      anchor="bottom start"
                      portal={false}
                      transition
                      className="w-40 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                      style={{ 
                        zIndex: 100,
                        ...aiGlassBorderStyle('0.75rem'),
                        marginTop: 8,
                      }}
                    >
                      <div 
                        className="py-1"
                        style={{
                          ...aiGlassContentStyle('0.75rem'),
                        }}
                      >
                        {DASHBOARD_VIEWS.map((view) => (
                          <MenuItem key={view.id}>
                            <div className="flex items-center justify-between px-4 py-2">
                              <button
                                onClick={() => {
                                  setActiveView(view.id);
                                  setSelectedCrew(null);
                                  setSelectedRole(null);
                                  setSelectedCrewId(null);
                                  setSelectedRoleId(null);
                                  if (view.id === 'crew') {
                                    setCrewPage(1);
                                    setExpandedQuickLook('crew');
                                  } else if (view.id === 'roles') {
                                    setRolePage(1);
                                    setExpandedQuickLook('roles');
                                  } else {
                                    setExpandedQuickLook('none');
                                  }
                                }}
                                className="text-left text-sm focus:outline-none flex-1"
                                style={{ 
                                  fontFamily: 'var(--font-open-sans)',
                                  color: activeView === view.id ? '#DBDADB' : '#7C7F82',
                                  backgroundColor: 'transparent',
                                }}
                                onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = '#3D3C3F'}
                                onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                              >
                                {view.name}
                              </button>
                            </div>
                          </MenuItem>
                        ))}
                      </div>
                    </MenuItems>
                  </Menu>

                  {/* Center: Dashboard title */}
                  <h2 className="text-med" style={{ fontFamily: 'var(--font-open-sans)', color: '#DBDADB', fontWeight: 350 }}>
                    {!mounted ? 'Dashboard' : selectedCrew ? selectedCrew.title : selectedRole ? selectedRole.name : expandedQuickLook !== 'none' ? 'List view' : 'Dashboard'}
                  </h2>

                  {/* Right: Back button for non-overview views */}
                  {activeView !== 'overview' && (
                    <button
                      onClick={() => {
                        // If viewing individual crew/role, go back to their list view
                        if (selectedCrew) {
                          setSelectedCrew(null);
                          setSelectedCrewId(null);
                          setExpandedQuickLook('crew');
                        } else if (selectedRole) {
                          setSelectedRole(null);
                          setSelectedRoleId(null);
                          setExpandedQuickLook('roles');
                        } else {
                          // From list view, go back to overview
                          setActiveView('overview');
                          setExpandedQuickLook('none');
                        }
                      }}
                      className="absolute right-0 transition-all duration-200"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        fontWeight: 400,
                        color: '#7C7F82',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#DBDADB';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#7C7F82';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      Back
                    </button>
                  )}
                </div>
              </div>
              
              {/* Conditional content: Individual Crew Dashboard, Dashboard, or Expanded Quick Looks */}
              {selectedCrew ? (
                /* Individual Crew Dashboard */
                <div
                  className="animate-in fade-in slide-in-from-bottom-4 duration-300"
                  style={{ animationFillMode: 'both' }}
                >
                  {/* 2 Mini cards in a row - wrapped in translucent card */}
                  <div
                    className="graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {/* Time per shift bar chart - uses avgMinutesPerRole (matches overview format) */}
                      {(() => {
                        const roleData = selectedCrew.avgMinutesPerRole || [];
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
                          value: selectedCrew.satisfactionScore ?? 67.5,
                          unit: '%',
                          status: `${selectedCrew.preferencesMetCount ?? 0}/${selectedCrew.preferencesTotal ?? 0}`,
                          pieData: { 
                            met: selectedCrew.satisfactionScore ?? 67.5, 
                            notMet: 100 - (selectedCrew.satisfactionScore ?? 67.5) 
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
                  </div>

                  {/* Crew preferences met by date line graph */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <SatisfactionLineGraph
                      title="Crew preferences met by date"
                      data={(() => {
                          const satByDate = selectedCrew.satisfactionByDate || [];
                          if (satByDate.length === 0) {
                            // Fallback to placeholder data
                            return [
                              { shiftNumber: 1, shiftDate: '—', satisfaction: 70 },
                            ];
                          }
                          return satByDate.map((d, index) => {
                            // Parse date string manually to avoid timezone issues
                            // Date format is "YYYY-MM-DD"
                            const [year, month, day] = d.date.split('-').map(Number);
                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const monthName = monthNames[month - 1]; // month is 1-indexed in ISO string
                            const yearShort = String(year).slice(-2);
                            return {
                              shiftNumber: index + 1,
                              shiftDate: `${day} ${monthName}, ${yearShort}`,
                              satisfaction: Math.round(d.satisfactionPct * 100) / 100,
                            };
                          });
                        })()}
                      />
                    </div>

                  {/* Satisfaction distribution box plot - only show if there's variance */}
                  {(() => {
                    // Check if there's variance before rendering the entire section
                    const values = (selectedCrew.satisfactionByDate || [])
                      .map(d => d.satisfactionPct)
                      .sort((a, b) => a - b);

                    // Don't show box plot if no data or no variance
                    if (values.length === 0 || values[0] === values[values.length - 1]) {
                      return null;
                    }

                    return (
                      <div
                        className="mt-4 graph-container-glass-border"
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                          borderRadius: '1.5rem',
                          padding: 16,
                        }}
                      >
                        {(() => {
                          // Compute box plot stats from satisfactionByDate
                          console.log('📊 Box plot - selectedCrew.satisfactionByDate:', selectedCrew.satisfactionByDate);
                          console.log('📊 Box plot - values after sort:', values);

                          const min = values[0];
                          const max = values[values.length - 1];

                          const median = values.length % 2 === 0
                            ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
                            : values[Math.floor(values.length / 2)];

                          // Q1: median of lower half
                          const lowerHalf = values.slice(0, Math.floor(values.length / 2));
                          const q1 = lowerHalf.length > 0
                            ? (lowerHalf.length % 2 === 0
                              ? (lowerHalf[lowerHalf.length / 2 - 1] + lowerHalf[lowerHalf.length / 2]) / 2
                              : lowerHalf[Math.floor(lowerHalf.length / 2)])
                            : min;

                          // Q3: median of upper half
                          const upperHalf = values.slice(Math.ceil(values.length / 2));
                          const q3 = upperHalf.length > 0
                            ? (upperHalf.length % 2 === 0
                              ? (upperHalf[upperHalf.length / 2 - 1] + upperHalf[upperHalf.length / 2]) / 2
                              : upperHalf[Math.floor(upperHalf.length / 2)])
                            : max;

                          // Outliers: values outside 1.5 * IQR
                          const iqr = q3 - q1;
                          const lowerBound = q1 - 1.5 * iqr;
                          const upperBound = q3 + 1.5 * iqr;
                          const outliers = values.filter(v => v < lowerBound || v > upperBound);

                          // Adjust min/max to exclude outliers for whiskers
                          const whiskerMin = values.find(v => v >= lowerBound) ?? min;
                          const whiskerMax = [...values].reverse().find(v => v <= upperBound) ?? max;

                          return (
                            <GraphCardWithStatsTransparent
                              title="Shift satisfaction spread"
                              boxPlotType="satisfaction"
                              isSingleCrew={true}
                              boxPlotData={{
                                min: Math.round(whiskerMin * 100) / 100,
                                q1: Math.round(q1 * 100) / 100,
                                median: Math.round(median * 100) / 100,
                                q3: Math.round(q3 * 100) / 100,
                                max: Math.round(whiskerMax * 100) / 100,
                                outliers: outliers.map(o => Math.round(o * 100) / 100),
                              }}
                            />
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Preferences met graph - individual crew level */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardSimple
                      title="Preferences met"
                      preferenceData={(selectedCrew.preferenceBreakdownByRuleType || []).map(b => {
                        // Find a roleRule of this type to get its description
                        const rule = roleRules.find(r => r.type === b.ruleType);
                        return {
                          label: formatRuleTypeLabel(b.ruleType),
                          description: rule?.description,
                          totalCount: b.total,
                          satisfiedCount: b.met,
                        };
                      })}
                      />
                    </div>
                </div>
              ) : selectedRole ? (
                /* Individual Role Dashboard */
                <>
                  {/* 2 Mini cards in a row - Fairness Index and Time Share */}
                  <div
                    className="graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                    <StatGraphCard
                      data={{
                        type: 'sparkline',
                        title: 'Fairness index',
                        value: selectedRole.avgFairnessIndexPct !== null && selectedRole.avgFairnessIndexPct !== undefined
                          ? Math.round(selectedRole.avgFairnessIndexPct * 100) / 100
                          : Math.round((1 - selectedRole.giniCoefficient) * 10000) / 100,
                        unit: '%',
                        status: selectedRole.trend === 'improving' ? 'Good' : selectedRole.trend === 'worsening' ? 'Alert' : 'Stable',
                        sparklineData: dashboardSnapshot?.selection.logbooks.map(lb => {
                          const roleStats = lb.roleStats.find((r: any) => r.roleId === selectedRole.id);
                          if (!roleStats || roleStats.giniCoefficient === null) return 0;
                          const fairnessIndex = (1 - roleStats.giniCoefficient) * 100;
                          return Math.round(fairnessIndex * 100) / 100;
                        }) || [0],
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
                        value: Math.round((selectedRole.minutesOnRoleVsTotalWorkPct || 0) * 100) / 100,
                        unit: '%',
                        status: `${Math.round((selectedRole.minutesWorkedOnRoleTotal || 0) / 60 * 10) / 10} / ${Math.round((selectedRole.totalMinutesWorkedSelection || 0) / 60 * 10) / 10} hr`,
                        pieData: { 
                          met: selectedRole.minutesOnRoleVsTotalWorkPct || 0, 
                          notMet: 100 - (selectedRole.minutesOnRoleVsTotalWorkPct || 0) 
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
                  </div>

                  {/* Crew mins distribution box plot */}
                  {computedRoleBoxPlot.hasDistribution && (
                    <div
                      className="mt-4 graph-container-glass-border"
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                        borderRadius: '1.5rem',
                        padding: 16,
                      }}
                    >
                      <GraphCardWithStatsTransparent
                        title="Crew mins/shift spread"
                        boxPlotData={computedRoleBoxPlot}
                        boxPlotType="time"
                      />
                    </div>
                  )}

                  {/* Role assignment heatmap */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <RoleHeatmap
                      title="Avg hours/crew by day"
                      weeks={computedRoleHeatmap.weeks}
                      data={computedRoleHeatmap.data}
                    />
                  </div>

                  {/* Crew fairness details table */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <CrewFairnessTable
                      title="Assignment info"
                      data={computedCrewFairnessTable}
                    />
                  </div>
                </>
              ) : expandedQuickLook === 'none' ? (
                <>
                  {/* Fairness Summary Section */}
                  <div
                    className="graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <StatGraphCard key={0} data={currentDashboard.miniCards[0]} />
                      <StatGraphCard key={2} data={currentDashboard.miniCards[2]} />
                    </div>
                  </div>

                  {/* Crew Summary Section */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <StatGraphCard key={3} data={currentDashboard.miniCards[3]} />
                      <StatGraphCard key={1} data={currentDashboard.miniCards[1]} />
                    </div>
                  </div>

                  {/* Crew preferences met by date line graph */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <SatisfactionLineGraph
                      title="Crew preferences met by date"
                      data={computedSatisfactionByDate}
                    />
                  </div>

                  {/* Satisfaction distribution box plot */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardWithStatsTransparent
                      title="Satisfaction distribution"
                      boxPlotData={computedSatisfactionBoxPlot}
                      boxPlotType="satisfaction"
                    >
                      {/* Additional graph content can go here */}
                    </GraphCardWithStatsTransparent>
                  </div>

                  {/* Crew preferences met graph */}
                  <div
                    className="mt-4 graph-container-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1.5rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardSimple
                      title="Crew preferences met"
                      preferenceData={computedPreferenceData}
                    />
                  </div>
                </>
              ) : (
                /* Expanded Quick Looks - Single Column with Pagination */
                <div 
                  className="graph-container-glass-border"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                    borderRadius: '1.5rem',
                    padding: 16,
                    overflow: 'hidden',
                  }}
                >
                <div className="flex flex-col flex-1 relative">
                  {/* Search Button and Bar - Positioned in left corner above number circles */}
                  <div 
                    style={{ 
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 4,
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                    }}
                  >
                    {/* Search button - width matches number column (24px) for alignment */}
                    <div
                      className="ai-glass-border"
                      style={{
                        ...aiGlassBorderStyle('9999px'),
                        width: 26,
                        height: 26,
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                        className="flex items-center justify-center transition-all"
                        style={{
                          ...aiGlassContentStyle('9999px'),
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                      >
                        <MagnifyingGlassIcon style={{ width: 14, height: 12, color: '#9A999E' }} />
                      </button>
                    </div>
                    
                    {/* Expanded search pill - appears next to button */}
                    {isSearchExpanded && (
                      <div
                        className="ai-glass-border"
                        style={{
                          ...aiGlassBorderStyle('9999px'),
                          flex: 1,
                          height: 30,
                        }}
                      >
                        <div
                          className="flex items-center"
                          style={{
                            ...aiGlassContentStyle('9999px'),
                            padding: '0 16px',
                          }}
                        >
                          <input
                            type="text"
                            placeholder="Search"
                            value={expandedQuickLook === 'crew' ? crewSearchQuery : roleSearchQuery}
                            onChange={(e) => {
                              if (expandedQuickLook === 'crew') {
                                setCrewSearchQuery(e.target.value);
                                setCrewPage(1);
                              } else {
                                setRoleSearchQuery(e.target.value);
                                setRolePage(1);
                              }
                            }}
                            onBlur={() => {
                              const query = expandedQuickLook === 'crew' ? crewSearchQuery : roleSearchQuery;
                              if (!query.trim()) {
                                setIsSearchExpanded(false);
                              }
                            }}
                            autoFocus
                            className="focus:outline-none focus:ring-0 flex-1"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#FFFFFF',
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              fontWeight: 400,
                              width: '100%',
                            }}
                          />
                          {(expandedQuickLook === 'crew' ? crewSearchQuery : roleSearchQuery) && (
                            <button
                              onClick={() => {
                                if (expandedQuickLook === 'crew') {
                                  setCrewSearchQuery('');
                                  setCrewPage(1);
                                } else {
                                  setRoleSearchQuery('');
                                  setRolePage(1);
                                }
                                setIsSearchExpanded(false);
                              }}
                              className="transition-all hover:brightness-125"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#9A999E',
                                cursor: 'pointer',
                                padding: 0,
                                marginLeft: 12,
                                fontSize: '16px',
                                lineHeight: 1,
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div 
                    className="flex flex-col gap-3 flex-1"
                    style={{ 
                      paddingRight: '4px',
                      paddingTop: '46px',
                    }}
                  >
                    {expandedQuickLook === 'crew' && (
                      <>
                        {(() => {
                          const filteredCrewCards = computedCrewCards.filter(card =>
                            card.title.toLowerCase().includes(crewSearchQuery.toLowerCase())
                          );
                          return filteredCrewCards
                            .slice((crewPage - 1) * CREW_CARDS_PER_PAGE, crewPage * CREW_CARDS_PER_PAGE)
                            .map((card, index, arr) => {
                              const itemNumber = (crewPage - 1) * CREW_CARDS_PER_PAGE + index + 1;
                              const isFirst = index === 0;
                              const isLast = index === arr.length - 1;
                              return (
                                <ListRowItem
                                  key={card.id}
                                  itemNumber={itemNumber}
                                  isFirst={isFirst}
                                  isLast={isLast}
                                  onClick={() => {
                                    setSelectedCrew(card);
                                    setSelectedRole(null); // Clear any selected role
                                    setSelectedRoleId(null); // Clear role ID from localStorage
                                    setExpandedQuickLook('none'); // Reset so expand button shows "expand"
                                  setActiveView('crew'); // Sync dropdown to show "Crew"
                                }}
                              >
                                <CrewQuickLookCardStatic 
                                  card={card} 
                                  onClick={() => {
                                    setSelectedCrew(card);
                                    setSelectedRole(null); // Clear any selected role
                                    setSelectedRoleId(null); // Clear role ID from localStorage
                                    setExpandedQuickLook('none'); // Reset so expand button shows "expand"
                                    setActiveView('crew'); // Sync dropdown to show "Crew"
                                  }}
                                />
                              </ListRowItem>
                            );
                          });
                        })()}
                      </>
                    )}
                    {expandedQuickLook === 'roles' && (
                      <>
                        {(() => {
                          const filteredRoleCards = computedRoleCards.filter(card =>
                            card.name.toLowerCase().includes(roleSearchQuery.toLowerCase())
                          );
                          return filteredRoleCards
                            .slice((rolePage - 1) * ROLE_CARDS_PER_PAGE, rolePage * ROLE_CARDS_PER_PAGE)
                            .map((card, index, arr) => {
                              const itemNumber = (rolePage - 1) * ROLE_CARDS_PER_PAGE + index + 1;
                              const isFirst = index === 0;
                              const isLast = index === arr.length - 1;
                              return (
                                <ListRowItem 
                                  key={card.id} 
                                  itemNumber={itemNumber} 
                                  isFirst={isFirst} 
                                  isLast={isLast}
                                  onClick={() => {
                                    setSelectedRole(card);
                                    setSelectedCrew(null);
                                    setSelectedCrewId(null);
                                    setExpandedQuickLook('none');
                                    setActiveView('roles');
                                  }}
                                >
                                  <RoleQuickLookCardStatic 
                                    card={card} 
                                    onClick={() => {
                                      setSelectedRole(card);
                                      setSelectedCrew(null);
                                      setSelectedCrewId(null);
                                      setExpandedQuickLook('none');
                                      setActiveView('roles');
                                    }}
                                  />
                                </ListRowItem>
                              );
                            });
                        })()}
                      </>
                    )}
                  </div>
                  
                  {/* Pagination buttons */}
                  <div 
                    className="flex items-center justify-center gap-2 mt-4 pt-3"
                    style={{ 
                      borderTop: 'none',
                      position: 'relative',
                    }}
                  >
                    {/* Faded divider line */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 1,
                        background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.10) 60%, transparent 100%)',
                      }}
                    />
                    {(() => {
                      const cardsPerPage = expandedQuickLook === 'crew' ? CREW_CARDS_PER_PAGE : ROLE_CARDS_PER_PAGE;
                      const filteredCards = expandedQuickLook === 'crew'
                        ? computedCrewCards.filter(card => card.title.toLowerCase().includes(crewSearchQuery.toLowerCase()))
                        : computedRoleCards.filter(card => card.name.toLowerCase().includes(roleSearchQuery.toLowerCase()));
                      const totalCards = filteredCards.length;
                      const totalPages = Math.ceil(totalCards / cardsPerPage);
                      const currentPage = expandedQuickLook === 'crew' ? crewPage : rolePage;
                      const setPage = expandedQuickLook === 'crew' ? setCrewPage : setRolePage;
                      
                      if (totalPages <= 1) return null;
                      
                      const pages: (number | string)[] = [];
                      if (totalPages <= 5) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                      } else {
                        pages.push(1);
                        if (currentPage > 3) pages.push('...');
                        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                          if (!pages.includes(i)) pages.push(i);
                        }
                        if (currentPage < totalPages - 2) pages.push('...');
                        if (!pages.includes(totalPages)) pages.push(totalPages);
                      }
                      
                      return pages.map((page, idx) => (
                        page === '...' ? (
                          <span 
                            key={`ellipsis-${idx}`}
                            className="text-sm px-1"
                            style={{ color: '#7C7F82', fontFamily: 'var(--font-open-sans)' }}
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={page}
                            onClick={() => setPage(page as number)}
                            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 hover:brightness-125"
                            style={{
                              background: 'rgba(255, 255, 255, 0.25)',
                              backdropFilter: 'blur(12px)',
                              WebkitBackdropFilter: 'blur(12px)',
                              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                              cursor: 'pointer',
                              opacity: currentPage === page ? 1 : 0.5,
                            }}
                          >
                            <span
                              className="text-[12px]"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                color: '#DBDADB',
                                fontWeight: 350,
                              }}
                            >
                              {page}
                            </span>
                          </button>
                        )
                      ));
                    })()}
                  </div>
                </div>
                </div>
              )}
            </div>

            {/* Right card - Quick Looks (full width when stacked, 45% when side-by-side) */}
            <div
              className="w-full min-[1200px]:w-[45%] rounded-3xl px-4 py-4 graph-container-glass-border" 
              style={{ 
                backgroundColor: '#141318',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
              }}
            >
              {/* Time Selection - always visible */}
              <div className="flex flex-col graph-container-glass-border" style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                    borderRadius: '1.5rem',
                    overflow: 'visible',
                    paddingTop: 16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 22,
                    gap: 16,
                  }}>
                    {/* Title inside container */}
                    <div className="flex items-center justify-between">
                      <div className="ai-glass-border" style={{ ...aiGlassBorderStyle('9999px'), display: 'inline-block' }}>
                        <div
                          style={{
                            ...aiGlassContentStyle('9999px'),
                            padding: '6px 14px',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#DBDADB',
                          }}
                        >
                          Time Selection
                        </div>
                      </div>
                    </div>
                    
                    {/* Year carousel row */}
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        className="flex items-center justify-center transition-all circle-button-glass-border"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.25)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          opacity: yearSelectionIndex > 0 ? 1 : 0.3,
                        }}
                        onClick={() => {
                          setYearSelectionIndex(Math.max(0, yearSelectionIndex - 1));
                          // Keep month selection the same when year changes
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.25)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                        disabled={yearSelectionIndex === 0}
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M7.5 9L4.5 6L7.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      
                      {/* Year cards */}
                      <div className="flex gap-2">
                        {availableYears.map((year, index) => {
                          const isSelected = index === yearSelectionIndex;
                          
                          // Check if all days in all months of this year are selected
                          const yearMonthOptions = generateMonthOptions(year);
                          let allDaysSelectedInYear = true;
                          for (let monthIdx = 0; monthIdx < yearMonthOptions.length; monthIdx++) {
                            const key = getSelectionKey(year, monthIdx);
                            const monthDays = yearMonthOptions[monthIdx].days;
                            const monthDisabled = disabledDays[monthIdx] || new Set();
                            const monthSelected = selectedDays[key] || new Set();
                            for (let d = 1; d <= monthDays; d++) {
                              if (!monthDisabled.has(d) && !monthSelected.has(d)) {
                                allDaysSelectedInYear = false;
                                break;
                              }
                            }
                            if (!allDaysSelectedInYear) break;
                          }
                          
                          return (
                            <button
                              key={year}
                              onClick={() => {
                                if (index === yearSelectionIndex) {
                                  // Toggle all days in all months of this year
                                  const yearMonths = generateMonthOptions(year);
                                  const newSelectedDays = { ...selectedDays };

                                  if (allDaysSelectedInYear) {
                                    // Deselect all days in all months
                                    for (let monthIdx = 0; monthIdx < yearMonths.length; monthIdx++) {
                                      const key = getSelectionKey(year, monthIdx);
                                      const monthDays = yearMonths[monthIdx].days;
                                      const monthDisabled = disabledDays[monthIdx] || new Set();
                                      const newMonthSelected = new Set(newSelectedDays[key] || []);
                                      for (let d = 1; d <= monthDays; d++) {
                                        if (!monthDisabled.has(d)) {
                                          newMonthSelected.delete(d);
                                        }
                                      }
                                      newSelectedDays[key] = newMonthSelected;
                                    }
                                  } else {
                                    // Select all days in all months
                                    for (let monthIdx = 0; monthIdx < yearMonths.length; monthIdx++) {
                                      const key = getSelectionKey(year, monthIdx);
                                      const monthDays = yearMonths[monthIdx].days;
                                      const monthDisabled = disabledDays[monthIdx] || new Set();
                                      const newMonthSelected = new Set(newSelectedDays[key] || []);
                                      for (let d = 1; d <= monthDays; d++) {
                                        if (!monthDisabled.has(d)) {
                                          newMonthSelected.add(d);
                                        }
                                      }
                                      newSelectedDays[key] = newMonthSelected;
                                    }
                                  }

                                  setSelectedDays(newSelectedDays);
                                } else {
                                  setYearSelectionIndex(index);
                                }
                              }}
                              className="px-4 py-1.5 rounded-lg transition-all duration-200"
                              style={{
                                background: allDaysSelectedInYear && isSelected
                                  ? 'rgb(239, 68, 68)'
                                  : isSelected ? 'rgb(39, 38, 41)' : 'rgb(28, 27, 31)',
                                color: allDaysSelectedInYear && isSelected ? '#FFFFFF' : isSelected ? '#DBDADB' : '#7C7F82',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '13px',
                                fontWeight: 400,
                                border: 'none',
                                cursor: 'pointer',
                                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                                boxShadow: isSelected
                                  ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08)'
                                  : '0 2px 6px rgba(0, 0, 0, 0.15)',
                              }}
                            >
                              {year}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button 
                        className="flex items-center justify-center transition-all circle-button-glass-border"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.25)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          opacity: yearSelectionIndex < yearCardCount - 1 ? 1 : 0.3,
                        }}
                        onClick={() => {
                          setYearSelectionIndex(Math.min(yearCardCount - 1, yearSelectionIndex + 1));
                          // Keep month selection the same when year changes
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.25)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                        disabled={yearSelectionIndex >= yearCardCount - 1}
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M4.5 3L7.5 6L4.5 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>

                    {/* Month carousel with side arrows */}
                    <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                      <button 
                        className="flex items-center justify-center transition-all circle-button-glass-border"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.25)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          opacity: timeSelectionIndex > 0 ? 1 : 0.3,
                          flexShrink: 0,
                        }}
                        onClick={() => setTimeSelectionIndex(Math.max(0, timeSelectionIndex - 1))}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.25)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                        disabled={timeSelectionIndex === 0}
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M7.5 9L4.5 6L7.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Horizontal deck of overlapping cards */}
                      <div className="flex-1 relative">
                        {(() => {
                      // Calculate card dimensions at container level
                      const cardPadding = 12;
                      const titleHeight = 16;
                      
                      // Monthly view dimensions
                      const monthlyCircleSize = 24;
                      const monthlyCircleGap = 5;
                      const monthlyMaxRows = 6;
                      const monthlyCols = 7;
                      const monthlyGridHeight = (monthlyCircleSize * monthlyMaxRows) + (monthlyCircleGap * (monthlyMaxRows - 1));
                      const monthlyCardHeight = cardPadding + titleHeight + cardPadding + monthlyGridHeight + cardPadding;
                      const monthlyCardWidth = (monthlyCircleSize * monthlyCols) + (monthlyCircleGap * (monthlyCols - 1)) + (cardPadding * 2);
                      
                      // Yearly view dimensions (2 rows of 6 months)
                      const yearlyBubbleWidth = 40;
                      const yearlyBubbleHeight = 28;
                      const yearlyGapX = 8;
                      const yearlyGapY = 8;
                      const yearlyCols = 6;
                      const yearlyRows = 2;
                      const yearlyGridWidth = (yearlyBubbleWidth * yearlyCols) + (yearlyGapX * (yearlyCols - 1));
                      const yearlyGridHeight = (yearlyBubbleHeight * yearlyRows) + (yearlyGapY * (yearlyRows - 1));
                      const yearlyCardHeight = cardPadding + titleHeight + cardPadding + yearlyGridHeight + cardPadding;
                      const yearlyCardWidth = yearlyGridWidth + (cardPadding * 2);
                      
                      // Use monthly dimensions only now (yearly is in separate carousel)
                      const cardHeight = monthlyCardHeight;
                      const cardWidth = monthlyCardWidth;
                      const cardCount = monthCardCount;
                      
                      return (
                        <div ref={timeDeckRef} className="relative" style={{ overflow: 'visible', height: cardHeight }}>
                          {timeDeckWidth > 0 && (() => {
                            const containerWidth = timeDeckWidth;
                            const minOverlap = 20;
                            let overlap = minOverlap;
                            
                            // Recalculate overlap to fit container
                            if (cardCount > 1) {
                              const totalWidthNeeded = cardWidth * cardCount;
                              const overlapNeeded = (totalWidthNeeded - containerWidth) / (cardCount - 1);
                              overlap = Math.max(minOverlap, overlapNeeded);
                            }

                            // Calculate total width of the deck with the chosen overlap
                            const totalDeckWidth = cardWidth + (cardCount - 1) * (cardWidth - overlap);
                            // Calculate centering offset
                            const centeringOffset = Math.max(0, (containerWidth - totalDeckWidth) / 2);
                            
                            return (
                              <div 
                                className="absolute inset-0 flex items-center"
                                style={{ width: '100%' }}
                              >
                                {monthOptions.map((option, index) => {
                                  const isSelected = index === timeSelectionIndex;
                                  // Position cards left to right with computed overlap, centered in container
                                  const leftOffset = centeringOffset + index * (cardWidth - overlap);
                              
                              // Z-index: selected card on top (100), others based on distance from selected
                              const zIndex = isSelected 
                                ? 100 
                                : cardCount - Math.abs(index - timeSelectionIndex);
                              
                              // Calculate gradient colors based on distance from selected
                              const distanceFromSelected = Math.abs(index - timeSelectionIndex);
                              const maxDistance = Math.max(timeSelectionIndex, cardCount - 1 - timeSelectionIndex);

                              // Background gradient: lerp from selected (#272629) toward container bg (lighter now)
                              const t = maxDistance > 0 ? distanceFromSelected / maxDistance : 0;
                              
                              // Hover effect for selected card
                              const isHovered = index === hoveredMonthCardIndex;
                              const baseR = (isSelected && isHovered) ? 50 : 39;
                              const baseG = (isSelected && isHovered) ? 49 : 38;
                              const baseB = (isSelected && isHovered) ? 55 : 41;
                              
                              const bgR = isSelected ? baseR : Math.round(39 - t * (39 - 28));
                              const bgG = isSelected ? baseG : Math.round(38 - t * (38 - 27));
                              const bgB = isSelected ? baseB : Math.round(41 - t * (41 - 31));
                              const bgColor = `rgb(${bgR}, ${bgG}, ${bgB})`;
                              
                              // Text gradient: lerp toward muted (but still visible)
                              const textR = isSelected ? 219 : Math.round(219 - t * (219 - 100));
                              const textG = isSelected ? 218 : Math.round(218 - t * (218 - 99));
                              const textB = isSelected ? 219 : Math.round(219 - t * (219 - 100));
                              const textColor = `rgb(${textR}, ${textG}, ${textB})`;
                              
                              // Label gradient: lerp toward muted
                              const labelR = isSelected ? 124 : Math.round(124 - t * (124 - 70));
                              const labelG = isSelected ? 127 : Math.round(127 - t * (127 - 72));
                              const labelB = isSelected ? 130 : Math.round(130 - t * (130 - 74));
                              const labelColor = `rgb(${labelR}, ${labelG}, ${labelB})`;
                              
                              // Scale: selected is full size, shrinks by 1.5% per distance
                              const cardScale = isSelected ? 1.02 : 1 - (distanceFromSelected * 0.015);
                              
                              // All monthly cards use the same max height (6 rows), top-aligned
                              const thisCardHeight = cardHeight;
                              const topOffset = 0;
                              
                              return (
                                <div
                                  key={index}
                                  className="absolute flex flex-col quick-card-glass-border"
                                  style={{
                                    width: cardWidth,
                                    height: thisCardHeight,
                                    left: leftOffset,
                                    top: topOffset,
                                    background: bgColor,
                                    boxShadow: isSelected
                                      ? '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08)'
                                      : '0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.02)',
                                    borderRadius: '1.5rem',
                                    zIndex,
                                    transform: `scale(${cardScale})`,
                                    transformOrigin: 'center center',
                                    transition: 'background 250ms ease-out, transform 250ms ease-out, box-shadow 250ms ease-out, height 250ms ease-out, top 250ms ease-out',
                                    padding: cardPadding,
                                    cursor: 'pointer',
                                  }}
                                  onClick={(e) => {
                                    // If we just finished dragging, don't trigger card click
                                    if (justFinishedDraggingRef.current) return;

                                    // Don't trigger if clicking on a day circle
                                    const target = e.target as HTMLElement;
                                    if (target.tagName === 'BUTTON' && target !== e.currentTarget) return;

                                    if (index === timeSelectionIndex) {
                                      // Toggle all days in this month
                                      const days = option.days;
                                      const key = getSelectionKey(selectedYear, index);
                                      const currentSelected = selectedDays[key] || new Set();
                                      const disabled = disabledDays[index] || new Set();

                                      // Check if all available days are selected
                                      let allSelected = true;
                                      for (let d = 1; d <= days; d++) {
                                        if (!disabled.has(d) && !currentSelected.has(d)) {
                                          allSelected = false;
                                          break;
                                        }
                                      }

                                      const newSelected = new Set(currentSelected);
                                      if (allSelected) {
                                        // Deselect all available
                                        for (let d = 1; d <= days; d++) {
                                          if (!disabled.has(d)) {
                                            newSelected.delete(d);
                                          }
                                        }
                                      } else {
                                        // Select all available
                                        for (let d = 1; d <= days; d++) {
                                          if (!disabled.has(d)) {
                                            newSelected.add(d);
                                          }
                                        }
                                      }

                                      setSelectedDays(prev => ({
                                        ...prev,
                                        [key]: newSelected
                                      }));
                                    } else {
                                      setTimeSelectionIndex(index);
                                    }
                                  }}
                                  onMouseEnter={() => setHoveredMonthCardIndex(index)}
                                  onMouseLeave={() => setHoveredMonthCardIndex(null)}
                                >
                                  {/* Month label at top */}
                                  <span 
                                    className="month-label" 
                                    style={{ 
                                      fontFamily: 'var(--font-open-sans)', 
                                      color: textColor,
                                      fontSize: 14,
                                      fontWeight: 350,
                                      transition: 'color 250ms ease-out',
                                      height: titleHeight,
                                      lineHeight: `${titleHeight}px`,
                                      marginBottom: cardPadding,
                                    }}
                                  >
                                    {option.value}
                                  </span>
                                  
                                  {/* Day circles grid - 7 columns (calendar layout) */}
                                  {(() => {
                                    const days = option.days;
                                    const startDay = option.startDay;
                                    const totalCells = startDay + days;
                                    const rows = Math.ceil(totalCells / monthlyCols);
                                    
                                    const fontSize = Math.max(8, Math.min(12, monthlyCircleSize * 0.4));
                                    
                                    const key = getSelectionKey(selectedYear, index);
                                    const monthSelectedDays = selectedDays[key] || new Set();
                                    const isAnyHoveredInMonth = hoveredDay?.month === index;
                                    
                                    return (
                                      <div 
                                        style={{ 
                                          display: 'grid',
                                          gridTemplateColumns: `repeat(${monthlyCols}, ${monthlyCircleSize}px)`,
                                          gridTemplateRows: `repeat(${rows}, ${monthlyCircleSize}px)`,
                                          gap: `${monthlyCircleGap}px`,
                                          pointerEvents: isSelected ? 'auto' : 'none',
                                        }}
                                        onMouseEnter={() => {
                                          // When entering the calendar grid, clear card hover
                                          if (isSelected) setHoveredMonthCardIndex(null);
                                        }}
                                        onMouseLeave={() => {
                                          if (isSelected) {
                                            setHoveredDay(null);
                                            // Re-enable card hover when leaving grid back to card
                                            setHoveredMonthCardIndex(index);
                                          }
                                        }}
                                      >
                                        {/* Empty cells for startDay offset */}
                                        {Array.from({ length: startDay }, (_, i) => (
                                          <div key={`empty-${i}`} style={{ width: monthlyCircleSize, height: monthlyCircleSize }} />
                                        ))}
                                        
                                        {/* Day circles */}
                                        {Array.from({ length: days }, (_, dayIdx) => {
                                          const dayNum = dayIdx + 1;
                                          const isDayDisabled = disabledDays[index]?.has(dayNum) ?? false;
                                          const isDaySelected = !isDayDisabled && monthSelectedDays.has(dayNum);
                                          const isDayHovered = !isDayDisabled && hoveredDay?.month === index && hoveredDay?.day === dayNum;
                                          
                                          // Base circle colors (bright when card is selected)
                                          // Disabled days use colors very close to card bg
                                          const baseCircleR = isDayDisabled ? bgR + 8 : isDaySelected ? 239 : 79;
                                          const baseCircleG = isDayDisabled ? bgG + 8 : isDaySelected ? 68 : 78;
                                          const baseCircleB = isDayDisabled ? bgB + 10 : isDaySelected ? 68 : 83;
                                          
                                          // Fade circles toward card bg based on card's distance (t)
                                          const circleR = Math.round(baseCircleR - t * (baseCircleR - bgR));
                                          const circleG = Math.round(baseCircleG - t * (baseCircleG - bgG));
                                          const circleB = Math.round(baseCircleB - t * (baseCircleB - bgB));
                                          
                                          const finalCircleColor = `rgb(${circleR}, ${circleG}, ${circleB})`;
                                          
                                          // Text color - also fade based on t, disabled days are very dim
                                          const baseTextBrightness = isDayDisabled ? 50 : isDaySelected ? 255 : 180;
                                          const fadedTextBrightness = Math.round(baseTextBrightness - t * (baseTextBrightness - (isDayDisabled ? 30 : 60)));
                                          const circleTextColor = `rgb(${fadedTextBrightness}, ${fadedTextBrightness}, ${fadedTextBrightness})`;
                                          
                                          return (
                                            <button
                                              key={dayNum}
                                              className="flex items-center justify-center transition-all duration-150"
                                              disabled={isDayDisabled}
                                              style={{
                                                width: monthlyCircleSize,
                                                height: monthlyCircleSize,
                                                borderRadius: '50%',
                                                background: finalCircleColor,
                                                boxShadow: isDayDisabled
                                                  ? 'none'
                                                  : isDaySelected
                                                    ? 'inset 0 1px 1px rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.2)'
                                                    : 'inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
                                                border: 'none',
                                                cursor: isDayDisabled ? 'not-allowed' : isSelected ? 'pointer' : 'default',
                                                transform: isDayHovered && !isDayDisabled ? 'scale(1.2)' : 'scale(1)',
                                                zIndex: isDayHovered ? 10 : 1,
                                                userSelect: 'none',
                                                fontSize: `${fontSize}px`,
                                                fontFamily: 'var(--font-open-sans)',
                                                fontWeight: 400,
                                                color: circleTextColor,
                                              }}
                                              onMouseDown={(e) => {
                                                if (!isSelected || isDayDisabled) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleDragStart(index, dayNum);
                                              }}
                                              onMouseEnter={() => {
                                                if (!isSelected || isDayDisabled) return;
                                                setHoveredDay({ month: index, day: dayNum });
                                                if (isDragging) {
                                                  handleDragOver(index, dayNum);
                                                }
                                              }}
                                            >
                                              {dayNum}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
                      </div>

                      <button 
                        className="flex items-center justify-center transition-all circle-button-glass-border"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(255, 255, 255, 0.25)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          opacity: timeSelectionIndex < monthCardCount - 1 ? 1 : 0.3,
                          flexShrink: 0,
                        }}
                        onClick={() => setTimeSelectionIndex(Math.min(monthCardCount - 1, timeSelectionIndex + 1))}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.25)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                        disabled={timeSelectionIndex >= monthCardCount - 1}
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M4.5 3L7.5 6L4.5 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>

              {/* Quick Looks container */}
              <div 
                className="flex flex-col p-4 graph-container-glass-border"
                style={{ 
                  marginTop: '1.2rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                  borderRadius: '1.5rem',
                }}
              >
                {/* Quick Looks title */}
                <div className="mb-4">
                  <div className="ai-glass-border" style={{ ...aiGlassBorderStyle('9999px'), display: 'inline-block' }}>
                    <div
                      style={{
                        ...aiGlassContentStyle('9999px'),
                        padding: '6px 14px',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#DBDADB',
                      }}
                    >
                      Quick Looks
                    </div>
                  </div>
                </div>

                {/* Two-column layout for Quick Looks content */}
                <div className="flex gap-4">
                  {/* Left column - fixed width for buttons/circles */}
                  <div className="flex flex-col items-center" style={{ width: 24 }}>
                  {/* Crew icon button */}
                  <button
                    className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 hover:brightness-125 circle-button-glass-border"
                    style={{
                      background: 'rgba(255, 255, 255, 0.25)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 24 24" 
                      fill="#DBDADB" 
                      className="w-3 h-3"
                    >
                      <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
                      <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
                    </svg>
                  </button>

                  {/* Faded connecting line - extends to center arrows with main card */}
                  <div
                    style={{
                      width: 1,
                      height: 76,
                      background: 'linear-gradient(to bottom, transparent 0%, transparent 10%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.15) 60%, transparent 90%, transparent 100%)',
                    }}
                  />

                  {/* Up arrow button */}
                  <button
                    onClick={carouselNav.goUp}
                    disabled={!carouselNav.canGoUp}
                    className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 circle-button-glass-border ${carouselNav.canGoUp ? 'hover:brightness-125' : ''}`}
                    style={{
                      background: carouselNav.canGoUp ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: carouselNav.canGoUp ? '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)' : 'none',
                      cursor: carouselNav.canGoUp ? 'pointer' : 'default',
                      opacity: carouselNav.canGoUp ? 1 : 0.3,
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DBDADB"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>

                  {/* Gap between arrows */}
                  <div style={{ height: 6 }} />

                  {/* Down arrow button */}
                  <button
                    onClick={carouselNav.goDown}
                    disabled={!carouselNav.canGoDown}
                    className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 circle-button-glass-border ${carouselNav.canGoDown ? 'hover:brightness-125' : ''}`}
                    style={{
                      background: carouselNav.canGoDown ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: carouselNav.canGoDown ? '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)' : 'none',
                      cursor: carouselNav.canGoDown ? 'pointer' : 'default',
                      opacity: carouselNav.canGoDown ? 1 : 0.3,
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DBDADB"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Curved connecting line to expand button */}
                  <svg
                    width="24"
                    height="92"
                    style={{ overflow: 'visible' }}
                  >
                    <defs>
                      <linearGradient id="curvedLineGradient" gradientUnits="userSpaceOnUse" x1="12" y1="0" x2="48" y2="84">
                        <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                        <stop offset="35%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="65%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 12 0 L 12 60 Q 12 84, 36 84 L 48 84"
                      fill="none"
                      stroke="url(#curvedLineGradient)"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Line segment from curved line to roles icon */}
                  <div
                    style={{
                      width: 1,
                      height: 51,
                      marginTop: -32,
                      background: 'linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 60%, transparent 100%)',
                    }}
                  />

                  {/* Roles icon button */}
                  <button
                    className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 hover:brightness-125"
                    style={{
                      background: 'rgba(255, 255, 255, 0.25)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 24 24" 
                      fill="#DBDADB" 
                      className="w-3 h-3"
                    >
                      <path fillRule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Line segment from roles icon to role arrows */}
                  <div
                    style={{
                      width: 1,
                      height: 86,
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.15) 60%, transparent 100%)',
                    }}
                  />

                  {/* Role Up arrow button */}
                  <button
                    onClick={roleCarouselNav.goUp}
                    disabled={!roleCarouselNav.canGoUp}
                    className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 ${roleCarouselNav.canGoUp ? 'hover:brightness-125' : ''}`}
                    style={{
                      background: roleCarouselNav.canGoUp ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: roleCarouselNav.canGoUp ? '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)' : 'none',
                      cursor: roleCarouselNav.canGoUp ? 'pointer' : 'default',
                      opacity: roleCarouselNav.canGoUp ? 1 : 0.3,
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DBDADB"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>

                  {/* Gap between role arrows */}
                  <div style={{ height: 6 }} />

                  {/* Role Down arrow button */}
                  <button
                    onClick={roleCarouselNav.goDown}
                    disabled={!roleCarouselNav.canGoDown}
                    className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 ${roleCarouselNav.canGoDown ? 'hover:brightness-125' : ''}`}
                    style={{
                      background: roleCarouselNav.canGoDown ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: roleCarouselNav.canGoDown ? '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)' : 'none',
                      cursor: roleCarouselNav.canGoDown ? 'pointer' : 'default',
                      opacity: roleCarouselNav.canGoDown ? 1 : 0.3,
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DBDADB"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Curved connecting line to role expand button */}
                  <svg
                    width="24"
                    height="112"
                    style={{ overflow: 'visible' }}
                  >
                    <defs>
                      <linearGradient id="rolesCurvedLineGradient" gradientUnits="userSpaceOnUse" x1="12" y1="0" x2="48" y2="104">
                        <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                        <stop offset="35%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="65%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 12 0 L 12 80 Q 12 104, 36 104 L 48 104"
                      fill="none"
                      stroke="url(#rolesCurvedLineGradient)"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                {/* Right column - flexible width for cards */}
                <div className="flex-1 flex flex-col">
                  {/* Crew members title */}
                  <span 
                    className="text-med mb-2" 
                    style={{ 
                      fontFamily: 'var(--font-open-sans)', 
                      color: '#DBDADB', 
                      fontWeight: 350 
                    }}
                  >
                    Crew members
                  </span>
                  <CrewQuickLookCarousel
                    cards={computedCrewCards}
                    renderButtons={false}
                    onNavigationChange={handleCarouselNavigationChange}
                    onCardClick={(card) => {
                      setSelectedCrew(card);
                      setSelectedRole(null); // Clear any selected role
                      setSelectedRoleId(null); // Clear role ID from localStorage
                      setExpandedQuickLook('none'); // Reset so expand button shows "expand"
                      setActiveView('crew'); // Sync dropdown to show "Crew"
                    }}
                  />

                  {/* Expand/Collapse button */}
                  <div className="flex items-center justify-start gap-2 mt-3">
                    <button
                      onClick={() => {
                        setCrewPage(1);
                        setSelectedCrew(null); // Clear individual crew selection
                        setSelectedRole(null); // Clear individual role selection
                        const newState = expandedQuickLook === 'crew' ? 'none' : 'crew';
                        setExpandedQuickLook(newState);
                        setActiveView(newState === 'none' ? 'overview' : 'crew'); // Sync dropdown
                      }}
                      className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 hover:brightness-125"
                      style={{
                        background: 'rgba(255, 255, 255, 0.25)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#DBDADB"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {/* Up and down arrows (expand symbol) */}
                        <polyline points="17 8 12 3 7 8" />
                        <polyline points="7 16 12 21 17 16" />
                      </svg>
                    </button>
                    <span
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontWeight: 350,
                      }}
                    >
                      {expandedQuickLook === 'crew' ? 'Shrink' : 'Expand'} {carouselNav.totalCount - 1} more crew members
                    </span>
                  </div>

                  {/* Roles section */}
                  <div style={{ marginTop: '0.75rem' }}>
                    {/* Roles title */}
                    <div className="flex items-center gap-3 mb-2">
                      <span 
                        className="text-med" 
                        style={{ 
                          fontFamily: 'var(--font-open-sans)', 
                          color: '#DBDADB', 
                          fontWeight: 350 
                        }}
                      >
                        Roles
                      </span>
                    </div>
                    
                    <RoleQuickLookCarousel
                      cards={computedRoleCards}
                      renderButtons={false}
                      onNavigationChange={handleRoleCarouselNavigationChange}
                      onCardClick={(card) => {
                        setSelectedRole(card);
                        setSelectedCrew(null); // Clear any selected crew
                        setSelectedCrewId(null); // Clear crew ID from localStorage
                        setExpandedQuickLook('none'); // Reset so expand button shows "expand"
                        setActiveView('roles'); // Sync dropdown to show "Roles"
                      }}
                    />

                    {/* Role Expand/Collapse button */}
                    <div className="flex items-center justify-start gap-2 mt-3">
                      <button
                        onClick={() => {
                          setRolePage(1);
                          setSelectedCrew(null); // Clear individual crew selection
                          setSelectedRole(null); // Clear individual role selection
                          const newState = expandedQuickLook === 'roles' ? 'none' : 'roles';
                          setExpandedQuickLook(newState);
                          setActiveView(newState === 'none' ? 'overview' : 'roles'); // Sync dropdown
                        }}
                        className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 hover:brightness-125"
                        style={{
                          background: 'rgba(255, 255, 255, 0.25)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                          cursor: 'pointer',
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#DBDADB"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {/* Up and down arrows (expand symbol) */}
                          <polyline points="17 8 12 3 7 8" />
                          <polyline points="7 16 12 21 17 16" />
                        </svg>
                      </button>
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          fontWeight: 350,
                        }}
                      >
                        {expandedQuickLook === 'roles' ? 'Shrink' : 'Expand'} {roleCarouselNav.totalCount - 1} more roles
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
