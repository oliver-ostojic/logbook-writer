'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { UserGroupIcon, CalendarIcon, BriefcaseIcon, CheckCircleIcon, MagnifyingGlassIcon, HomeIcon, ChartBarIcon, Cog6ToothIcon, UserIcon, BellIcon, DocumentTextIcon, ShieldCheckIcon, AdjustmentsHorizontalIcon, ArrowRightOnRectangleIcon, BuildingStorefrontIcon } from '@heroicons/react/24/solid';
import { logout } from '@/lib/api/auth';
import { DashboardLayout } from '@/components/layouts';
import { CardHeader, CardSmall, CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillButton, GlassPillCard } from '@/components/ui/ai-glass';
import { useRouter } from 'next/navigation';
import { CrewForm, CrewDetailView, RoleForm, RoleDetailView, RoleFamilyForm, RoleFamilyDetailView, RoleRuleForm, RoleRuleDetailView, CompanyForm, CompanyDetailView, StoreForm, StoreDetailView, RunDetailView, LogbookPdfViewer, LogbookSupersededHistory, NavStatsCard, NavDivider } from './components';
import { renderRoleRule } from '@/lib/role-rule-templates';
import { ROLE_RULE_TYPE_LABELS } from '@/lib/role-rule-constants';
import { useAuthStore } from '@/lib/authStore';
import { fetchActivityLogs, postComment, deleteComment, ActivityLogItem, ActivityFilter } from '@/lib/api/activity';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const VIEW_OPTIONS = [
  { id: 'home', name: 'Home', title: 'Overview' },
  { id: 'crew', name: 'Crew', title: 'List View' },
  { id: 'roles', name: 'Roles', title: 'List View' },
  { id: 'preferences', name: 'Preferences', title: 'List View' },
  { id: 'logbooks', name: 'Logbooks', title: 'List View' },
] as const;

type ViewId = typeof VIEW_OPTIONS[number]['id'];

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

// Parse date string (YYYY-MM-DD) as local date without timezone conversion
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Format date as "5 Jan, 2025"
function formatLogbookDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

// Format date as "12/16/25"
function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

// Capitalize first letter and lowercase rest
function capitalizeStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

// User dropdown component for top nav
function UserDropdown() {
  const router = useRouter();
  const { user, logout: logoutStore } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', flex: '1' }}>
      <div
        className="ai-glass-border"
        style={{
          ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08),
          height: '100%',
        }}
      >
        <button
          className="flex items-center justify-center transition-all"
          style={{
            ...aiGlassLightContentStyle('1.5rem', 0.6),
            width: '100%',
            height: '100%',
            cursor: 'pointer',
            border: 'none',
            transition: 'background 0.2s ease, filter 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.94)'}
          onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
          onClick={() => setIsOpen(!isOpen)}
        >
          <UserIcon className="w-5 h-5" style={{ color: '#6b7280' }} />
        </button>
      </div>

      {isOpen && (
        <div
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1rem'),
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: '200px',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1rem', 0.95),
              padding: '8px',
            }}
          >
            {user && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#2C2C2C',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: '#6B6B6B',
                    marginTop: '2px',
                  }}
                >
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 transition-all"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#2C2C2C',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
  isSelected,
}: {
  itemNumber: number;
  isFirst: boolean;
  isLast: boolean;
  children: React.ReactNode;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [rowHeight, setRowHeight] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rowRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setRowHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(rowRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={rowRef}
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
      <div className="flex flex-col items-center" style={{ width: 24, position: 'relative', height: rowHeight || 'auto' }}>
        {/* Top line for first item */}
        {isFirst && rowHeight > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: `${rowHeight / 2 - 12}px`,
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(0,0,0,0.1) 40%, transparent 95%, transparent 100%)',
              transition: 'height 0.3s ease',
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
        {!isLast && rowHeight > 0 && (
          <div
            style={{
              position: 'absolute',
              top: `${rowHeight / 2 + 12}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: `${rowHeight / 2 + 12}px`,
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, transparent 95%, transparent 100%)',
              transition: 'height 0.3s ease, top 0.3s ease',
            }}
          />
        )}
        {/* Bottom line for last item */}
        {isLast && rowHeight > 0 && (
          <div
            style={{
              position: 'absolute',
              top: `${rowHeight / 2 + 12}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 1,
              height: `${rowHeight / 2 - 12}px`,
              background: 'linear-gradient(to bottom, transparent 0%, transparent 5%, rgba(0,0,0,0.1) 60%, transparent 95%, transparent 100%)',
              transition: 'height 0.3s ease, top 0.3s ease',
            }}
          />
        )}
      </div>
      <div
        className="ai-glass-border flex-1 transition-all duration-200"
        style={{
          ...aiGlassLightBorderStyle('1rem', '0, 0, 0', (isSelected || isHovered) ? 0 : 0.08),
          overflow: 'hidden',
          filter: (isSelected || isHovered) ? 'brightness(0.94)' : undefined,
          transform: (isSelected || isHovered) ? 'scale(1.02)' : undefined,
        }}
      >
        <div
          className="flex items-center justify-between transition-all duration-200"
          style={{
            ...aiGlassLightContentStyle('1rem', (isSelected || isHovered) ? 1 : 0.6),
            position: 'relative',
            zIndex: 0,
            padding: '12px 16px',
            ...((isSelected || isHovered) && {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }),
          }}
        >
          {/* Left side: Name + Edit button */}
          <div className="flex items-center gap-3">
            <div className="flex-1">{children}</div>
            {isHovered && (
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
            )}
          </div>
          {/* Right side: Delete button */}
          {isHovered && (
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
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to format relative time from ISO date string
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Helper to get display text for activity actions
function getActivityDisplayType(action: string): string {
  switch (action) {
    case 'shifts_add': return 'added shifts for';
    case 'shifts_edit': return 'edited shifts for';
    case 'shifts_save': return 'saved shifts for';  // backward compat
    case 'constraints_save': return 'updated constraints for';
    case 'solver_run': return 'ran solver for';
    case 'logbook_generate': return 'generated logbook for';
    case 'logbook_regenerate': return 'regenerated logbook for';
    case 'logbook_publish': return 'published logbook for';
    case 'logbook_publish_with_edits': return 'published logbook for';
    case 'assignment_edit': return 'edited assignments for';
    case 'comment': return 'commented';
    case 'crew_create': return 'created crew member';
    case 'crew_update': return 'updated crew member';
    case 'crew_delete': return 'deleted crew member';
    case 'login': return 'logged in';
    case 'logout': return 'logged out';
    default: return action.replace(/_/g, ' ');
  }
}

// Helper to format activity log date as "Monday, Jan 20, 2026"
function formatActivityDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDayYear = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dayName}, ${monthDayYear}`;
}

// Type for items that can be edited/deleted/viewed
type EditableItem = {
  id: string;
  name: string;
  type: 'crew' | 'roles' | 'roleFamilies' | 'logbooks' | 'preferences' | 'runs';
};

type SelectedItem = EditableItem & {
  mode: 'view' | 'edit' | 'add' | 'pdf' | 'history' | 'runInfo';
  // For runInfo mode, store the logbook we came from so we can go back
  fromLogbookId?: string;
  fromLogbookName?: string;
};

const ITEMS_PER_PAGE = 10;

export default function Home() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const { getNavLinks, user, logout: logoutStore } = useAuthStore();
  const [activeTopNav, setActiveTopNav] = useState<'home' | 'dashboard' | 'settings' | 'user'>('home');
  const [activeView, setActiveView] = useState<ViewId>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [rolesSearchQuery, setRolesSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [previousView, setPreviousView] = useState<SelectedItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EditableItem | null>(null);
  const [crewPage, setCrewPage] = useState(1);
  const [rolesPage, setRolesPage] = useState(1);
  const [preferencesPage, setPreferencesPage] = useState(1);
  const [runsPage, setRunsPage] = useState(1);
  const [logbooksPage, setLogbooksPage] = useState(1);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('recent');
  const [activityUserFilter, setActivityUserFilter] = useState<'everyone' | 'mine'>('everyone');
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_ITEMS_PER_PAGE = 10;
  const [commentText, setCommentText] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [deleteConfirmLogId, setDeleteConfirmLogId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

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
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

  // Check if we're in PDF view mode (for panel width adjustment)
  const isPdfView = selectedItem?.mode === 'pdf' && selectedItem?.type === 'logbooks';

  // API data states
  const [apiStore, setApiStore] = useState<any>(null);
  const [apiCrew, setApiCrew] = useState<any[]>([]);
  const [apiRoles, setApiRoles] = useState<any[]>([]);
  const [apiRoleFamilies, setApiRoleFamilies] = useState<any[]>([]);
  const [apiPreferences, setApiPreferences] = useState<any[]>([]);
  const [apiRuns, setApiRuns] = useState<any[]>([]);
  const [apiLogbooks, setApiLogbooks] = useState<any[]>([]);

  // Fetch data from API
  useEffect(() => {
    async function fetchData() {
      try {
        const [storeRes, crewRes, rolesRes, roleFamiliesRes, preferencesRes, runsRes, logbooksRes] = await Promise.all([
          fetch(`${API_URL}/stores/${storeId}`).then(r => r.ok ? r.json() : null),
          fetch(`${API_URL}/crew?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/role-families`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/role-rules?constraintType=SOFT&storeId=${storeId}`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/runs?storeId=${storeId}`).then(r => r.ok ? r.json() : { runs: [] }),
          fetch(`${API_URL}/logbooks?storeId=${storeId}`).then(r => r.ok ? r.json() : { logbooks: [] }),
        ]);
        setApiStore(storeRes);
        setApiCrew(Array.isArray(crewRes) ? crewRes : []);
        setApiRoles(Array.isArray(rolesRes) ? rolesRes : []);
        setApiRoleFamilies(Array.isArray(roleFamiliesRes) ? roleFamiliesRes : []);
        setApiPreferences(Array.isArray(preferencesRes) ? preferencesRes : []);
        // Runs API returns { runs: [...], total, limit, offset }
        const runs = runsRes?.runs || [];
        setApiRuns(Array.isArray(runs) ? runs : []);
        // Logbooks API returns { logbooks: [...], total, limit, offset }
        const logbooks = logbooksRes?.logbooks || [];
        setApiLogbooks(Array.isArray(logbooks) ? logbooks : []);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    }
    fetchData();
  }, [storeId]);

  // Fetch activity logs when filter changes
  useEffect(() => {
    async function loadActivity() {
      setActivityLoading(true);
      try {
        const { logs } = await fetchActivityLogs(Number(storeId), activityFilter);
        setActivityLogs(logs);
      } catch (err) {
        console.error('Failed to load activity:', err);
        setActivityLogs([]);
      } finally {
        setActivityLoading(false);
      }
    }
    loadActivity();
  }, [storeId, activityFilter]);

  // Handle comment submit
  const handleCommentSubmit = async () => {
    if (!commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const newLog = await postComment(Number(storeId), commentText.trim());
      setActivityLogs(prev => [...prev, newLog]); // Add to bottom (oldest-to-newest order)
      setCommentText('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Handle comment delete
  const handleDeleteComment = async (logId: string) => {
    try {
      const updatedLog = await deleteComment(Number(storeId), logId);
      setActivityLogs(prev => prev.map(log => log.id === logId ? updatedLog : log));
      setDeleteConfirmLogId(null);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  // Filter activity logs by user and reverse to show newest first
  const filteredActivityLogs = (activityUserFilter === 'mine' && user
    ? activityLogs.filter(log => log.User.id === user.id)
    : activityLogs
  ).slice().reverse();

  // Pagination for activity logs
  const totalActivityPages = Math.ceil(filteredActivityLogs.length / ACTIVITY_ITEMS_PER_PAGE);
  const paginatedActivityLogs = filteredActivityLogs.slice(
    (activityPage - 1) * ACTIVITY_ITEMS_PER_PAGE,
    activityPage * ACTIVITY_ITEMS_PER_PAGE
  );

  // Reset to page 1 when filter changes
  useEffect(() => {
    setActivityPage(1);
  }, [activityFilter, activityUserFilter]);

  // Use API data if available, otherwise fall back to placeholder
  const effectiveCrew = apiCrew.length > 0 ? apiCrew.map((c: any) => ({ id: c.id, name: c.name })) : crewData;
  const effectiveRoles = (apiRoles.length > 0
    ? apiRoles.map((r: any) => ({ id: String(r.id), name: r.displayName, familyId: r.familyId }))
    : rolesData.map(r => ({ ...r, familyId: null }))
  ).sort((a, b) => a.name.localeCompare(b.name)); // Sort A-Z ascending

  const effectiveRoleFamilies = apiRoleFamilies
    .map((f: any) => ({ id: String(f.id), name: f.displayName || f.name }))
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort A-Z ascending

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
        date: parseLocalDate(l.date),
        status: l.status,
        hasSuperseded: l.hasSupersededVersions || false
      }))
    : logbooksData.map(l => ({ ...l, status: 'PUBLISHED', hasSuperseded: false }));

  const ACTIVITY_FILTER_OPTIONS: { id: ActivityFilter; label: string }[] = [
    { id: 'recent', label: 'Recent' },
    { id: 'today', label: 'Today' },
    { id: 'last2days', label: 'Last 2 days' },
    { id: 'oneweek', label: 'One week' },
    { id: 'onemonth', label: 'One month' },
  ];

  const ACTIVITY_USER_FILTER_OPTIONS: { id: 'everyone' | 'mine'; label: string }[] = [
    { id: 'everyone', label: 'Everyone' },
    { id: 'mine', label: 'Mine' },
  ];

  // Filter data based on search query
  const filteredCrew = effectiveCrew.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRoles = effectiveRoles.filter(r =>
    r.name.toLowerCase().includes(rolesSearchQuery.toLowerCase())
  );
  const filteredRoleFamilies = effectiveRoleFamilies.filter(f =>
    f.name.toLowerCase().includes(rolesSearchQuery.toLowerCase())
  );
  const filteredRuns = apiRuns.filter((r: any) =>
    r.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.engine.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.Store?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredLogbooks = effectiveLogbooks.filter(l =>
    formatLogbookDate(l.date).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to refresh data after mutations
  const refreshData = async () => {
    try {
      const [storeRes, crewRes, rolesRes, roleFamiliesRes, preferencesRes, logbooksRes] = await Promise.all([
        fetch(`${API_URL}/stores/${storeId}`).then(r => r.ok ? r.json() : null),
        fetch(`${API_URL}/crew?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/role-families`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/role-rules?constraintType=SOFT&storeId=${storeId}`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/logbooks?storeId=${storeId}`).then(r => r.ok ? r.json() : { logbooks: [] }),
      ]);
      setApiStore(storeRes);
      setApiCrew(Array.isArray(crewRes) ? crewRes : []);
      setApiRoles(Array.isArray(rolesRes) ? rolesRes : []);
      setApiRoleFamilies(Array.isArray(roleFamiliesRes) ? roleFamiliesRes : []);
      setApiPreferences(Array.isArray(preferencesRes) ? preferencesRes : []);
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
                       item.type === 'roleFamilies' ? `/role-families/${item.id}` :
                       item.type === 'preferences' ? `/role-rules/${item.id}` :
                       `/logbooks/${item.id}`;
      const res = await fetch(`${API_URL}${endpoint}`, { method: 'DELETE' });
      if (res.ok) {
        refreshData();
        setDeleteConfirmItem(null);

        // Close the right panel if the deleted item is currently being viewed
        if (selectedItem && selectedItem.id === item.id && selectedItem.type === item.type) {
          setSelectedItem(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // Render list view content
  const renderListView = (type: 'crew' | 'logbooks') => {
    const data = type === 'crew' ? filteredCrew : filteredLogbooks;
    const currentPage = type === 'crew' ? crewPage : logbooksPage;
    const setPage = type === 'crew' ? setCrewPage : setLogbooksPage;

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

    // Get title for each type
    const titleMap = {
      crew: 'Crew',
      logbooks: 'Logbooks',
    };
    const title = titleMap[type];

    // Get subtitle for each item type
    const getSubtitle = (item: any): string => {
      if (type === 'crew') return 'Crew member';
      if (type === 'logbooks') return formatLogbookDate(item.date);
      return '';
    };

    // Get item name
    const getItemName = (item: any): string => {
      if (type === 'logbooks') return formatLogbookDate(item.date);
      return item.name;
    };

    // Check if there's data to show search
    const hasData = type === 'crew' ? effectiveCrew.length > 0 : effectiveLogbooks.length > 0;

    // Add button click handler
    const handleAddClick = () => {
      if (type === 'logbooks') {
        router.push(`/stores/${storeId}/logbook/create/shifts`);
      } else {
        setSelectedItem({
          id: '',
          name: 'New Crew Member',
          type: type,
          mode: 'add',
        });
      }
    };

    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
        <div className="flex flex-col" style={{ minHeight: '400px' }}>
          {/* Embedded search header with title and add button */}
          {hasData && renderEmbeddedSearchHeader(searchQuery, setSearchQuery, setPage, title, handleAddClick)}

          {/* Paginated list */}
          <div className="flex flex-col gap-3 flex-1" style={{ marginTop: hasData ? '16px' : 0 }}>
            {paginatedData.length > 0 ? (
              paginatedData.map((item) => {
                const itemName = getItemName(item);
                const subtitle = getSubtitle(item);
                const isSelected = selectedItem?.id === item.id && selectedItem?.type === type;
                return (
                  <GlassPillButton
                    key={`${type}-${item.id}`}
                    isSelected={isSelected}
                    onClick={() => {
                      if (type === 'logbooks') {
                        setSelectedItem({ id: item.id, name: itemName, type, mode: 'history' });
                      } else {
                        setSelectedItem({ id: item.id, name: itemName, type, mode: 'view' });
                      }
                    }}
                    padding="12px 16px"
                    contentStyle={{ justifyContent: 'flex-start' }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#2C2C2C',
                        }}
                      >
                        {itemName}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '12px',
                          color: '#6B6B6B',
                        }}
                      >
                        {subtitle}
                      </span>
                    </div>
                  </GlassPillButton>
                );
              })
            ) : (
              <div
                className="flex items-center justify-center flex-1"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#6B6B6B',
                }}
              >
                No {title.toLowerCase()} found
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

  // Role rule card component (role family style)
  const RoleRuleCard = ({
    rule,
    itemType,
    isSelected,
    onView,
    onEdit,
    onDelete,
  }: {
    rule: any;
    itemType: string;
    isSelected: boolean;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
  }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <CardSmall
        lightMode={true}
        borderOpacity={0}
        style={{
          ...(isSelected && {
            filter: 'brightness(0.95)',
            transform: 'scale(1.02)',
          }),
          borderRadius: '1rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        }}
        contentStyle={{
          background: 'rgb(255, 255, 255)',
          backdropFilter: 'none',
          padding: '12px',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'visible',
        }}
        onClick={onView}
      >
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ position: 'relative' }}
        >
          <div className="flex items-center justify-center h-full">
            {rule.TargetRole ? (
              // Two roles: "role vs. (target_role)" - only target in bubble
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                    lineHeight: 1.2,
                    textAlign: 'center',
                  }}
                >
                  {rule.Role?.displayName || 'Unknown'}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    fontWeight: 400,
                    color: '#6B6B6B',
                  }}
                >
                  vs.
                </span>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      background: 'rgba(245, 245, 245, 0.7)',
                      padding: '4px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {rule.TargetRole?.displayName || 'Unknown'}
                  </div>
                </div>
              </div>
            ) : (
              // Single role - just plain text
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#2C2C2C',
                  lineHeight: 1.2,
                  textAlign: 'center',
                }}
              >
                {rule.Role?.displayName || 'Unknown'}
              </span>
            )}
          </div>

          {/* Hover actions - spread left and right, vertically centered */}
          {isHovered && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                style={{
                  position: 'absolute',
                  left: '0',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                }}
              >
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                style={{
                  position: 'absolute',
                  right: '0',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'hsla(0, 84%, 60%, 0.85)',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </CardSmall>
    );
  };

  // Sentence bubble item component with hover actions
  const SentenceBubbleItem = ({
    parts,
    paddingLeft,
    paddingRight,
    isSelected,
    onView,
    onEdit,
    onDelete,
  }: {
    parts: any;
    paddingLeft: string;
    paddingRight: string;
    isSelected: boolean;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
  }) => {
    const [isHovered, setIsHovered] = useState(false);

    if (!parts) return null;

    return (
      <div
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          style={{
            display: 'inline-block',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: 'rgb(255, 255, 255)',
            filter: (isSelected || isHovered) ? 'brightness(0.95)' : undefined,
            transform: (isSelected || isHovered) ? 'scale(1.02)' : undefined,
            borderRadius: '9999px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          }}
          onClick={onView}
        >
          <div style={{ ...aiGlassLightContentStyle('9999px', 0.5), padding: `10px ${paddingRight} 10px ${paddingLeft}` }}>
            <div
              className="flex flex-wrap items-center gap-2"
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '13px',
                color: '#2C2C2C',
              }}
            >
              {parts.map((part: any, idx: number) => {
                if (part.type === 'bubble') {
                  return (
                    <div key={idx} className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                      <div
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.5),
                          background: 'rgba(245, 245, 245, 0.7)',
                          padding: '4px 12px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#2C2C2C',
                        }}
                      >
                        {part.content}
                      </div>
                    </div>
                  );
                }
                return <span key={idx}>{part.content}</span>;
              })}
            </div>
          </div>
        </div>

        {/* Hover actions */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              right: '-8px',
              top: '50%',
              transform: 'translateY(-50%) translateX(100%)',
              display: 'flex',
              gap: '4px',
              zIndex: 10,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '11px',
                fontWeight: 500,
                color: '#FFFFFF',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                backgroundColor: 'hsla(0, 84%, 60%, 0.85)',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '11px',
                fontWeight: 500,
                color: '#FFFFFF',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // Helper to group rules by type
  const groupRulesByType = (rules: any[], isStoreRules: boolean = false): Map<string, any[]> => {
    const grouped = new Map<string, any[]>();
    for (const rule of rules) {
      // For store rules, the type is in rule.RoleRule.type (nested)
      // For preferences, the type is in rule.type (flat)
      const ruleType = isStoreRules ? rule.RoleRule?.type : rule.type;
      if (!ruleType) continue;
      const existing = grouped.get(ruleType) || [];
      grouped.set(ruleType, [...existing, rule]);
    }
    return grouped;
  };

  // Render grouped rules list view for preferences
  const renderGroupedRulesView = () => {
    const rules = apiPreferences;
    const itemType = 'preferences';
    const titleText = 'Preferences';

    // Extract unique RoleRules from CrewRoleRules
    const roleRulesMap = new Map<number, any>();
    rules.forEach(r => {
      if (r && r.constraintType === 'SOFT') {
        roleRulesMap.set(r.id, r);
      }
    });
    const uniqueRoleRules = Array.from(roleRulesMap.values());

    // Filter by search query
    const filteredRoleRules = uniqueRoleRules.filter(rule => {
      const ruleType = rule.type;
      const displayName = rule.displayName;
      const roleName = rule.Role?.displayName;
      const targetRoleName = rule.TargetRole?.displayName;

      return (
        (displayName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (roleName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (targetRoleName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ruleType?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ROLE_RULE_TYPE_LABELS[ruleType]?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    });

    // Group by type
    const groupedByType = new Map<string, any[]>();
    filteredRoleRules.forEach(rule => {
      const type = rule.type;
      if (!groupedByType.has(type)) {
        groupedByType.set(type, []);
      }
      groupedByType.get(type)!.push(rule);
    });

    // Check if there's data to show search
    const hasSearchData = apiPreferences.length > 0;

    // Add button click handler
    const handleAddClick = () => setSelectedItem({
      id: '',
      name: 'New Preference',
      type: itemType,
      mode: 'add',
    });

    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
        <div className="flex flex-col" style={{ minHeight: '400px' }}>
          {/* Embedded search header with title and add button */}
          {hasSearchData && renderEmbeddedSearchHeader(searchQuery, setSearchQuery, setPreferencesPage, titleText, handleAddClick)}

        {/* Grouped list - card per type */}
        <div className="flex flex-col gap-4" style={{ marginTop: hasSearchData ? '16px' : 0 }}>
          {Array.from(groupedByType.entries()).map(([ruleType, roleRules]) => (
            <CardContainer key={ruleType} lightMode={true} borderRadius="1rem" padding="1rem">
              <div className="flex flex-col gap-3">
                {/* Group header */}
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {ruleType}
                  </div>
                </div>

                {/* Items in group - GlassPillButton grid like role families */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(roleRules.length, 4)}, 1fr)`, gap: '8px' }}>
                  {roleRules.map((rule) => {
                    const typeDisplayName = ROLE_RULE_TYPE_LABELS[rule.type] || rule.type;
                    const isSelected = selectedItem?.id === String(rule.id) && selectedItem?.type === itemType;

                    return (
                      <GlassPillButton
                        key={rule.id}
                        isSelected={isSelected}
                        onClick={() => setSelectedItem({
                          id: String(rule.id),
                          name: typeDisplayName,
                          type: itemType,
                          mode: 'view'
                        })}
                        padding="12px"
                        contentStyle={{ justifyContent: 'center' }}
                      >
                        <div className="flex items-center justify-center h-full">
                          {rule.TargetRole ? (
                            // Two roles: "role vs. (target_role)" - only target in bubble
                            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                              <span
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  color: '#2C2C2C',
                                  lineHeight: 1.2,
                                  textAlign: 'center',
                                }}
                              >
                                {rule.Role?.displayName || 'Unknown'}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '12px',
                                  fontWeight: 400,
                                  color: '#6B6B6B',
                                }}
                              >
                                vs.
                              </span>
                              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                <div
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.5),
                                    background: 'rgba(245, 245, 245, 0.7)',
                                    padding: '4px 12px',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    color: '#2C2C2C',
                                  }}
                                >
                                  {rule.TargetRole?.displayName || 'Unknown'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Single role - just plain text
                            <span
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#2C2C2C',
                                lineHeight: 1.2,
                                textAlign: 'center',
                              }}
                            >
                              {rule.Role?.displayName || rule.displayName || 'Unknown'}
                            </span>
                          )}
                        </div>
                      </GlassPillButton>
                    );
                  })}
                </div>
              </div>
            </CardContainer>
          ))}

          {groupedByType.size === 0 && (
            <div className="flex items-center justify-center flex-1" style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', padding: '2rem 0' }}>
              No preferences found
            </div>
          )}
        </div>
        </div>
      </CardContainer>
    );
  };

  // Embedded search header for list views - bento style with rounded top corners
  // Title and search bar on left, add button on right
  const renderEmbeddedSearchHeader = (
    searchValue: string,
    onSearchChange: (value: string) => void,
    setPage: (page: number) => void,
    title: string,
    onAddClick: () => void
  ) => {
    return (
      <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
        <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
          {/* Single row: Title + Search on left, Add button on right */}
          <div className="flex items-center justify-between" style={{ width: '100%', gap: '16px' }}>
            {/* Left side: Title pill + Search bar */}
            <div className="flex items-center" style={{ gap: '12px', flex: 1 }}>
              {/* Title pill */}
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
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
                  {title}
                </div>
              </div>
              {/* Search bar - next to title, using glass UI style */}
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: '50%', minWidth: '200px', maxWidth: '400px' }}>
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
                    placeholder="Search"
                    value={searchValue}
                    onChange={(e) => {
                      onSearchChange(e.target.value);
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
                </div>
              </div>
            </div>
            {/* Right side: Add button */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
              <button
                onClick={onAddClick}
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.4),
                  padding: '6px 14px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#6B6B6B',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ color: 'hsl(0, 84%, 60%)', fontSize: '16px', lineHeight: 1 }}>+</span>
                Add
              </button>
            </div>
          </div>
        </GlassPillCard>
      </div>
    );
  };

  // Role Families card (rendered separately above header)
  const renderRoleFamiliesCard = () => {
    // Don't show if no families match the search
    if (filteredRoleFamilies.length === 0) return null;

    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
        <div className="flex flex-col gap-3">
          {/* Section title and Add button */}
          <div className="flex items-center justify-between">
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
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
                Role Families
              </div>
            </div>
            {/* Add button */}
            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
              <button
                onClick={() => setSelectedItem({ id: 'new', name: 'New Role Family', type: 'roleFamilies', mode: 'add' })}
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.4),
                  padding: '6px 14px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#6B6B6B',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ color: 'hsl(0, 84%, 60%)', fontSize: '16px', lineHeight: 1 }}>+</span>
                Add
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(filteredRoleFamilies.length, 4)}, 1fr)` }}>
            {filteredRoleFamilies.map((family) => {
              const isSelected = selectedItem?.id === family.id && selectedItem?.type === 'roleFamilies';
              return (
                <GlassPillButton
                  key={`family-${family.id}`}
                  isSelected={isSelected}
                  onClick={() => setSelectedItem({ id: family.id, name: family.name, type: 'roleFamilies', mode: 'view' })}
                  style={{ width: '100%' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                      lineHeight: 1.2,
                      textAlign: 'center',
                    }}
                  >
                    {family.name}
                  </span>
                </GlassPillButton>
              );
            })}
          </div>
        </div>
      </CardContainer>
    );
  };

  // Custom roles list view (modeled on Role Families card)
  const renderRolesListView = () => {
    const hasRoles = filteredRoles.length > 0;

    // Pagination
    const totalPages = Math.ceil(filteredRoles.length / ITEMS_PER_PAGE);
    const startIndex = (rolesPage - 1) * ITEMS_PER_PAGE;
    const paginatedRoles = filteredRoles.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // Reset to page 1 if current page is out of bounds
    if (rolesPage > totalPages && totalPages > 0) {
      setRolesPage(1);
    }

    // Generate page numbers with ellipsis
    const getPageNumbers = (): (number | string)[] => {
      const pages: (number | string)[] = [];
      if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        if (rolesPage > 3) pages.push('...');
        for (let i = Math.max(2, rolesPage - 1); i <= Math.min(totalPages - 1, rolesPage + 1); i++) {
          if (!pages.includes(i)) pages.push(i);
        }
        if (rolesPage < totalPages - 2) pages.push('...');
        if (!pages.includes(totalPages)) pages.push(totalPages);
      }
      return pages;
    };

    // Get family name for a role
    const getFamilyName = (familyId: string | null): string => {
      if (!familyId) return 'Store role';
      const family = effectiveRoleFamilies.find(f => f.id === familyId);
      return family ? family.name : 'Store role';
    };

    // Check if there's data to show search
    const hasSearchData = effectiveRoleFamilies.length > 0 || effectiveRoles.length > 0;

    // Add button click handler
    const handleAddClick = () => setSelectedItem({ id: '', name: 'New Role', type: 'roles', mode: 'add' });

    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
        <div className="flex flex-col" style={{ minHeight: '400px' }}>
          {/* Embedded search header with title and add button */}
          {hasSearchData && renderEmbeddedSearchHeader(rolesSearchQuery, setRolesSearchQuery, setRolesPage, 'Roles', handleAddClick)}

          {/* Paginated list */}
          <div className="flex flex-col gap-3 flex-1" style={{ marginTop: hasSearchData ? '16px' : 0 }}>
            {hasRoles ? (
              paginatedRoles.map((role) => {
                const isSelected = selectedItem?.id === role.id && selectedItem?.type === 'roles';
                return (
                  <GlassPillButton
                    key={`role-${role.id}`}
                    isSelected={isSelected}
                    onClick={() => setSelectedItem({ id: role.id, name: role.name, type: 'roles', mode: 'view' })}
                    padding="12px 16px"
                    contentStyle={{ justifyContent: 'flex-start' }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#2C2C2C',
                        }}
                      >
                        {role.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '12px',
                          color: '#6B6B6B',
                        }}
                      >
                        {getFamilyName(role.familyId)}
                      </span>
                    </div>
                  </GlassPillButton>
                );
              })
            ) : (
              <div
                className="flex items-center justify-center flex-1"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  color: '#6B6B6B',
                }}
              >
                No roles found
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
                    onClick={() => setRolesPage(page as number)}
                    className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                    style={{
                      background: rolesPage === page ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      cursor: 'pointer',
                      opacity: rolesPage === page ? 1 : 0.6,
                    }}
                    onMouseEnter={(e) => {
                      if (rolesPage !== page) {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)';
                        e.currentTarget.style.opacity = '0.8';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (rolesPage !== page) {
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
                        fontWeight: rolesPage === page ? 500 : 350,
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
      navLinks={[]}
      leftPanelPadding="p-6"
      leftPanel={
        <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
          <div className="flex flex-col gap-6">
            {/* Top nav - bento style header */}
            <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
              <div
                className="ai-glass-border"
                style={{
                  ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08),
                }}
              >
                <div
                  style={{
                    ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                    padding: '24px',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '23px',
                    alignItems: 'stretch',
                  }}
                >
                  {/* Inner nav pill */}
                  <div
                    className="ai-glass-border"
                    style={{
                      ...aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08),
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        padding: '2px 16px',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <nav className="flex items-center justify-evenly" style={{ width: '100%' }}>
                        <NavStatsCard
                          icon={<HomeIcon />}
                          label="Home"
                          hideSubtext
                          compact
                          isActive={activeTopNav === 'home'}
                          onClick={() => {
                            setActiveTopNav('home');
                            router.push(`/stores/${storeId}/home`);
                          }}
                          isFirst
                        />
                        <NavDivider compact />
                        <NavStatsCard
                          icon={<ChartBarIcon />}
                          label="Fairness Dashboard"
                          hideSubtext
                          compact
                          isActive={activeTopNav === 'dashboard'}
                          onClick={() => {
                            setActiveTopNav('dashboard');
                            router.push(`/stores/${storeId}/fairness-dashboard`);
                          }}
                        />
                        <NavDivider compact />
                        <NavStatsCard
                          icon={<Cog6ToothIcon />}
                          label="Settings"
                          hideSubtext
                          compact
                          isActive={activeTopNav === 'settings'}
                          onClick={() => {
                            setActiveTopNav('settings');
                            router.push(`/stores/${storeId}/settings`);
                          }}
                          isLast
                        />
                      </nav>
                    </div>
                  </div>
                  {/* User button */}
                  <div ref={userMenuRef} style={{ height: '100%', aspectRatio: '1' }}>
                    <div
                      className="ai-glass-border"
                      style={{
                        ...aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08),
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <button
                        className="flex items-center justify-center"
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.6),
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'filter 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.94)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      >
                        <UserIcon className="w-5 h-5" style={{ color: '#6B6B6B' }} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary nav - Activity/Crew/Logbooks */}
            <div className="sticky top-7 z-50">
            <div
              className="ai-glass-border"
              style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
            >
              <div
                style={{
                  ...aiGlassLightContentStyle('1.5rem', 0.6),
                  padding: '24px 48px',
                  overflowX: 'auto',
                }}
              >
                <nav className="flex items-center" style={{ minWidth: 'max-content' }}>
                  <NavStatsCard
                    icon={<BellIcon />}
                    label="Activity"
                    subtext="View all"
                    isActive={activeView === 'home'}
                    onClick={() => setActiveView('home')}
                    isFirst
                  />
                  <NavDivider />
                  <NavStatsCard
                    icon={<UserGroupIcon />}
                    label="Crew"
                    count={effectiveCrew.length}
                    isActive={activeView === 'crew'}
                    onClick={() => setActiveView('crew')}
                  />
                  <NavDivider />
                  <NavStatsCard
                    icon={<DocumentTextIcon />}
                    label="Logbooks"
                    count={effectiveLogbooks.length}
                    isActive={activeView === 'logbooks'}
                    onClick={() => setActiveView('logbooks')}
                  />
                  <NavDivider />
                  <NavStatsCard
                    icon={<ShieldCheckIcon />}
                    label="Roles"
                    count={effectiveRoles.length}
                    isActive={activeView === 'roles'}
                    onClick={() => setActiveView('roles')}
                  />
                  <NavDivider />
                  <NavStatsCard
                    icon={<AdjustmentsHorizontalIcon />}
                    label="Preferences"
                    count={apiPreferences.length}
                    isActive={activeView === 'preferences'}
                    onClick={() => setActiveView('preferences')}
                    isLast
                  />
                </nav>
              </div>
            </div>
            </div>

          {/* Role Families card - shown below header when in roles view */}
          {activeView === 'roles' && renderRoleFamiliesCard()}

          {/* Content based on active view */}
          {activeView === 'home' ? (
            <>
          {/* Activity Log */}
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
            <div className="flex flex-col gap-6">
              {/* Activity Log header card - bento style: top corners match outer CardContainer */}
              <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
              <GlassPillCard padding="1.5rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
              <div className="flex items-center justify-between" style={{ width: '100%' }}>
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

                {/* Filter dropdowns and pagination */}
                <div className="flex items-center gap-6">
                  {/* Pagination - horizontal, matching dropdown style */}
                  {totalActivityPages > 1 && (
                    <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                      <div
                        className="flex items-center gap-1"
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.6),
                          padding: '6px 14px',
                        }}
                      >
                        <button
                          onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                          disabled={activityPage === 1}
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '12px',
                            color: activityPage === 1 ? '#9A999E' : '#6B6B6B',
                            background: 'none',
                            border: 'none',
                            cursor: activityPage === 1 ? 'default' : 'pointer',
                            padding: '0 4px',
                          }}
                        >
                          ◀
                        </button>
                        {Array.from({ length: totalActivityPages }, (_, i) => i + 1).map(page => (
                          <button
                            key={page}
                            onClick={() => setActivityPage(page)}
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              fontWeight: activityPage === page ? 600 : 400,
                              color: activityPage === page ? '#2C2C2C' : '#9A999E',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0 4px',
                            }}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          onClick={() => setActivityPage(p => Math.min(totalActivityPages, p + 1))}
                          disabled={activityPage === totalActivityPages}
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '12px',
                            color: activityPage === totalActivityPages ? '#9A999E' : '#6B6B6B',
                            background: 'none',
                            border: 'none',
                            cursor: activityPage === totalActivityPages ? 'default' : 'pointer',
                            padding: '0 4px',
                          }}
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  )}

                  {/* User filter dropdown */}
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
                        {ACTIVITY_USER_FILTER_OPTIONS.find(o => o.id === activityUserFilter)?.label}
                        <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </MenuButton>
                    </div>
                    <MenuItems
                      anchor="bottom end"
                      portal={false}
                      transition
                      className="w-32 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
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
                        {ACTIVITY_USER_FILTER_OPTIONS.map((option) => (
                          <MenuItem key={option.id}>
                            <div className="flex items-center justify-between px-4 py-2">
                              <button
                                onClick={() => setActivityUserFilter(option.id)}
                                className="text-left text-sm focus:outline-none flex-1"
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  color: activityUserFilter === option.id ? '#2C2C2C' : '#6B6B6B',
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
              </div>
              </GlassPillCard>
              </div>
              {activityLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B', fontSize: '13px' }}>Loading activity...</span>
                </div>
              ) : filteredActivityLogs.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <span style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontSize: '13px' }}>No activity yet</span>
                </div>
              ) : (
              <GlassPillCard padding="1.5rem" borderRadius="1rem" contentStyle={{ width: '100%' }}>
                <div className="flex flex-col gap-6 w-full">
                  {paginatedActivityLogs
                    .filter((log) => !(log.action === 'comment' && log.metadata?.deleted === true))
                    .map((log) => {
                      const isComment = log.action === 'comment';
                      const isPublish = log.action === 'logbook_publish' || log.action === 'logbook_publish_with_edits';
                      const isPublishWithEdits = log.action === 'logbook_publish_with_edits';
                      const displayType = getActivityDisplayType(log.action);
                      const relativeTime = formatRelativeTime(log.createdAt);
                      const comment = log.metadata?.comment;
                      const canDelete = isComment && user && log.User.id === user.id;
                      const isHovered = hoveredCommentId === log.id;
                      const activityDate = formatActivityDate(log.date);
                      const initials = log.User.name.split(' ').map(n => n[0]).join('');

                      return (
                        <div key={log.id} className="flex items-center gap-4">
                          {/* Icon */}
                          {isComment ? (
                            <div
                              className="flex-none rounded-full flex items-center justify-center"
                              style={{
                                width: 24,
                                height: 24,
                                backgroundColor: log.User.role === 'CAPTAIN' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                                fontSize: '10px',
                                fontWeight: 500,
                                color: log.User.role === 'CAPTAIN' ? 'hsl(0, 84%, 50%)' : '#6B6B6B',
                              }}
                            >
                              {initials}
                            </div>
                          ) : (
                            <div className="flex-none flex items-center justify-center" style={{ width: 24, height: 24 }}>
                              {isPublish ? (
                                <CheckCircleIcon className="w-6 h-6" style={{ color: 'hsl(0, 84%, 60%)' }} />
                              ) : (
                                <div
                                  className="rounded-full"
                                  style={{
                                    width: 6,
                                    height: 6,
                                    backgroundColor: 'rgba(0, 0, 0, 0.15)',
                                    border: '1px solid rgba(0, 0, 0, 0.25)',
                                  }}
                                />
                              )}
                            </div>
                          )}

                          {/* Message content */}
                          {isComment ? (
                            <div className="flex-1 flex items-center gap-6">
                              <div
                                className="flex-1 p-3"
                                style={{
                                  backgroundColor: 'rgba(0, 0, 0, 0.03)',
                                  border: '1px solid rgba(0, 0, 0, 0.06)',
                                  borderRadius: '1rem',
                                }}
                                onMouseEnter={() => canDelete && setHoveredCommentId(log.id)}
                                onMouseLeave={() => setHoveredCommentId(null)}
                              >
                                <div className="flex justify-between gap-x-4">
                                  <div style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                                    <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{log.User.name}</span> commented
                                  </div>
                                  {canDelete && isHovered && (
                                    <button
                                      onClick={() => setDeleteConfirmLogId(log.id)}
                                      style={{
                                        fontSize: '12px',
                                        color: 'hsl(0, 84%, 50%)',
                                        fontFamily: 'var(--font-open-sans)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                      }}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                                <p style={{ fontSize: '13px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)', marginTop: '4px' }}>
                                  {comment}
                                </p>
                              </div>
                              <time
                                dateTime={log.createdAt}
                                className="flex-none"
                                style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                              >
                                {relativeTime}
                              </time>
                            </div>
                          ) : (
                            <div className="flex-1 flex justify-between items-center">
                              <p style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                                <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{log.User.name}</span>{' '}
                                {displayType}{activityDate ? ` ${activityDate}` : ''}{isPublishWithEdits ? ' (with edits)' : ''}.
                              </p>
                              <time
                                dateTime={log.createdAt}
                                style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                              >
                                {relativeTime}
                              </time>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </GlassPillCard>
              )}

              {/* Comment input */}
              <GlassPillCard borderRadius="1rem" className="w-full" padding="1.5rem" contentStyle={{ justifyContent: 'stretch', paddingLeft: '0.75rem' }}>
                <div className="flex gap-3 w-full">
                  <div
                    className="flex-none rounded-full flex items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: user?.role === 'CAPTAIN' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                      fontSize: '10px',
                      fontWeight: 500,
                      color: user?.role === 'CAPTAIN' ? 'hsl(0, 84%, 50%)' : '#6B6B6B',
                    }}
                  >
                    {user?.name ? user.name.split(' ').map(n => n[0]).join('') : 'You'}
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
                        disabled={commentSubmitting}
                        className="block w-full resize-none bg-transparent text-sm placeholder:text-gray-400 focus:outline-none focus:ring-0"
                        style={{ fontFamily: 'var(--font-open-sans)', color: '#2C2C2C', outline: 'none', border: 'none', boxShadow: 'none', padding: '0.75rem', paddingBottom: '0.375rem' }}
                      />
                      <div className="flex justify-end" style={{ padding: '0 0.75rem 0.75rem 0.75rem' }}>
                        <GlassPillButton
                          onClick={() => {
                            if (commentText.trim() && !commentSubmitting) {
                              handleCommentSubmit();
                            }
                          }}
                          padding="6px 12px"
                          borderRadius="0.75rem"
                          style={{
                            opacity: commentText.trim() && !commentSubmitting ? 1 : 0.5,
                            cursor: commentText.trim() && !commentSubmitting ? 'pointer' : 'default',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: commentText.trim() && !commentSubmitting ? '#2C2C2C' : '#6B6B6B',
                            }}
                          >
                            {commentSubmitting ? 'Posting...' : 'Comment'}
                          </span>
                        </GlassPillButton>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassPillCard>
            </div>
          </CardContainer>

          {/* Delete comment confirmation dialog */}
          {deleteConfirmLogId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
              onClick={() => setDeleteConfirmLogId(null)}
            >
              <div
                className="p-6"
                style={{
                  backgroundColor: 'white',
                  borderRadius: '1rem',
                  maxWidth: '400px',
                  width: '90%',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ fontFamily: 'var(--font-open-sans)', fontSize: '16px', fontWeight: 600, color: '#2C2C2C', marginBottom: '8px' }}>
                  Delete comment?
                </h3>
                <p style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', marginBottom: '20px' }}>
                  This action cannot be undone. The comment will be marked as deleted.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteConfirmLogId(null)}
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.05)',
                      color: '#6B6B6B',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteComment(deleteConfirmLogId)}
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'hsl(0, 84%, 50%)',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
            </>
          ) : activeView === 'crew' ? (
            renderListView('crew')
          ) : activeView === 'roles' ? (
            renderRolesListView()
          ) : activeView === 'preferences' ? (
            renderGroupedRulesView()
          ) : activeView === 'logbooks' ? (
            renderListView('logbooks')
          ) : null}
          </div>
        </CardContainer>
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
              onViewRunInfo={(runId) => {
                setSelectedItem({
                  id: runId,
                  name: `Run Info`,
                  type: 'runs',
                  mode: 'runInfo',
                  fromLogbookId: selectedItem.id,
                  fromLogbookName: selectedItem.name,
                });
              }}
              onClose={() => {
                setActiveView('logbooks');
                setSelectedItem(null);
              }}
            />
          ) : selectedItem.mode === 'runInfo' && selectedItem.type === 'runs' ? (
            // Run detail view accessed from logbook history
            <RunDetailView
              runId={selectedItem.id}
              onBack={() => {
                if (selectedItem.fromLogbookId) {
                  setSelectedItem({
                    id: selectedItem.fromLogbookId,
                    name: selectedItem.fromLogbookName || '',
                    type: 'logbooks',
                    mode: 'history',
                  });
                } else {
                  setActiveView('logbooks');
                  setSelectedItem(null);
                }
              }}
            />
          ) : (
            <div className="flex flex-col gap-4 h-full">
              {/* Header with name and mode dropdown */}
              <CardHeader
                title={selectedItem.mode === 'add' && !selectedItem.id ? `New ${selectedItem.type === 'crew' ? 'Crew Member' : selectedItem.type === 'roles' ? 'Role' : selectedItem.type === 'roleFamilies' ? 'Role Family' : selectedItem.type === 'preferences' ? 'Preference' : 'Logbook'}` : selectedItem.name}
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                leftContent={
                  // Only show dropdown if not in "new add" mode (add mode with no ID)
                  selectedItem.mode === 'add' && !selectedItem.id ? undefined : (
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
                        {(selectedItem.type === 'logbooks' ? ['history', 'pdf', 'add'] : selectedItem.type === 'roleFamilies' ? (selectedItem.mode === 'add' ? ['add'] : ['view', 'add']) : ['view', 'edit', 'add']).map((mode) => (
                          <MenuItem key={mode}>
                            <div className="flex items-center justify-between px-4 py-2">
                              <button
                                onClick={() => {
                                  if (mode === 'add') {
                                    if (selectedItem.type === 'logbooks') {
                                      // For logbooks, navigate to shifts page
                                      router.push(`/stores/${storeId}/logbook/create/shifts`);
                                    } else {
                                      // When clicking Add, create a new item of the current type
                                      const itemName = selectedItem.type === 'crew' ? 'Crew Member' :
                                                      selectedItem.type === 'roles' ? 'Role' :
                                                      selectedItem.type === 'roleFamilies' ? 'Role Family' :
                                                      selectedItem.type === 'preferences' ? 'Preference' : 'Item';
                                      setSelectedItem({
                                        id: '',
                                        name: `New ${itemName}`,
                                        type: selectedItem.type,
                                        mode: 'add',
                                      });
                                    }
                                  } else {
                                    setSelectedItem({ ...selectedItem, mode: mode as SelectedItem['mode'] });
                                  }
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
                  )
                }
                rightContent={
                  <button
                    onClick={() => {
                      // If there's a previous view (e.g., navigated from role to role rule), go back to it
                      if (previousView) {
                        setSelectedItem(previousView);
                        setPreviousView(null);
                      } else {
                        // Go back to the list view for this item type
                        // Role families go back to roles view
                        setActiveView(selectedItem.type === 'roleFamilies' ? 'roles' : selectedItem.type);
                        setSelectedItem(null);
                      }
                    }}
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
                  onSuccess={(newCrew?: any) => {
                    refreshData();
                    // If adding new item, switch to view mode of the new item
                    if (selectedItem.mode === 'add' && newCrew) {
                      setSelectedItem({
                        id: newCrew.id,
                        name: newCrew.name,
                        type: 'crew',
                        mode: 'view',
                      });
                    } else {
                      // If editing, just refresh and stay in view mode
                      setActiveView('crew');
                      setSelectedItem(null);
                    }
                  }}
                  onCancel={() => {
                    setActiveView('crew');
                    setSelectedItem(null);
                  }}
                />
              ) : selectedItem.type === 'crew' && selectedItem.mode === 'view' ? (
                <CrewDetailView crewId={selectedItem.id} />
              ) : selectedItem.type === 'roles' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
                <RoleForm
                  mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
                  roleId={selectedItem.mode === 'edit' ? Number(selectedItem.id) : undefined}
                  storeId={storeId}
                  onSuccess={(newRole?: any) => {
                    refreshData();
                    // If adding new item, switch to view mode of the new item
                    if (selectedItem.mode === 'add' && newRole) {
                      setSelectedItem({
                        id: String(newRole.id),
                        name: newRole.displayName,
                        type: 'roles',
                        mode: 'view',
                      });
                    } else {
                      setActiveView('roles');
                      setSelectedItem(null);
                    }
                  }}
                  onCancel={() => {
                    setActiveView('roles');
                    setSelectedItem(null);
                  }}
                />
              ) : selectedItem.type === 'roles' && selectedItem.mode === 'view' ? (
                <RoleDetailView
                  roleId={Number(selectedItem.id)}
                  onRoleRuleClick={(roleRuleId, roleRuleName) => {
                    setPreviousView(selectedItem);
                    setSelectedItem({
                      id: String(roleRuleId),
                      name: roleRuleName,
                      type: 'preferences', // Role rules from roles are preferences
                      mode: 'view',
                    });
                  }}
                />
              ) : selectedItem.type === 'roleFamilies' && selectedItem.mode === 'add' ? (
                !apiStore ? (
                  <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
                    <div className="flex items-center justify-center py-8">
                      <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading store data...</span>
                    </div>
                  </CardContainer>
                ) : (
                  <RoleFamilyForm
                    companyId={apiStore.companyId}
                  onSuccess={(newFamily?: any) => {
                    refreshData();
                    // If adding new item, switch to view mode of the new item
                    if (newFamily) {
                      setSelectedItem({
                        id: String(newFamily.id),
                        name: newFamily.displayName || newFamily.name,
                        type: 'roleFamilies',
                        mode: 'view',
                      });
                    } else {
                      setActiveView('roles');
                      setSelectedItem(null);
                    }
                  }}
                  onCancel={() => {
                    setActiveView('roles');
                    setSelectedItem(null);
                  }}
                  />
                )
              ) : selectedItem.type === 'roleFamilies' ? (
                <RoleFamilyDetailView
                  familyId={selectedItem.id}
                  storeId={storeId}
                  onDelete={() => setDeleteConfirmItem({ id: selectedItem.id, name: selectedItem.name, type: 'roleFamilies' })}
                />
              ) : selectedItem.type === 'preferences' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
                <RoleRuleForm
                  mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
                  ruleId={selectedItem.mode === 'edit' ? Number(selectedItem.id) : undefined}
                  storeId={storeId}
                  constraintType="SOFT"
                  onSuccess={(newRule?: any) => {
                    refreshData();
                    // If adding new item, switch to view mode of the new item
                    if (selectedItem.mode === 'add' && newRule) {
                      setSelectedItem({
                        id: String(newRule.id),
                        name: newRule.displayName || `${newRule.Role?.displayName} - ${newRule.type}`,
                        type: 'preferences',
                        mode: 'view',
                      });
                    } else {
                      setActiveView('preferences');
                      setSelectedItem(null);
                    }
                  }}
                  onCancel={() => {
                    setActiveView('preferences');
                    setSelectedItem(null);
                  }}
                />
              ) : selectedItem.type === 'preferences' && selectedItem.mode === 'view' ? (
                <RoleRuleDetailView ruleId={Number(selectedItem.id)} constraintType="SOFT" />
              ) : selectedItem.type === 'companies' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
                <CompanyForm
                  mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
                  companyId={selectedItem.mode === 'edit' ? Number(selectedItem.id) : undefined}
                  onSuccess={(newCompany?: any) => {
                    refreshData();
                    if (selectedItem.mode === 'add' && newCompany) {
                      setSelectedItem({
                        id: String(newCompany.id),
                        name: newCompany.name,
                        type: 'companies',
                        mode: 'view',
                      });
                    } else {
                      setActiveView('companies');
                      setSelectedItem(null);
                    }
                  }}
                  onCancel={() => {
                    setActiveView('companies');
                    setSelectedItem(null);
                  }}
                />
              ) : selectedItem.type === 'companies' && selectedItem.mode === 'view' ? (
                <CompanyDetailView
                  companyId={Number(selectedItem.id)}
                  onDelete={() => setDeleteConfirmItem({ id: selectedItem.id, name: selectedItem.name, type: 'companies' })}
                />
              ) : selectedItem.type === 'stores' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
                <StoreForm
                  mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
                  storeId={selectedItem.mode === 'edit' ? Number(selectedItem.id) : undefined}
                  onSuccess={(newStore?: any) => {
                    refreshData();
                    if (selectedItem.mode === 'add' && newStore) {
                      setSelectedItem({
                        id: String(newStore.id),
                        name: newStore.name,
                        type: 'stores',
                        mode: 'view',
                      });
                    } else {
                      setActiveView('stores');
                      setSelectedItem(null);
                    }
                  }}
                  onCancel={() => {
                    setActiveView('stores');
                    setSelectedItem(null);
                  }}
                />
              ) : selectedItem.type === 'stores' && selectedItem.mode === 'view' ? (
                <StoreDetailView
                  storeId={Number(selectedItem.id)}
                  onDelete={() => setDeleteConfirmItem({ id: selectedItem.id, name: selectedItem.name, type: 'stores' })}
                />
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
              Delete {deleteConfirmItem.type === 'crew' ? 'Crew Member' :
                      deleteConfirmItem.type === 'roles' ? 'Role' :
                      deleteConfirmItem.type === 'preferences' ? 'Preference' :
                      'Logbook'}?
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
                  borderRadius: '9999px',
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
                  borderRadius: '9999px',
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

    {/* User dropdown menu - rendered at root level with fixed positioning */}
    {isUserMenuOpen && userMenuRef.current && (
      <div
        ref={(el) => {
          userDropdownRef.current = el;
          // Position dropdown below the user button
          if (el && userMenuRef.current) {
            const rect = userMenuRef.current.getBoundingClientRect();
            el.style.top = `${rect.bottom + 8}px`;
            el.style.right = `${window.innerWidth - rect.right}px`;
          }
        }}
        className="ai-glass-border"
        style={{
          ...aiGlassLightBorderStyle('1rem'),
          position: 'fixed',
          minWidth: '200px',
          zIndex: 99999,
        }}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('1rem', 0.95),
            padding: '8px',
          }}
        >
          {user && (
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#2C2C2C',
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '12px',
                  color: '#6B6B6B',
                  marginTop: '2px',
                }}
              >
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
              </div>
            </div>
          )}
          {/* Back to stores - only for ADMIN */}
          {user?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => {
                if (apiStore?.companyId) {
                  router.push(`/admin/companies/${apiStore.companyId}`);
                } else {
                  router.push('/admin');
                }
              }}
              className="w-full flex items-center gap-3 transition-all"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                color: '#2C2C2C',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <BuildingStorefrontIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
              Back to stores
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 transition-all"
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              color: '#2C2C2C',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
            Sign out
          </button>
        </div>
      </div>
    )}
  </>
  );
}
