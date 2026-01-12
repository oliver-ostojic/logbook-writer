'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { UserGroupIcon, CalendarIcon, BriefcaseIcon, CheckCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { DashboardLayout } from '@/components/layouts';
import { CardHeader, CardSmall, CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { useRouter } from 'next/navigation';
import { CrewForm, CrewDetailView, RoleForm, RoleDetailView, LogbookPdfViewer, LogbookSupersededHistory } from './components';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const VIEW_OPTIONS = [
  { id: 'home', name: 'Home', title: 'Overview' },
  { id: 'crew', name: 'Crew', title: 'List View' },
  { id: 'roles', name: 'Roles', title: 'List View' },
  { id: 'logbooks', name: 'Logbooks', title: 'List View' },
];

// Placeholder crew data
const crewData = [
  { id: '1', name: 'Sarah Chen' },
  { id: '2', name: 'Mike Rodriguez' },
  { id: '3', name: 'Alex Kim' },
  { id: '4', name: 'Emily Johnson' },
  { id: '5', name: 'David Park' },
  { id: '6', name: 'Jessica Lee' },
  { id: '7', name: 'Chris Martinez' },
  { id: '8', name: 'Amanda Thompson' },
  { id: '9', name: 'Ryan Wilson' },
  { id: '10', name: 'Nicole Brown' },
  { id: '11', name: 'Kevin Davis' },
  { id: '12', name: 'Lisa Garcia' },
];

// Placeholder roles data
const rolesData = [
  { id: '1', name: 'Register' },
  { id: '2', name: 'Product' },
  { id: '3', name: 'Demo' },
  { id: '4', name: 'Break' },
  { id: '5', name: 'Training' },
  { id: '6', name: 'Inventory' },
  { id: '7', name: 'Customer Service' },
  { id: '8', name: 'Stocking' },
];

// Placeholder logbooks data
const logbooksData = [
  { id: '1', date: new Date('2025-01-11') },
  { id: '2', date: new Date('2025-01-10') },
  { id: '3', date: new Date('2025-01-09') },
  { id: '4', date: new Date('2025-01-08') },
  { id: '5', date: new Date('2025-01-07') },
  { id: '6', date: new Date('2025-01-06') },
  { id: '7', date: new Date('2025-01-05') },
  { id: '8', date: new Date('2025-01-04') },
  { id: '9', date: new Date('2025-01-03') },
  { id: '10', date: new Date('2025-01-02') },
  { id: '11', date: new Date('2025-01-01') },
  { id: '12', date: new Date('2024-12-31') },
];

// Format date as "5 Jan, 2025"
function formatLogbookDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

// Light mode ListRowItem component
function ListRowItemLight({
  itemNumber,
  isFirst,
  isLast,
  children,
  onView,
  onEdit,
  onDelete,
}: {
  itemNumber: number;
  isFirst: boolean;
  isLast: boolean;
  children: React.ReactNode;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex transition-transform duration-200"
      style={{
        position: 'relative',
        gap: 16,
        cursor: onView ? 'pointer' : 'default',
        transform: isHovered ? 'scale(1.01)' : 'scale(1)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onView}
    >
      {/* Number column with lines */}
      <div className="flex flex-col items-center" style={{ width: 24, position: 'relative' }}>
        {/* Top line for first item */}
        {isFirst && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: 'calc(50% - 12px)',
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(0,0,0,0.1) 40%, transparent 95%, transparent 100%)',
            }}
          />
        )}
        {/* Number badge - centered */}
        <div
          className="flex items-center justify-center rounded-full transition-all duration-200"
          style={{
            width: 24,
            height: 24,
            background: isHovered ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
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
              color: isHovered ? '#2C2C2C' : '#6B6B6B',
              fontWeight: 350,
            }}
          >
            {itemNumber}
          </span>
        </div>
        {/* Connecting line to next number */}
        {!isLast && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(50% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: 'calc(100% - 24px + 12px)',
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, transparent 95%, transparent 100%)',
            }}
          />
        )}
        {/* Bottom line for last item */}
        {isLast && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(50% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: 'calc(50% - 12px)',
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(0,0,0,0.1) 60%, transparent 95%, transparent 100%)',
            }}
          />
        )}
      </div>
      <div
        className="flex-1 ai-glass-border transition-all duration-200"
        style={{
          ...aiGlassLightBorderStyle('1rem'),
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between transition-all duration-200"
          style={{
            ...aiGlassLightContentStyle('1rem', 0.6),
            backgroundColor: isHovered ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.02)',
            position: 'relative',
            zIndex: 0,
            padding: '12px 16px',
          }}
        >
          {/* Left side: Name + Edit button */}
          <div className="flex items-center gap-3">
            <div className="flex-1">{children}</div>
            <div
              className="transition-opacity duration-200"
              style={{ opacity: isHovered ? 1 : 0 }}
            >
              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                  }}
                  className="transition-opacity duration-150"
                  style={{
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '4px 12px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
          {/* Right side: Delete button */}
          <div
            className="transition-opacity duration-200"
            style={{ opacity: isHovered ? 1 : 0 }}
          >
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
                className="transition-opacity duration-150"
                style={{
                  background: 'hsla(0, 84%, 60%, 0.85)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '4px 12px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Placeholder activity data
const activity = [
  { id: 1, type: 'created', person: { name: 'Sarah Chen' }, date: '2d ago', dateTime: '2026-01-09T10:32' },
  { id: 2, type: 'edited', person: { name: 'Sarah Chen' }, date: '2d ago', dateTime: '2026-01-09T11:03' },
  {
    id: 3,
    type: 'commented',
    person: { name: 'Mike Rodriguez' },
    comment: 'Adjusted Demo coverage for the afternoon rush. Looks good now.',
    date: '1d ago',
    dateTime: '2026-01-10T09:15',
  },
  { id: 4, type: 'published', person: { name: 'Sarah Chen' }, date: '1d ago', dateTime: '2026-01-10T10:00' },
  {
    id: 5,
    type: 'commented',
    person: { name: 'Alex Kim' },
    comment: 'Team is happy with the new schedule. Great work!',
    date: '12h ago',
    dateTime: '2026-01-10T22:30',
  },
  { id: 6, type: 'created', person: { name: 'Sarah Chen' }, date: '4h ago', dateTime: '2026-01-11T06:00' },
];

// Type for items that can be edited/deleted/viewed
type EditableItem = {
  id: string;
  name: string;
  type: 'crew' | 'roles' | 'logbooks';
};

type SelectedItem = EditableItem & {
  mode: 'view' | 'edit' | 'add' | 'pdf' | 'history';
};

const ITEMS_PER_PAGE = 8;

export default function Home() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [activeView, setActiveView] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EditableItem | null>(null);
  const [crewPage, setCrewPage] = useState(1);
  const [rolesPage, setRolesPage] = useState(1);
  const [logbooksPage, setLogbooksPage] = useState(1);
  const [activityFilter, setActivityFilter] = useState('today');
  const [commentText, setCommentText] = useState('');

  // Check if we're in PDF view mode (for panel width adjustment)
  const isPdfView = selectedItem?.mode === 'pdf' && selectedItem?.type === 'logbooks';

  // API data states
  const [apiCrew, setApiCrew] = useState<any[]>([]);
  const [apiRoles, setApiRoles] = useState<any[]>([]);
  const [apiLogbooks, setApiLogbooks] = useState<any[]>([]);

  // Fetch data from API
  useEffect(() => {
    async function fetchData() {
      try {
        const [crewRes, rolesRes, logbooksRes] = await Promise.all([
          fetch(`${API_URL}/crew?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/logbooks?storeId=${storeId}`).then(r => r.ok ? r.json() : { logbooks: [] }),
        ]);
        setApiCrew(Array.isArray(crewRes) ? crewRes : []);
        setApiRoles(Array.isArray(rolesRes) ? rolesRes : []);
        // Logbooks API returns { logbooks: [...], total, limit, offset }
        const logbooks = logbooksRes?.logbooks || [];
        setApiLogbooks(Array.isArray(logbooks) ? logbooks : []);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    }
    fetchData();
  }, [storeId]);

  // Use API data if available, otherwise fall back to placeholder
  const effectiveCrew = apiCrew.length > 0 ? apiCrew.map((c: any) => ({ id: c.id, name: c.name })) : crewData;
  const effectiveRoles = (apiRoles.length > 0
    ? apiRoles.map((r: any) => ({ id: String(r.id), name: r.displayName }))
    : rolesData
  ).sort((a, b) => a.name.localeCompare(b.name)); // Sort A-Z ascending

  // For logbooks, deduplicate by date - show only the "best" status per date
  // Priority: PUBLISHED > DRAFT > SUPERSEDED
  const dedupeLogbooks = (logbooks: any[]) => {
    const statusPriority: Record<string, number> = { PUBLISHED: 3, DRAFT: 2, SUPERSEDED: 1 };
    const byDate = new Map<string, any>();

    for (const l of logbooks) {
      const dateKey = new Date(l.date).toISOString().split('T')[0];
      const existing = byDate.get(dateKey);
      const currentPriority = statusPriority[l.status] || 0;
      const existingPriority = existing ? (statusPriority[existing.status] || 0) : -1;

      if (currentPriority > existingPriority) {
        byDate.set(dateKey, l);
      }
    }

    return Array.from(byDate.values());
  };

  const effectiveLogbooks = apiLogbooks.length > 0
    ? dedupeLogbooks(apiLogbooks).map((l: any) => ({
        id: l.id,
        date: new Date(l.date),
        status: l.status,
        hasSuperseded: l.hasSupersededVersions || false
      }))
    : logbooksData.map(l => ({ ...l, status: 'PUBLISHED', hasSuperseded: false }));

  const ACTIVITY_FILTER_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'last2days', label: 'Last 2 days' },
    { id: 'oneweek', label: 'One week' },
    { id: 'onemonth', label: 'One month' },
  ];

  // Filter data based on search query
  const filteredCrew = effectiveCrew.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRoles = effectiveRoles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredLogbooks = effectiveLogbooks.filter(l =>
    formatLogbookDate(l.date).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to refresh data after mutations
  const refreshData = async () => {
    try {
      const [crewRes, rolesRes, logbooksRes] = await Promise.all([
        fetch(`${API_URL}/crew?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/logbooks?storeId=${storeId}`).then(r => r.ok ? r.json() : { logbooks: [] }),
      ]);
      setApiCrew(Array.isArray(crewRes) ? crewRes : []);
      setApiRoles(Array.isArray(rolesRes) ? rolesRes : []);
      const logbooks = logbooksRes?.logbooks || [];
      setApiLogbooks(Array.isArray(logbooks) ? logbooks : []);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  // Handle delete
  const handleDelete = async (item: EditableItem) => {
    try {
      const endpoint = item.type === 'crew' ? `/crew/${item.id}` :
                       item.type === 'roles' ? `/roles/${item.id}` :
                       `/logbooks/${item.id}`;
      const res = await fetch(`${API_URL}${endpoint}`, { method: 'DELETE' });
      if (res.ok) {
        refreshData();
        setDeleteConfirmItem(null);
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // Render list view content
  const renderListView = (type: 'crew' | 'roles' | 'logbooks') => {
    const data = type === 'crew' ? filteredCrew : type === 'roles' ? filteredRoles : filteredLogbooks;
    const currentPage = type === 'crew' ? crewPage : type === 'roles' ? rolesPage : logbooksPage;
    const setPage = type === 'crew' ? setCrewPage : type === 'roles' ? setRolesPage : setLogbooksPage;

    // Calculate pagination
    const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedData = data.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // Reset to page 1 if current page is out of bounds
    if (currentPage > totalPages && totalPages > 0) {
      setPage(1);
    }

    // Generate page numbers with ellipsis
    const getPageNumbers = (): (number | string)[] => {
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
      return pages;
    };

    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
        <div className="flex flex-col" style={{ minHeight: '400px' }}>
          {/* Search and Add bar - bento box style */}
          <div className="mb-4 flex gap-2" style={{ paddingTop: '4px' }}>
            {/* Search section - pill left, rounded right */}
            <div
              className="ai-glass-border flex-1 rounded-l-full rounded-r-md overflow-hidden"
              style={aiGlassLightBorderStyle('1rem')}
            >
              <div
                className="flex items-center rounded-l-full rounded-r-md"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  padding: '0 14px',
                  height: '36px',
                }}
              >
                <MagnifyingGlassIcon style={{ width: 14, height: 14, color: '#6B6B6B', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
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
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setPage(1);
                    }}
                    className="transition-all hover:brightness-75"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#6B6B6B',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '16px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Add button - rounded left, pill right */}
            <div
              className="ai-glass-border rounded-l-md rounded-r-full overflow-hidden"
              style={aiGlassLightBorderStyle('1rem')}
            >
              <button
                onClick={() => setSelectedItem({ id: 'new', name: `New ${type === 'crew' ? 'Crew Member' : type === 'roles' ? 'Role' : 'Logbook'}`, type, mode: 'add' })}
                className="flex items-center justify-center gap-1 transition-all duration-200 rounded-l-md rounded-r-full"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  padding: '0 18px',
                  height: '36px',
                  border: 'none',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.07)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                }}
              >
                <span style={{ fontSize: '16px', lineHeight: 1, color: 'hsl(0, 84%, 60%)' }}>+</span>
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Paginated list */}
          <div
            className="flex flex-col gap-3 flex-1"
            style={{
              paddingTop: '8px',
            }}
          >
            {paginatedData.map((item, index) => {
              const globalIndex = startIndex + index;
              const isFirst = index === 0;
              const isLast = index === paginatedData.length - 1;
              const itemName = type === 'logbooks'
                ? formatLogbookDate((item as typeof logbooksData[0]).date)
                : (item as typeof crewData[0]).name;
              return (
                <ListRowItemLight
                  key={item.id}
                  itemNumber={globalIndex + 1}
                  isFirst={isFirst}
                  isLast={isLast}
                  onView={() => {
                    if (type === 'logbooks') {
                      // For logbooks, clicking row opens version history
                      setSelectedItem({ id: item.id, name: itemName, type, mode: 'history' });
                    } else {
                      setSelectedItem({ id: item.id, name: itemName, type, mode: 'view' });
                    }
                  }}
                  onEdit={() => {
                    if (type === 'logbooks') {
                      // For logbooks, edit button navigates to preview page
                      router.push(`/stores/${storeId}/logbook/create/preview?logbookId=${item.id}`);
                    } else {
                      setSelectedItem({ id: item.id, name: itemName, type, mode: 'edit' });
                    }
                  }}
                  onDelete={() => setDeleteConfirmItem({ id: item.id, name: itemName, type })}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 400,
                      color: '#2C2C2C',
                    }}
                  >
                    {itemName}
                  </span>
                </ListRowItemLight>
              );
            })}
            {data.length === 0 && (
              <div
                className="flex items-center justify-center flex-1"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#6B6B6B',
                }}
              >
                No results found
              </div>
            )}
          </div>

          {/* Pagination buttons */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-center gap-2 mt-4 pt-3"
              style={{
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
                  background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)',
                }}
              />
              {getPageNumbers().map((page, idx) =>
                page === '...' ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="text-sm px-1"
                    style={{ color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setPage(page as number)}
                    className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                    style={{
                      background: currentPage === page ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      cursor: 'pointer',
                      opacity: currentPage === page ? 1 : 0.6,
                    }}
                    onMouseEnter={(e) => {
                      if (currentPage !== page) {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)';
                        e.currentTarget.style.opacity = '0.8';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== page) {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.03)';
                        e.currentTarget.style.opacity = '0.6';
                      }
                    }}
                  >
                    <span
                      className="text-[12px]"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#2C2C2C',
                        fontWeight: currentPage === page ? 500 : 350,
                      }}
                    >
                      {page}
                    </span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </CardContainer>
    );
  };

  return (
    <>
    <DashboardLayout
      rightPanelVisible={!!selectedItem}
      leftPanelWidth={isPdfView ? '40%' : undefined}
      rightPanelWidth={isPdfView ? '60%' : undefined}
      rightPanelKey={selectedItem ? `${selectedItem.id}-${selectedItem.type}-${selectedItem.mode}` : undefined}
      navLinks={[
        { label: 'Home', href: `/stores/${storeId}/home` },
        { label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` },
        { label: 'Settings', href: `/stores/${storeId}/settings` },
      ]}
      leftPanel={
        <div className="flex flex-col gap-4">
          {/* Header with dropdown */}
          <CardHeader
            title={VIEW_OPTIONS.find(v => v.id === activeView)?.title || 'Overview'}
            lightMode={true}
            borderRadius="1.5rem"
            titleStyle={{ color: '#2C2C2C' }}
            leftContent={
              <Menu as="div" style={{ zIndex: 100 }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <MenuButton
                    className="inline-flex items-center text-med focus:outline-none focus:ring-0 transition-all"
                    style={{
                      position: 'relative' as const,
                      zIndex: 0,
                      width: '100%',
                      height: '100%',
                      background: 'hsla(0, 84%, 60%, 0.85)',
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'hsla(0, 84%, 55%, 0.95)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'hsla(0, 84%, 60%, 0.85)';
                    }}
                  >
                    {VIEW_OPTIONS.find(v => v.id === activeView)?.name || 'Home'}
                  </MenuButton>
                </div>
                <MenuItems
                  anchor="bottom start"
                  portal={false}
                  transition
                  className="w-40 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                  style={{
                    zIndex: 100,
                    ...aiGlassLightBorderStyle('0.75rem'),
                    marginTop: 8,
                  }}
                >
                  <div
                    className="py-1"
                    style={{
                      ...aiGlassLightContentStyle('0.75rem', 0.6),
                      backdropFilter: 'blur(2px)',
                      WebkitBackdropFilter: 'blur(2px)',
                    }}
                  >
                    {VIEW_OPTIONS.map((view) => (
                      <MenuItem key={view.id}>
                        <div className="flex items-center justify-between px-4 py-2">
                          <button
                            onClick={() => {
                              setActiveView(view.id);
                              setSearchQuery('');
                            }}
                            className="text-left text-sm focus:outline-none flex-1"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: activeView === view.id ? '#2C2C2C' : '#6B6B6B',
                              backgroundColor: 'transparent',
                            }}
                            onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
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
            }
            rightContent={
              activeView !== 'home' ? (
                <button
                  onClick={() => {
                    setActiveView('home');
                    setSearchQuery('');
                  }}
                  className="transition-all duration-200"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 400,
                    color: '#9A999E',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#2C2C2C';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#9A999E';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Back
                </button>
              ) : undefined
            }
          />

          {/* Content based on active view */}
          {activeView === 'home' ? (
            <>
              {/* Mini stats cards */}
              <CardContainer lightMode={true} borderRadius="1.5rem">
                <div className="grid grid-cols-3 gap-3">
                {/* Crew Count Card */}
            <CardSmall lightMode={true} contentStyle={{ padding: '16px' }} onClick={() => setActiveView('crew')}>
              <div className="flex flex-col h-full justify-between">
                {/* Top row: Icon and Label */}
                <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.375rem'), width: 24, height: 24 }}>
                    <div
                      className="flex items-center justify-center w-full h-full"
                      style={{ ...aiGlassLightContentStyle('0.375rem', 0.7), backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                    >
                      <UserGroupIcon className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      lineHeight: 1,
                      textAlign: 'right',
                    }}
                  >
                    Crew
                  </span>
                </div>

                {/* Bottom: Count label and Stat Number */}
                <div style={{ marginBottom: '-6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      display: 'block',
                      marginBottom: '-4px',
                    }}
                  >
                    Count
                  </span>
                  <div
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '24px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {effectiveCrew.length}
                  </div>
                </div>
              </div>
            </CardSmall>

            {/* Logbook Count Card */}
            <CardSmall lightMode={true} contentStyle={{ padding: '16px' }} onClick={() => setActiveView('logbooks')}>
              <div className="flex flex-col h-full justify-between">
                {/* Top row: Icon and Label */}
                <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.375rem'), width: 24, height: 24 }}>
                    <div
                      className="flex items-center justify-center w-full h-full"
                      style={{ ...aiGlassLightContentStyle('0.375rem', 0.7), backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      lineHeight: 1,
                      textAlign: 'right',
                    }}
                  >
                    Logbooks
                  </span>
                </div>

                {/* Bottom: Count label and Stat Number */}
                <div style={{ marginBottom: '-6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      display: 'block',
                      marginBottom: '-4px',
                    }}
                  >
                    Count
                  </span>
                  <div
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '24px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {effectiveLogbooks.length}
                  </div>
                </div>
              </div>
            </CardSmall>

            {/* Role Count Card */}
            <CardSmall lightMode={true} contentStyle={{ padding: '16px' }} onClick={() => setActiveView('roles')}>
              <div className="flex flex-col h-full justify-between">
                {/* Top row: Icon and Label */}
                <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('0.375rem'), width: 24, height: 24 }}>
                    <div
                      className="flex items-center justify-center w-full h-full"
                      style={{ ...aiGlassLightContentStyle('0.375rem', 0.7), backgroundColor: 'rgba(0, 0, 0, 0.06)' }}
                    >
                      <BriefcaseIcon className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      lineHeight: 1,
                      textAlign: 'right',
                    }}
                  >
                    Roles
                  </span>
                </div>

                {/* Bottom: Count label and Stat Number */}
                <div style={{ marginBottom: '-6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 350,
                      color: '#6B6B6B',
                      display: 'block',
                      marginBottom: '-4px',
                    }}
                  >
                    Count
                  </span>
                  <div
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '24px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {effectiveRoles.length}
                  </div>
                </div>
              </div>
            </CardSmall>
            </div>
          </CardContainer>

          {/* Activity Log */}
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                {/* Activity Log label pill */}
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px') }}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    Activity Log
                  </div>
                </div>

                {/* Time filter dropdown */}
                <Menu as="div" style={{ zIndex: 100 }}>
                  <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                    <MenuButton
                      className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        padding: '6px 14px',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#6B6B6B',
                        cursor: 'pointer',
                      }}
                    >
                      {ACTIVITY_FILTER_OPTIONS.find(o => o.id === activityFilter)?.label}
                      <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </MenuButton>
                  </div>
                  <MenuItems
                    anchor="bottom end"
                    portal={false}
                    transition
                    className="w-36 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                    style={{
                      zIndex: 100,
                      ...aiGlassLightBorderStyle('0.75rem'),
                      marginTop: 8,
                    }}
                  >
                    <div
                      className="py-1"
                      style={{
                        ...aiGlassLightContentStyle('0.75rem', 0.6),
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)',
                      }}
                    >
                      {ACTIVITY_FILTER_OPTIONS.map((option) => (
                        <MenuItem key={option.id}>
                          <div className="flex items-center justify-between px-4 py-2">
                            <button
                              onClick={() => setActivityFilter(option.id)}
                              className="text-left text-sm focus:outline-none flex-1"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                color: activityFilter === option.id ? '#2C2C2C' : '#6B6B6B',
                                backgroundColor: 'transparent',
                              }}
                              onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                              onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                            >
                              {option.label}
                            </button>
                          </div>
                        </MenuItem>
                      ))}
                    </div>
                  </MenuItems>
                </Menu>
              </div>
              <ul className="space-y-6">
                {activity.map((activityItem, activityItemIdx) => (
                  <li key={activityItem.id} className="relative flex gap-x-4">
                    {/* Timeline line */}
                    <div
                      className={`absolute left-0 top-0 flex w-6 justify-center ${
                        activityItemIdx === activity.length - 1 ? 'h-6' : '-bottom-6'
                      }`}
                    >
                      <div className="w-px" style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
                    </div>

                    {activityItem.type === 'commented' ? (
                      <>
                        {/* Avatar for comments - white circle behind to cut line */}
                        <div
                          className="relative mt-3 flex-none rounded-full flex items-center justify-center"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: 'white',
                            boxShadow: '0 0 0 12px white',
                          }}
                        >
                          <div
                            className="w-full h-full rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: 'rgba(0, 0, 0, 0.08)',
                              fontSize: '10px',
                              fontWeight: 500,
                              color: '#6B6B6B',
                            }}
                          >
                            {activityItem.person.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        </div>
                        {/* Comment bubble */}
                        <div
                          className="flex-auto p-3"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.03)',
                            border: '1px solid rgba(0, 0, 0, 0.06)',
                            borderRadius: '1rem',
                          }}
                        >
                          <div className="flex justify-between gap-x-4">
                            <div style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                              <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{activityItem.person.name}</span> commented
                            </div>
                            <time
                              dateTime={activityItem.dateTime}
                              style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                            >
                              {activityItem.date}
                            </time>
                          </div>
                          <p style={{ fontSize: '13px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)', marginTop: '4px' }}>
                            {activityItem.comment}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Icon for system events - white circle behind to cut line */}
                        <div
                          className="relative flex flex-none items-center justify-center rounded-full"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: 'white',
                            boxShadow: activityItem.type === 'published' ? '0 0 0 12px white' : '0 0 0 4px white',
                          }}
                        >
                          {activityItem.type === 'published' ? (
                            <CheckCircleIcon className="w-6 h-6" style={{ color: 'hsl(0, 84%, 60%)' }} />
                          ) : (
                            <div
                              className="rounded-full"
                              style={{
                                width: 6,
                                height: 6,
                                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                border: '1px solid rgba(0, 0, 0, 0.2)',
                              }}
                            />
                          )}
                        </div>
                        {/* Event text */}
                        <p
                          className="flex-auto py-0.5"
                          style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                        >
                          <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{activityItem.person.name}</span>{' '}
                          {activityItem.type} the logbook.
                        </p>
                        <time
                          dateTime={activityItem.dateTime}
                          className="flex-none py-0.5"
                          style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                        >
                          {activityItem.date}
                        </time>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {/* Comment input placeholder */}
              <div className="mt-6 flex gap-x-3">
                <div
                  className="flex-none rounded-full flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: '#6B6B6B',
                  }}
                >
                  You
                </div>
                <div className="relative flex-auto">
                  <div
                    className="overflow-hidden"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.03)',
                      borderRadius: '1rem',
                    }}
                  >
                    <textarea
                      rows={4}
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="block w-full resize-none bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-0"
                      style={{ fontFamily: 'var(--font-open-sans)', color: '#2C2C2C', outline: 'none', border: 'none', boxShadow: 'none' }}
                    />
                    <div className="flex justify-end py-2 px-3">
                      <button
                        type="button"
                        className="rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200"
                        style={{
                          backgroundColor: commentText.trim() ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.05)',
                          color: commentText.trim() ? '#2C2C2C' : '#6B6B6B',
                          fontFamily: 'var(--font-open-sans)',
                          cursor: commentText.trim() ? 'pointer' : 'default',
                        }}
                        onMouseEnter={(e) => {
                          if (commentText.trim()) {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.18)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = commentText.trim() ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.05)';
                        }}
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContainer>
            </>
          ) : activeView === 'crew' ? (
            renderListView('crew')
          ) : activeView === 'roles' ? (
            renderListView('roles')
          ) : activeView === 'logbooks' ? (
            renderListView('logbooks')
          ) : null}
        </div>
      }
      rightPanel={
        selectedItem ? (
          selectedItem.mode === 'pdf' && selectedItem.type === 'logbooks' ? (
            // Logbook PDF viewer in right panel
            <LogbookPdfViewer
              logbookId={selectedItem.id}
              logbookDate={selectedItem.name}
              onBack={() => setSelectedItem({ ...selectedItem, mode: 'history' })}
            />
          ) : selectedItem.mode === 'history' && selectedItem.type === 'logbooks' ? (
            // Logbook superseded history view
            <LogbookSupersededHistory
              logbookId={selectedItem.id}
              onViewPdf={(logbookId, date) => {
                setSelectedItem({ id: logbookId, name: date, type: 'logbooks', mode: 'pdf' });
              }}
              onClose={() => setSelectedItem(null)}
            />
          ) : (
            <div className="flex flex-col gap-4 h-full">
              {/* Header with name and mode dropdown */}
              <CardHeader
                title={selectedItem.mode === 'add' ? `New ${selectedItem.type === 'crew' ? 'Crew Member' : selectedItem.type === 'roles' ? 'Role' : 'Logbook'}` : selectedItem.name}
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                leftContent={
                  <Menu as="div" style={{ zIndex: 100 }}>
                    <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                      <MenuButton
                        className="inline-flex items-center text-med focus:outline-none focus:ring-0 transition-all"
                        style={{
                          position: 'relative' as const,
                          zIndex: 0,
                          width: '100%',
                          height: '100%',
                          background: 'hsla(0, 84%, 60%, 0.85)',
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
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'hsla(0, 84%, 55%, 0.95)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'hsla(0, 84%, 60%, 0.85)';
                        }}
                      >
                        {selectedItem.mode === 'add' ? 'Add' : selectedItem.mode === 'edit' ? 'Edit' : selectedItem.mode === 'pdf' ? 'PDF' : selectedItem.mode === 'history' ? 'History' : 'View'}
                      </MenuButton>
                    </div>
                    <MenuItems
                      anchor="bottom start"
                      portal={false}
                      transition
                      className="w-32 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                      style={{
                        zIndex: 100,
                        ...aiGlassLightBorderStyle('0.75rem'),
                        marginTop: 8,
                      }}
                    >
                      <div
                        className="py-1"
                        style={{
                          ...aiGlassLightContentStyle('0.75rem', 0.6),
                          backdropFilter: 'blur(2px)',
                          WebkitBackdropFilter: 'blur(2px)',
                        }}
                      >
                        {(selectedItem.mode === 'add' ? ['add'] : selectedItem.type === 'logbooks' ? ['history', 'pdf'] : ['view', 'edit']).map((mode) => (
                          <MenuItem key={mode}>
                            <div className="flex items-center justify-between px-4 py-2">
                              <button
                                onClick={() => {
                                  setSelectedItem({ ...selectedItem, mode: mode as SelectedItem['mode'] });
                                }}
                                className="text-left text-sm focus:outline-none flex-1"
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  color: selectedItem.mode === mode ? '#2C2C2C' : '#6B6B6B',
                                  backgroundColor: 'transparent',
                                }}
                                onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                                onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                              >
                                {mode === 'add' ? 'Add' : mode === 'view' ? 'View' : mode === 'edit' ? 'Edit' : mode === 'history' ? 'History' : 'PDF'}
                              </button>
                            </div>
                          </MenuItem>
                        ))}
                      </div>
                    </MenuItems>
                  </Menu>
                }
                rightContent={
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="transition-colors duration-150"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px 8px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 400,
                      color: '#6B6B6B',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#2C2C2C'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#6B6B6B'}
                  >
                    ×
                  </button>
                }
              />
              {/* Content based on type and mode */}
              {selectedItem.type === 'crew' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
                <CrewForm
                  mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
                  crewId={selectedItem.mode === 'edit' ? selectedItem.id : undefined}
                  storeId={storeId}
                  onSuccess={() => {
                    refreshData();
                    setSelectedItem(null);
                  }}
                  onCancel={() => setSelectedItem(null)}
                />
              ) : selectedItem.type === 'crew' && selectedItem.mode === 'view' ? (
                <CrewDetailView crewId={selectedItem.id} />
              ) : selectedItem.type === 'roles' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
                <RoleForm
                  mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
                  roleId={selectedItem.mode === 'edit' ? Number(selectedItem.id) : undefined}
                  storeId={storeId}
                  onSuccess={() => {
                    refreshData();
                    setSelectedItem(null);
                  }}
                  onCancel={() => setSelectedItem(null)}
                />
              ) : selectedItem.type === 'roles' && selectedItem.mode === 'view' ? (
                <RoleDetailView roleId={Number(selectedItem.id)} />
              ) : (
                <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
                  <div className="flex flex-col gap-4">
                    <p style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B' }}>
                      {selectedItem.mode === 'add' ? 'Adding new' : selectedItem.mode === 'edit' ? 'Editing' : 'Viewing'} {selectedItem.type === 'crew' ? 'crew member' : selectedItem.type === 'roles' ? 'role' : 'logbook'}{selectedItem.mode !== 'add' && <>: <span style={{ color: '#2C2C2C', fontWeight: 500 }}>{selectedItem.name}</span></>}
                    </p>
                  </div>
                </CardContainer>
              )}
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center">
              <h2 className="text-2xl font-medium mb-2" style={{ color: '#2C2C2C', fontFamily: 'var(--font-open-sans)' }}>
                Right Panel
              </h2>
              <p className="text-base" style={{ color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                Content goes here
              </p>
            </div>
          </div>
        )
      }
      activeNavItem="Home"
    />

    {/* Delete confirmation modal */}
    {deleteConfirmItem && (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 1000 }}
        onClick={() => setDeleteConfirmItem(null)}
      >
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1.5rem'),
            maxWidth: '400px',
            width: '90%',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1.5rem', 0.95),
              padding: '24px',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '18px',
                fontWeight: 500,
                color: '#2C2C2C',
                marginBottom: '12px',
              }}
            >
              Delete {deleteConfirmItem.type === 'crew' ? 'Crew Member' : deleteConfirmItem.type === 'roles' ? 'Role' : 'Logbook'}?
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#6B6B6B',
                marginBottom: '24px',
              }}
            >
              Are you sure you want to delete <span style={{ color: '#2C2C2C', fontWeight: 500 }}>{deleteConfirmItem.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#6B6B6B',
                  backgroundColor: 'rgba(0, 0, 0, 0.05)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmItem)}
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  backgroundColor: 'hsl(0, 84%, 60%)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
