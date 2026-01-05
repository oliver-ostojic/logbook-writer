'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon, PlusIcon, UserIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import Footer from '../../../../components/Footer';
import { StatGraphCard, GraphCardWithStatsTransparent, GraphCardSimple, SatisfactionLineGraph, CrewQuickLookCarousel, RoleQuickLookCarousel, CrewQuickLookCardStatic, RoleQuickLookCardStatic, defaultCrewCards, defaultRoleCards, CrewCardData, RoleCardData, RoleHeatmap, CrewFairnessTable } from './components';

// =============================================================================
// AI Glass Style Template - Reusable glass effect with border
// =============================================================================

// Border style - just sets up positioning for the pseudo-element border
// borderColor: RGB values as string e.g. "255, 255, 255" for white, "100, 150, 255" for blue
// borderOpacity: 0-1 value for border visibility
const aiGlassBorderStyle = (
  borderRadius: string | number = '1rem',
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
const aiGlassContentStyle = (borderRadius: string | number = '1rem', opacity: number = 0.85): React.CSSProperties => ({
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
  borderRadius = '1rem', 
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
          className="flex items-center justify-center rounded-full transition-all duration-200"
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
  const [storeName, setStoreName] = useState<string>('');
  const [activeDashboard, setActiveDashboard] = useState<string>('Overview');
  const [activeView, setActiveView] = useState<string>('overview');
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>('none');
  const [expandedQuickLook, setExpandedQuickLook] = useState<'crew' | 'roles' | 'none'>('none');
  const [selectedCrew, setSelectedCrew] = useState<CrewCardData | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleCardData | null>(null);
  const [crewPage, setCrewPage] = useState(1);
  const [rolePage, setRolePage] = useState(1);
  const [crewSearchQuery, setCrewSearchQuery] = useState('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [timeSelectionIndex, setTimeSelectionIndex] = useState(0); // Month index within selected year
  const [yearSelectionIndex, setYearSelectionIndex] = useState(0); // Year carousel index
  const [selectedDays, setSelectedDays] = useState<Record<string, Set<number>>>({}); // "year-monthIndex" -> Set of selected day numbers
  const [selectedMonths, setSelectedMonths] = useState<Record<number, Set<number>>>({}); // yearIndex -> Set of selected month numbers (0-11)
  const [hoveredDay, setHoveredDay] = useState<{ month: number; day: number } | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<{ year: number; month: number } | null>(null);
  const [hoveredMonthCardIndex, setHoveredMonthCardIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ month: number; day: number } | null>(null);
  const [dragStartMonth, setDragStartMonth] = useState<{ year: number; month: number } | null>(null);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select'); // Whether drag is selecting or deselecting
  
  // Mock disabled days (no logbook data) - monthIndex -> Set of disabled day numbers
  // For testing: sporadic random disabled days
  const [disabledDays] = useState<Record<number, Set<number>>>(() => {
    const disabled: Record<number, Set<number>> = {};
    // Sporadic disabled days across months
    disabled[0] = new Set([3, 7, 11, 18, 24, 29]);
    disabled[1] = new Set([2, 9, 14, 22, 27]);
    disabled[2] = new Set([1, 6, 13, 17, 23, 28, 31]);
    disabled[3] = new Set([4, 10, 16, 21, 26]);
    disabled[4] = new Set([5, 8, 15, 19, 25, 30]);
    disabled[5] = new Set([2, 7, 12, 20, 24, 29]);
    disabled[6] = new Set([1, 9, 14, 18, 23, 27]);
    disabled[7] = new Set([3, 11, 16, 22, 28]);
    disabled[8] = new Set([4, 8, 13, 19, 25]);
    disabled[9] = new Set([2, 6, 15, 21, 27, 31]);
    disabled[10] = new Set([1, 7, 12, 18, 24, 29]);
    disabled[11] = new Set([5, 10, 16, 22, 27]);
    return disabled;
  });
  
  // Mock disabled months (no logbook data for entire month) - yearIndex -> Set of disabled month numbers (1-12)
  // For testing: sporadic disabled months
  const [disabledMonths] = useState<Record<number, Set<number>>>(() => {
    const disabled: Record<number, Set<number>> = {};
    // Year 0 (2026): disable Feb, May, Sep
    disabled[0] = new Set([2, 5, 9]);
    // Year 1 (2027): disable Mar, Jul, Nov
    disabled[1] = new Set([3, 7, 11]);
    return disabled;
  });
  
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
  
  // Available years for the year carousel
  const availableYears = [2026, 2027];
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
  
  const selectedYear = availableYears[yearSelectionIndex] || 2026;
  const monthOptions = generateMonthOptions(selectedYear);
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

  // Get current dashboard data
  const currentDashboard = dashboardData.expandedDashboards[activeDashboard];

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

  return (
    <main className="bg-black min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: blobAnimationStyles }} />
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
                    href="#"
                    className="text-base transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontWeight: 400 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#9A999E'}
                  >
                    Home
                  </a>
                  <a
                    href="#"
                    className="text-base transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#FFFFFF', fontWeight: 500 }}
                  >
                    Dashboard
                  </a>
                  <a
                    href="#"
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
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              >
                <UserIcon className="w-5 h-5" style={{ color: '#9A999E' }} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 lg:px-8 pt-20 pb-9">
          {/* Main content area */}
          <div className="flex flex-col min-[1200px]:flex-row gap-3">
            {/* Left card - dashboard (full width when stacked, 60% when side-by-side) */}
            <div 
              className="w-full min-[1200px]:w-[60%] rounded-2xl px-4 py-4 relative"
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
                  ...aiGlassBorderStyle('1rem', '180, 170, 200', 0.15),
                  ...aiGlassContentStyle('1rem'),
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
                          background: 'rgba(255, 255, 255, 0.08)',
                          backdropFilter: 'blur(5px)',
                          WebkitBackdropFilter: 'blur(5px)',
                          borderRadius: '9999px',
                          fontFamily: 'var(--font-open-sans)', 
                          color: '#DBDADB', 
                          fontWeight: 400,
                          padding: '6px 14px',
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
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
                    {selectedCrew ? selectedCrew.title : selectedRole ? selectedRole.name : expandedQuickLook !== 'none' ? 'List view' : 'Dashboard'}
                  </h2>

                  {/* Right: Date */}
                  <div className="absolute right-0 flex items-center">
                    <span className="text-med" style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6A70', fontWeight: 350 }}>
                      20-27 Jun, 25
                    </span>
                  </div>
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
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <StatGraphCard 
                        data={{
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
                        }}
                      />
                      <StatGraphCard 
                        data={{
                          type: 'pie',
                          title: 'Preferences met',
                          value: selectedCrew.satisfactionHistory?.[selectedCrew.satisfactionHistory.length - 1] ?? 67.5,
                          unit: '%',
                          status: 'Crew',
                          pieData: { 
                            met: selectedCrew.satisfactionHistory?.[selectedCrew.satisfactionHistory.length - 1] ?? 67.5, 
                            notMet: 100 - (selectedCrew.satisfactionHistory?.[selectedCrew.satisfactionHistory.length - 1] ?? 67.5) 
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
                  
                  {/* Satisfaction distribution box plot - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardWithStatsTransparent 
                      title="Shift satisfaction spread"
                      boxPlotData={{
                        min: 58,
                        q1: 65.2,
                        median: 72.5,
                        q3: 79.8,
                        max: 88,
                        outliers: [45.3],
                      }}
                    />
                  </div>
                  
                  {/* Satisfaction over shifts line graph - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <SatisfactionLineGraph 
                      title="Satisfaction over shifts"
                      data={[
                        { shiftNumber: 1, shiftDate: '1 Jun, 25', satisfaction: 72.5 },
                        { shiftNumber: 2, shiftDate: '3 Jun, 25', satisfaction: 68.3 },
                        { shiftNumber: 3, shiftDate: '5 Jun, 25', satisfaction: 75.1 },
                        { shiftNumber: 4, shiftDate: '8 Jun, 25', satisfaction: 71.8 },
                        { shiftNumber: 5, shiftDate: '10 Jun, 25', satisfaction: 79.2 },
                        { shiftNumber: 6, shiftDate: '12 Jun, 25', satisfaction: 65.4 },
                        { shiftNumber: 7, shiftDate: '15 Jun, 25', satisfaction: 82.0 },
                        { shiftNumber: 8, shiftDate: '17 Jun, 25', satisfaction: 77.6 },
                      ]}
                    />
                  </div>
                  
                  {/* Preferences Met graph - individual crew level - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardSimple 
                      title="Preferences met"
                      preferenceData={[
                        { label: 'No Mondays', totalCount: 4, satisfiedCount: 3 },
                        { label: 'Morning Only', totalCount: 5, satisfiedCount: 4 },
                        { label: 'Max 6 hrs', totalCount: 8, satisfiedCount: 7 },
                        { label: 'No Doubles', totalCount: 3, satisfiedCount: 2 },
                      ]}
                    />
                  </div>
                </div>
              ) : selectedRole ? (
                /* Individual Role Dashboard */
                <>
                  {/* 3 Mini cards in a row - wrapped in translucent card */}
                  <div 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-1 min-[900px]:grid-cols-3 gap-3">
                    <StatGraphCard 
                      data={{
                        type: 'sparkline',
                        title: 'Fairness index',
                        value: Math.round((1 - selectedRole.giniCoefficient) * 100),
                        unit: '%',
                        status: selectedRole.trend === 'improving' ? 'Good' : selectedRole.trend === 'worsening' ? 'Alert' : 'Stable',
                        sparklineData: [0.15, 0.18, 0.14, 0.16, 0.12, selectedRole.giniCoefficient].map(g => Math.round((1 - g) * 100)),
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm4.5 7.5a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-2.25a.75.75 0 0 1 .75-.75Zm3.75-1.5a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0V12Zm2.25-3a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0V9.75A.75.75 0 0 1 13.5 9Zm3.75-1.5a.75.75 0 0 0-1.5 0v9a.75.75 0 0 0 1.5 0v-9Z" clipRule="evenodd" />
                          </svg>
                        ),
                      }}
                    />
                    <StatGraphCard 
                      data={{
                        type: 'bar',
                        title: 'Min/hr buckets',
                        value: selectedRole.avgMinutes,
                        unit: 'min avg',
                        barUnit: 'crew',
                        status: 'Distribution',
                        barData: [
                          { role: '0-10 min', hours: 1 },
                          { role: '10-20 min', hours: 2 },
                          { role: '20-30 min', hours: 4 },
                          { role: '30-40 min', hours: 8 },
                          { role: '40-50 min', hours: 6 },
                          { role: '50-60 min', hours: 3 },
                        ],
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
                          </svg>
                        ),
                      }}
                    />
                    <StatGraphCard 
                      data={{
                        type: 'pie',
                        title: 'Time share',
                        value: 12.4,
                        unit: '%',
                        status: 'Of total',
                        pieData: { met: 12.4, notMet: 87.6 },
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
                  
                  {/* Crew mins distribution box plot - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardWithStatsTransparent 
                      title="Crew mins/shift spread"
                      boxPlotData={{
                        min: 25,
                        q1: 35,
                        median: 42,
                        q3: 50,
                        max: 62,
                        outliers: [18, 75],
                      }}
                    />
                  </div>
                  
                  {/* Role assignment heatmap - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <RoleHeatmap 
                      title="Avg hours/crew by day"
                      weeks={['6-13 Jun, 25', '13-20 Jun, 25', '20-27 Jun, 25', '27 Jun-4 Jul, 25', '4-11 Jul, 25', '11-18 Jul, 25']}
                      data={[
                        { week: '6-13 Jun, 25', dayOfWeek: 'Mon', avgHours: 2.5 },
                        { week: '6-13 Jun, 25', dayOfWeek: 'Tue', avgHours: 1.8 },
                        { week: '6-13 Jun, 25', dayOfWeek: 'Wed', avgHours: 3.0 },
                        { week: '6-13 Jun, 25', dayOfWeek: 'Thu', avgHours: 2.2 },
                        { week: '6-13 Jun, 25', dayOfWeek: 'Fri', avgHours: 2.8 },
                        { week: '6-13 Jun, 25', dayOfWeek: 'Sat', avgHours: 3.5 },
                        { week: '6-13 Jun, 25', dayOfWeek: 'Sun', avgHours: 1.5 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Mon', avgHours: 2.3 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Tue', avgHours: 2.1 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Wed', avgHours: 2.8 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Thu', avgHours: 1.9 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Fri', avgHours: 3.2 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Sat', avgHours: 3.0 },
                        { week: '13-20 Jun, 25', dayOfWeek: 'Sun', avgHours: 0 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Mon', avgHours: 2.7 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Tue', avgHours: 2.4 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Wed', avgHours: 3.1 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Thu', avgHours: 2.6 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Fri', avgHours: 2.9 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Sat', avgHours: 3.3 },
                        { week: '20-27 Jun, 25', dayOfWeek: 'Sun', avgHours: 1.2 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Mon', avgHours: 2.0 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Tue', avgHours: 1.5 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Wed', avgHours: 2.5 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Thu', avgHours: 2.3 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Fri', avgHours: 3.0 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Sat', avgHours: 2.8 },
                        { week: '27 Jun-4 Jul, 25', dayOfWeek: 'Sun', avgHours: 0 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Mon', avgHours: 2.4 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Tue', avgHours: 2.6 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Wed', avgHours: 2.9 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Thu', avgHours: 2.1 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Fri', avgHours: 3.4 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Sat', avgHours: 3.1 },
                        { week: '4-11 Jul, 25', dayOfWeek: 'Sun', avgHours: 1.8 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Mon', avgHours: 2.2 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Tue', avgHours: 1.9 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Wed', avgHours: 2.7 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Thu', avgHours: 2.4 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Fri', avgHours: 3.1 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Sat', avgHours: 3.5 },
                        { week: '11-18 Jul, 25', dayOfWeek: 'Sun', avgHours: 1.0 },
                      ]}
                    />
                  </div>
                  
                  {/* Crew fairness details table - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <CrewFairnessTable 
                      title="Assignment info"
                      data={[
                        { name: 'Sarah', minsPerShift: 42, lastAssignedDays: 1, deviation: 5.2 },
                        { name: 'Mike', minsPerShift: 38, lastAssignedDays: 2, deviation: -4.8 },
                        { name: 'Emma', minsPerShift: 50, lastAssignedDays: 0, deviation: 18.5 },
                        { name: 'John', minsPerShift: 40, lastAssignedDays: 3, deviation: -2.1 },
                        { name: 'Lisa', minsPerShift: 35, lastAssignedDays: 4, deviation: -12.3 },
                        { name: 'Alex', minsPerShift: 48, lastAssignedDays: 1, deviation: 14.7 },
                        { name: 'Rachel', minsPerShift: 44, lastAssignedDays: 2, deviation: 8.3 },
                        { name: 'Tom', minsPerShift: 36, lastAssignedDays: 5, deviation: -9.1 },
                        { name: 'Olivia', minsPerShift: 52, lastAssignedDays: 0, deviation: 22.4 },
                        { name: 'James', minsPerShift: 41, lastAssignedDays: 1, deviation: 1.5 },
                        { name: 'Sophie', minsPerShift: 33, lastAssignedDays: 6, deviation: -15.8 },
                        { name: 'Daniel', minsPerShift: 46, lastAssignedDays: 2, deviation: 11.2 },
                      ]}
                    />
                  </div>
                </>
              ) : expandedQuickLook === 'none' ? (
                <>
                  {/* Mini cards grid (4 cards) - wrapped in translucent card */}
                  <div 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {currentDashboard.miniCards.map((cardData, index) => (
                        <StatGraphCard key={index} data={cardData} />
                      ))}
                    </div>
                  </div>

                  {/* Large graph card - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardWithStatsTransparent 
                      title="Satisfaction distribution"
                      boxPlotData={{
                        min: 65,
                        q1: 68.5,
                        median: 71,
                        q3: 76.2,
                        max: 89,
                        outliers: [42.3, 51.8, 94.1],
                      }}
                    >
                      {/* Additional graph content can go here */}
                    </GraphCardWithStatsTransparent>
                  </div>

                  {/* Preferences Met graph - wrapped in translucent card */}
                  <div 
                    className="mt-4"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                      borderRadius: '1rem',
                      padding: 16,
                    }}
                  >
                    <GraphCardSimple 
                      title="Crew preferences met"
                      preferenceData={[
                        { label: 'No Mondays', totalCount: 12, satisfiedCount: 10 },  // 83%
                        { label: 'Morning Only', totalCount: 8, satisfiedCount: 6 },   // 75%
                        { label: 'Max 3 Days', totalCount: 15, satisfiedCount: 5 },    // 33%
                        { label: 'No Weekends', totalCount: 6, satisfiedCount: 5 },    // 83%
                        { label: 'Afternoon Only', totalCount: 10, satisfiedCount: 9 }, // 90%
                        { label: 'No Doubles', totalCount: 14, satisfiedCount: 6 },    // 43%
                        { label: 'Fixed Days', totalCount: 4, satisfiedCount: 3 },     // 75%
                      ]}
                    />
                  </div>
                </>
              ) : (
                /* Expanded Quick Looks - Single Column with Pagination */
                <div 
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                    borderRadius: '1rem',
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
                          const filteredCrewCards = defaultCrewCards.filter(card =>
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
                                    setExpandedQuickLook('none'); // Reset so expand button shows "expand"
                                  setActiveView('crew'); // Sync dropdown to show "Crew"
                                }}
                              >
                                <CrewQuickLookCardStatic 
                                  card={card} 
                                  onClick={() => {
                                    setSelectedCrew(card);
                                    setSelectedRole(null); // Clear any selected role
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
                          const filteredRoleCards = defaultRoleCards.filter(card =>
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
                                    setExpandedQuickLook('none');
                                    setActiveView('roles');
                                  }}
                                >
                                  <RoleQuickLookCardStatic 
                                    card={card} 
                                    onClick={() => {
                                      setSelectedRole(card);
                                      setSelectedCrew(null);
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
                        ? defaultCrewCards.filter(card => card.title.toLowerCase().includes(crewSearchQuery.toLowerCase()))
                        : defaultRoleCards.filter(card => card.name.toLowerCase().includes(roleSearchQuery.toLowerCase()));
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

            {/* Right card - Quick Looks (full width when stacked, 40% when side-by-side) */}
            <div 
              className="w-full min-[1200px]:w-[40%] rounded-2xl px-4 py-4" 
              style={{ 
                backgroundColor: '#141318',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Time Selection - always visible */}
              <div className="flex flex-col" style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                    borderRadius: '1rem',
                    overflow: 'visible',
                    paddingTop: 16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 22,
                    gap: 16,
                  }}>
                    {/* Title inside container */}
                    <span className="text-med" style={{ fontFamily: 'var(--font-open-sans)', color: '#DBDADB', fontWeight: 350 }}>
                      Time Selection
                    </span>
                    
                    {/* Year carousel row */}
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        className="flex items-center justify-center transition-all"
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
                        className="flex items-center justify-center transition-all"
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
                        className="flex items-center justify-center transition-all"
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
                                  className="absolute flex flex-col"
                                  style={{
                                    width: cardWidth,
                                    height: thisCardHeight,
                                    left: leftOffset,
                                    top: topOffset,
                                    background: bgColor,
                                    boxShadow: isSelected
                                      ? '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08)'
                                      : '0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.02)',
                                    borderRadius: '1rem',
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
                                      // Toggle all days
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
                        className="flex items-center justify-center transition-all"
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
                className="flex flex-col p-4"
                style={{ 
                  marginTop: '1.2rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
                  borderRadius: '1rem',
                }}
              >
                {/* Quick Looks title */}
                <span 
                  className="text-med mb-4" 
                  style={{ 
                    fontFamily: 'var(--font-open-sans)', 
                    color: '#DBDADB', 
                    fontWeight: 350 
                  }}
                >
                  Quick Looks
                </span>

                {/* Two-column layout for Quick Looks content */}
                <div className="flex gap-4">
                  {/* Left column - fixed width for buttons/circles */}
                  <div className="flex flex-col items-center" style={{ width: 24 }}>
                  {/* Crew icon button */}
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
                    className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 ${carouselNav.canGoUp ? 'hover:brightness-125' : ''}`}
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
                    className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 ${carouselNav.canGoDown ? 'hover:brightness-125' : ''}`}
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
                    renderButtons={false}
                    onNavigationChange={handleCarouselNavigationChange}
                    onCardClick={(card) => {
                      setSelectedCrew(card);
                      setSelectedRole(null); // Clear any selected role
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
                      renderButtons={false}
                      onNavigationChange={handleRoleCarouselNavigationChange}
                      onCardClick={(card) => {
                        setSelectedRole(card);
                        setSelectedCrew(null); // Clear any selected crew
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
