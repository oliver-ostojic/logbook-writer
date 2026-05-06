'use client';

import { useState, useEffect, useRef } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { useParams, useRouter } from 'next/navigation';
import { UserGroupIcon, BellIcon, DocumentTextIcon, ShieldCheckIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/solid';
import { logout } from '@/lib/api/auth';
import { DashboardLayout } from '@/components/layouts';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { NavStatsCard, TopNavHeader, HomeView, CrewView, RolesView, PreferencesView, LogbooksView, HomeRightPanel } from './components';
import { formatLogbookDate } from './utils';
import { useHomeData } from './useHomeData';
import { useAuthStore } from '@/lib/authStore';
import { useTutorialStore } from '@/lib/tutorialStore';
import { createHomeSteps } from '@/app/tutorial/steps/home-steps';
import { ViewId, EditableItem, SelectedItem } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function Home() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const { user, logout: logoutStore } = useAuthStore();

  const [activeView, setActiveView] = useState<ViewId>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [rolesSearchQuery, setRolesSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [previousView, setPreviousView] = useState<SelectedItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EditableItem | null>(null);
  const [crewPage, setCrewPage] = useState(1);
  const [rolesPage, setRolesPage] = useState(1);
  const [preferencesPage, setPreferencesPage] = useState(1);
  const [logbooksPage, setLogbooksPage] = useState(1);
  const [logbooksDeleteMode, setLogbooksDeleteMode] = useState(false);
  const [logbooksSelectedIds, setLogbooksSelectedIds] = useState<Set<string>>(new Set());
  const logbooksDragRef = useRef<{ active: boolean; adding: boolean } | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  const {
    apiStore, apiCrew, apiRoles, apiRoleFamilies, apiPreferences, apiRuns, apiLogbooks,
    dataLoaded,
    effectiveCrew, effectiveRoles, effectiveRoleFamilies, effectiveLogbooks, effectiveDateEntries,
    activityFilter, setActivityFilter,
    activityUserFilter, setActivityUserFilter,
    activityPage, setActivityPage,
    activityLoading,
    filteredActivityLogs, totalActivityPages, paginatedActivityLogs,
    commentText, setCommentText,
    commentSubmitting,
    hoveredCommentId, setHoveredCommentId,
    deleteConfirmLogId, setDeleteConfirmLogId,
    refreshData,
    handleCommentSubmit,
    handleDeleteComment,
  } = useHomeData(storeId);

  const { pendingFlyover, startFlyover, isActive: tutorialIsActive, viewHint } = useTutorialStore();

  useEffect(() => {
    if (!viewHint || !tutorialIsActive) return;
    setActiveView(viewHint as ViewId);
    setSelectedItem(null);
  }, [viewHint, tutorialIsActive]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideButton = userMenuRef.current && !userMenuRef.current.contains(target);
      const isOutsideDropdown = userDropdownRef.current && !userDropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) setIsUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!pendingFlyover || apiCrew.length === 0) return;
    const demoCrew = apiCrew.find((c: any) => c.name === 'Oliver Ostojic') ?? apiCrew[0];
    const steps = createHomeSteps({
      storeId,
      crewId: demoCrew.id,
      setViewHint: (view) => useTutorialStore.getState().setViewHint(view),
    });
    startFlyover(steps);
  }, [pendingFlyover, apiCrew]);

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

  const handleDelete = async (item: EditableItem) => {
    try {
      const endpoint = item.type === 'crew' ? `/crew/${item.id}` :
                       item.type === 'roles' ? `/roles/${item.id}` :
                       item.type === 'roleFamilies' ? `/role-families/${item.id}` :
                       item.type === 'preferences' ? `/role-rules/${item.id}` :
                       `/logbooks/${item.id}`;
      const res = await authFetch(`${API_URL}${endpoint}`, { method: 'DELETE' });
      if (res.ok) {
        refreshData();
        setDeleteConfirmItem(null);
        if (selectedItem && selectedItem.id === item.id && selectedItem.type === item.type) {
          setSelectedItem(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const isPdfView = selectedItem?.mode === 'pdf' && selectedItem?.type === 'logbooks';

  const filteredCrew = effectiveCrew.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRoles = effectiveRoles.filter(r =>
    r.name.toLowerCase().includes(rolesSearchQuery.toLowerCase())
  );
  const filteredRoleFamilies = effectiveRoleFamilies.filter(f =>
    f.name.toLowerCase().includes(rolesSearchQuery.toLowerCase())
  );
  const filteredDateEntries = effectiveDateEntries.filter((e: any) =>
    formatLogbookDate(e.date).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes iosWiggle{0%{transform:rotate(-0.04deg)}25%{transform:rotate(0.04deg)}50%{transform:rotate(-0.08deg)}75%{transform:rotate(0.08deg)}100%{transform:rotate(-0.08deg)}}.ios-wiggle{animation:iosWiggle 0.3s ease-in-out infinite}` }} />
      <DashboardLayout
        rightPanelVisible={activeView === 'home' && !!selectedItem}
        leftPanelWidth={isPdfView ? '40%' : undefined}
        rightPanelWidth={isPdfView ? '60%' : undefined}
        rightPanelKey={selectedItem ? `${selectedItem.id}-${selectedItem.type}-${selectedItem.mode}` : undefined}
        navLinks={[]}
        leftPanelPadding="p-6"
        leftPanel={
          <div className="ai-glass-border rounded-[1.5rem]" style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}>
            <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}>
              <div className="flex flex-col gap-6">
                <TopNavHeader storeId={storeId} activeNav="home" />

                <div className="sticky top-7 z-50">
                  <div data-tutorial-id="view-tabs" className="ai-glass-border" style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}>
                    <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '16px 8px', overflowX: 'auto' }}>
                      <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', width: '100%' }}>
                        <NavStatsCard icon={<BellIcon />} label="Activity" subtext="View all" isActive={activeView === 'home'} onClick={() => setActiveView('home')} isFirst />
                        <NavStatsCard icon={<UserGroupIcon />} label="Crew" count={effectiveCrew.length} isActive={activeView === 'crew'} onClick={() => setActiveView('crew')} tutorialId="view-tab-crew" />
                        <NavStatsCard icon={<DocumentTextIcon />} label="Logbooks" count={effectiveLogbooks.length} isActive={activeView === 'logbooks'} onClick={() => setActiveView('logbooks')} />
                        <NavStatsCard icon={<ShieldCheckIcon />} label="Roles" count={effectiveRoles.length} isActive={activeView === 'roles'} onClick={() => setActiveView('roles')} />
                        <NavStatsCard icon={<AdjustmentsHorizontalIcon />} label="Preferences" count={apiPreferences.length} isActive={activeView === 'preferences'} onClick={() => setActiveView('preferences')} isLast />
                      </nav>
                    </div>
                  </div>
                </div>

                {activeView === 'home' && (
                  <HomeView
                    activityLoading={activityLoading}
                    activityFilter={activityFilter}
                    setActivityFilter={setActivityFilter}
                    activityUserFilter={activityUserFilter}
                    setActivityUserFilter={setActivityUserFilter}
                    activityPage={activityPage}
                    setActivityPage={setActivityPage}
                    filteredActivityLogs={filteredActivityLogs}
                    totalActivityPages={totalActivityPages}
                    paginatedActivityLogs={paginatedActivityLogs}
                    commentText={commentText}
                    setCommentText={setCommentText}
                    commentSubmitting={commentSubmitting}
                    hoveredCommentId={hoveredCommentId}
                    setHoveredCommentId={setHoveredCommentId}
                    deleteConfirmLogId={deleteConfirmLogId}
                    setDeleteConfirmLogId={setDeleteConfirmLogId}
                    handleCommentSubmit={handleCommentSubmit}
                    handleDeleteComment={handleDeleteComment}
                    user={user}
                  />
                )}
                {activeView === 'crew' && (
                  <CrewView
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    filteredCrew={filteredCrew}
                    dataLoaded={dataLoaded}
                    crewPage={crewPage}
                    setCrewPage={setCrewPage}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    previousView={previousView}
                    setPreviousView={setPreviousView}
                    setActiveView={setActiveView}
                    storeId={storeId}
                    refreshData={refreshData}
                    setDeleteConfirmItem={setDeleteConfirmItem}
                    apiRuns={apiRuns}
                    apiStore={apiStore}
                    effectiveRoleFamilies={effectiveRoleFamilies}
                  />
                )}
                {activeView === 'roles' && (
                  <RolesView
                    rolesSearchQuery={rolesSearchQuery}
                    setRolesSearchQuery={setRolesSearchQuery}
                    filteredRoles={filteredRoles}
                    filteredRoleFamilies={filteredRoleFamilies}
                    effectiveRoleFamilies={effectiveRoleFamilies}
                    dataLoaded={dataLoaded}
                    rolesPage={rolesPage}
                    setRolesPage={setRolesPage}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    previousView={previousView}
                    setPreviousView={setPreviousView}
                    setActiveView={setActiveView}
                    storeId={storeId}
                    refreshData={refreshData}
                    setDeleteConfirmItem={setDeleteConfirmItem}
                    apiRuns={apiRuns}
                    apiStore={apiStore}
                  />
                )}
                {activeView === 'preferences' && (
                  <PreferencesView
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    apiPreferences={apiPreferences}
                    dataLoaded={dataLoaded}
                    preferencesPage={preferencesPage}
                    setPreferencesPage={setPreferencesPage}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    previousView={previousView}
                    setPreviousView={setPreviousView}
                    setActiveView={setActiveView}
                    storeId={storeId}
                    refreshData={refreshData}
                    setDeleteConfirmItem={setDeleteConfirmItem}
                    apiRuns={apiRuns}
                    apiStore={apiStore}
                    effectiveRoleFamilies={effectiveRoleFamilies}
                  />
                )}
                {activeView === 'logbooks' && (
                  <LogbooksView
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    filteredDateEntries={filteredDateEntries}
                    dataLoaded={dataLoaded}
                    logbooksPage={logbooksPage}
                    setLogbooksPage={setLogbooksPage}
                    logbooksDeleteMode={logbooksDeleteMode}
                    setLogbooksDeleteMode={setLogbooksDeleteMode}
                    logbooksSelectedIds={logbooksSelectedIds}
                    setLogbooksSelectedIds={setLogbooksSelectedIds}
                    logbooksDragRef={logbooksDragRef}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    previousView={previousView}
                    setPreviousView={setPreviousView}
                    setActiveView={setActiveView}
                    storeId={storeId}
                    refreshData={refreshData}
                    setDeleteConfirmItem={setDeleteConfirmItem}
                    apiRuns={apiRuns}
                    apiStore={apiStore}
                    effectiveRoleFamilies={effectiveRoleFamilies}
                    tutorialIsActive={tutorialIsActive}
                  />
                )}
              </div>
            </div>
          </div>
        }
        rightPanel={
          <div className="ai-glass-border rounded-[1.5rem]" style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}>
            <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}>
              <HomeRightPanel
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                setActiveView={setActiveView}
                setPreviousView={setPreviousView}
                previousView={previousView}
                storeId={storeId}
                refreshData={refreshData}
                setDeleteConfirmItem={setDeleteConfirmItem}
                apiStore={apiStore}
              />
            </div>
          </div>
        }
        activeNavItem="Home"
      />

      {deleteConfirmItem && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 1000 }}
          onClick={() => setDeleteConfirmItem(null)}
        >
          <div
            className="ai-glass-border"
            style={{ ...aiGlassLightBorderStyle('1.5rem'), maxWidth: '400px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.95), padding: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-open-sans)', fontSize: '18px', fontWeight: 500, color: '#2C2C2C', marginBottom: '12px' }}>
                Delete {deleteConfirmItem.type === 'crew' ? 'Crew Member' :
                        deleteConfirmItem.type === 'roles' ? 'Role' :
                        deleteConfirmItem.type === 'preferences' ? 'Preference' : 'Logbook'}?
              </h3>
              <p style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', marginBottom: '24px' }}>
                Are you sure you want to delete{' '}
                <span style={{ color: '#2C2C2C', fontWeight: 500 }}>{deleteConfirmItem.name}</span>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirmItem(null)}
                  style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#6B6B6B', backgroundColor: 'rgba(0, 0, 0, 0.05)', border: 'none', borderRadius: '9999px', padding: '8px 16px', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmItem)}
                  style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#FFFFFF', backgroundColor: 'hsl(0, 84%, 60%)', border: 'none', borderRadius: '9999px', padding: '8px 16px', cursor: 'pointer' }}
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
          style={{ ...aiGlassLightBorderStyle('1rem'), position: 'fixed', zIndex: 99999 }}
        >
          <div style={{ ...aiGlassLightContentStyle('1rem', 0.95), padding: '8px', position: 'relative', zIndex: 5 }}>
            {user && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0, 0, 0, 0.08)', marginBottom: '8px' }}>
                <div style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 600, color: '#2C2C2C' }}>
                  {user.name}
                </div>
                <div style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#6B6B6B', marginTop: '2px' }}>
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </div>
              </div>
            )}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => { setIsUserMenuOpen(false); router.push('/admin'); }}
                className="w-full transition-all"
                style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#2C2C2C', textAlign: 'left' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Back to stores
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full transition-all"
              style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#2C2C2C', textAlign: 'left' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
