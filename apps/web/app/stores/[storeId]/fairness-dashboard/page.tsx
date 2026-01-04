'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon, PlusIcon } from '@heroicons/react/20/solid';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import { StatGraphCard, GraphCardWithStatsTransparent, GraphCardSimple, SatisfactionLineGraph, CrewQuickLookCarousel, RoleQuickLookCarousel, CrewQuickLookCardStatic, RoleQuickLookCardStatic, defaultCrewCards, defaultRoleCards, CrewCardData, RoleCardData, RoleHeatmap, CrewFairnessTable } from './components';

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
      <div className="flex-1">
        {children}
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
  const CREW_CARDS_PER_PAGE = 7;
  const ROLE_CARDS_PER_PAGE = 6;
  
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
    <main>
      <Header dark />
      <div className="bg-black min-h-screen">
        <div className="px-6 lg:px-8 py-9">
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
              <div className="relative flex items-center justify-center mb-4" style={{ zIndex: 20 }}>
                {/* Left: Dropdown for view selection */}
                <Menu as="div" className="absolute left-0">
                  <MenuButton 
                    className="inline-flex items-center gap-1 text-med focus:outline-none"
                    style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6A70', fontWeight: 350 }}
                  >
                    <ChevronDownIcon className="w-4 h-4" style={{ color: '#FFFFFF' }} />
                    {DASHBOARD_VIEWS.find(v => v.id === activeView)?.name || 'Overview'}
                  </MenuButton>
                  <MenuItems
                    transition
                    className="absolute left-0 z-10 mt-2 w-40 origin-top-left rounded-md shadow-lg outline outline-1 outline-black/5 transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none"
                    style={{ backgroundColor: '#262628' }}
                  >
                    <div className="py-1">
                      {DASHBOARD_VIEWS.map((view) => (
                        <MenuItem key={view.id}>
                          <div className="flex items-center justify-between px-4 py-2">
                            <button
                              onClick={() => {
                                setActiveView(view.id);
                                setSelectedCrew(null); // Clear individual crew selection
                                setSelectedRole(null); // Clear individual role selection
                                // Link crew/roles to expanded Quick Looks
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
                            {view.hasExpand && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveView(view.id);
                                  setSelectedCrew(null); // Clear individual crew selection
                                  setSelectedRole(null); // Clear individual role selection
                                  // Set expanded quick look for crew/roles
                                  if (view.id === 'crew') {
                                    setCrewPage(1);
                                    setExpandedQuickLook('crew');
                                  } else if (view.id === 'roles') {
                                    setRolePage(1);
                                    setExpandedQuickLook('roles');
                                  }
                                  togglePanel(view.id as ExpandedPanel);
                                }}
                                className="focus:outline-none ml-2"
                              >
                                <PlusIcon className="w-4 h-4" style={{ color: '#FFFFFF' }} />
                              </button>
                            )}
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

                {/* Right: Date with plus */}
                <div className="absolute right-0 flex items-center gap-1">
                  <span className="text-med" style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6A70', fontWeight: 350 }}>
                    20-27 Jun, 25
                  </span>
                  <button onClick={() => togglePanel('date')} className="focus:outline-none">
                    <PlusIcon className="w-4 h-4" style={{ color: '#FFFFFF' }} />
                  </button>
                </div>
              </div>
              
              {/* Conditional content: Individual Crew Dashboard, Dashboard, or Expanded Quick Looks */}
              {selectedCrew ? (
                /* Individual Crew Dashboard */
                <div 
                  className="animate-in fade-in slide-in-from-bottom-4 duration-300"
                  style={{ animationFillMode: 'both' }}
                >
                  {/* 2 Mini cards in a row */}
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
                  
                  {/* Satisfaction distribution box plot */}
                  <div className="mt-5">
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
                  
                  {/* Satisfaction over shifts line graph */}
                  <div className="-mt-2">
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
                  
                  {/* Preferences Met graph - individual crew level */}
                  <div className="-mt-2">
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
                  {/* 3 Mini cards in a row, stacks to 1 column on narrow screens */}
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
                  
                  {/* Crew mins distribution box plot */}
                  <div className="mt-5">
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
                  
                  {/* Role assignment heatmap */}
                  <div className="-mt-2">
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
                  
                  {/* Crew fairness details table */}
                  <div className="-mt-2">
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
                  {/* Mini cards grid (4 cards) */}
                  <div className="grid grid-cols-2 gap-3">
                    {currentDashboard.miniCards.map((cardData, index) => (
                      <StatGraphCard key={index} data={cardData} />
                    ))}
                  </div>

                  {/* Large graph card */}
                  <div className="mt-5">
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

                  {/* Preferences Met graph */}
                  <div className="mt-5">
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
                <div className="flex flex-col flex-1">
                  <div 
                    className="flex flex-col gap-3 flex-1"
                    style={{ 
                      paddingRight: '4px',
                    }}
                  >
                    {expandedQuickLook === 'crew' && (
                      <>
                        {defaultCrewCards
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
                          })}
                      </>
                    )}
                    {expandedQuickLook === 'roles' && (
                      <>
                        {defaultRoleCards
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
                          })}
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
                      const totalCards = expandedQuickLook === 'crew' ? defaultCrewCards.length : defaultRoleCards.length;
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
              {/* Header - left aligned */}
              <div className="mb-4">
                <h2 className="text-med" style={{ fontFamily: 'var(--font-open-sans)', color: '#DBDADB', fontWeight: 350 }}>
                  {expandedPanel === 'date' && 'Time Selection'}
                  {expandedPanel === 'roles' && 'Roles'}
                  {expandedPanel === 'crew' && 'Crew'}
                  {expandedPanel === 'none' && 'Selection'}
                </h2>
              </div>

              {/* Content area - height matches 2 rows of mini cards + gap (120px + 12px + 120px) */}
              <div style={{ height: '252px' }}>
                {/* Date Picker Panel */}
                {expandedPanel === 'date' && (
                  <div className="h-full">
                    <div className="p-4 h-full" style={{ 
                      background: 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                      borderRadius: '1rem' 
                    }}>
                      <p className="text-sm" style={{ fontFamily: 'var(--font-open-sans)', color: '#7C7F82', fontWeight: 350 }}>
                        Date picker component will go here
                      </p>
                    </div>
                  </div>
                )}

                {/* Roles Search Panel */}
                {expandedPanel === 'roles' && (
                  <div className="h-full flex flex-col p-4" style={{ 
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                    borderRadius: '1rem' 
                  }}>
                    <input
                      type="text"
                      placeholder="Search roles..."
                      className="w-full px-3 py-2 text-sm focus:outline-none"
                      style={{ 
                        fontFamily: 'var(--font-open-sans)',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        borderRadius: '0.5rem',
                        color: '#DBDADB',
                        fontWeight: 350,
                      }}
                    />
                    <div className="mt-3 space-y-2 flex-1 overflow-auto">
                      {['Cashier', 'Manager', 'Stock Room', 'Customer Service'].map((role) => (
                        <div 
                          key={role}
                          className="px-3 py-2 cursor-pointer transition-colors"
                          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '0.5rem' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                        >
                          <span className="text-sm" style={{ fontFamily: 'var(--font-open-sans)', color: '#DBDADB', fontWeight: 350 }}>
                            {role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Crew Search Panel */}
                {expandedPanel === 'crew' && (
                  <div className="h-full flex flex-col p-4" style={{ 
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                    borderRadius: '1rem' 
                  }}>
                    <input
                      type="text"
                      placeholder="Search crew members..."
                      className="w-full px-3 py-2 text-sm focus:outline-none"
                      style={{ 
                        fontFamily: 'var(--font-open-sans)',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        borderRadius: '0.5rem',
                        color: '#DBDADB',
                        fontWeight: 350,
                      }}
                    />
                    <div className="mt-3 space-y-2 flex-1 overflow-auto">
                      {['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown'].map((member) => (
                        <div 
                          key={member}
                          className="px-3 py-2 cursor-pointer transition-colors"
                          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '0.5rem' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                        >
                          <span className="text-sm" style={{ fontFamily: 'var(--font-open-sans)', color: '#DBDADB', fontWeight: 350 }}>
                            {member}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Default state when no panel is expanded */}
                {expandedPanel === 'none' && (
                  <div className="h-full flex items-center justify-center" style={{ 
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                    borderRadius: '1rem' 
                  }}>
                    <p className="text-sm" style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6A70', fontWeight: 350 }}>
                      Click + to expand a panel
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Looks title */}
              <div 
                className="mb-4"
                style={{ marginTop: '1.2rem', paddingTop: '1.2rem' }}
              >
                <span 
                  className="text-med" 
                  style={{ 
                    fontFamily: 'var(--font-open-sans)', 
                    color: '#DBDADB', 
                    fontWeight: 350 
                  }}
                >
                  Quick Looks
                </span>
              </div>

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
                    <div className="flex items-center justify-start gap-2" style={{ marginTop: '40px' }}>
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
    </main>
  );
}
