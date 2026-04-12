'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CardContainer, GlassPillCard, GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { CompanyForm, CompanyDetailView, StoreForm, StoreDetailView, NavStatsCard } from '../stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';
import { authFetch } from '@/lib/api/authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Store {
  id: number;
  name: string;
  timezone: string;
}

interface Company {
  id: number;
  name: string;
  stores?: Store[];
}

type CompanyViewMode = 'list' | 'view' | 'add' | 'edit';
type StoreViewMode = 'none' | 'list' | 'view' | 'add' | 'edit';

export default function AdminPage() {
  const router = useRouter();
  const { user, logout: logoutStore } = useAuthStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyViewMode, setCompanyViewMode] = useState<CompanyViewMode>('list');

  // Store state
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [storeViewMode, setStoreViewMode] = useState<StoreViewMode>('none');
  const [storesLoading, setStoresLoading] = useState(false);
  const [companyStores, setCompanyStores] = useState<Store[]>([]);

  // User menu state
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
    setIsUserMenuOpen(false);
    try {
      await logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    logoutStore();
    router.push('/login');
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`${API_URL}/companies`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyStores = async (companyId: number) => {
    try {
      setStoresLoading(true);
      const res = await authFetch(`${API_URL}/companies/${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyStores(data.stores || []);
      }
    } catch (err) {
      console.error('Failed to fetch company stores:', err);
    } finally {
      setStoresLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCompanyClick = (company: Company) => {
    if (selectedCompany?.id === company.id && storeViewMode === 'list') {
      // Clicking same company again closes the stores panel
      setSelectedCompany(null);
      setStoreViewMode('none');
      setCompanyStores([]);
    } else {
      setSelectedCompany(company);
      setStoreViewMode('list');
      setSelectedStore(null);
      fetchCompanyStores(company.id);
    }
  };

  const handleAddCompany = () => {
    setSelectedCompany(null);
    setCompanyViewMode('add');
    setStoreViewMode('none');
  };

  const handleViewCompany = (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCompany(company);
    setCompanyViewMode('view');
    setStoreViewMode('none');
  };

  const handleEditCompany = (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCompany(company);
    setCompanyViewMode('edit');
    setStoreViewMode('none');
  };

  const handleDeleteCompany = async (companyId: number) => {
    if (!confirm('Are you sure you want to delete this company?')) return;
    try {
      const res = await authFetch(`${API_URL}/companies/${companyId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchCompanies();
        setSelectedCompany(null);
        setCompanyViewMode('list');
        setStoreViewMode('none');
      }
    } catch (err) {
      console.error('Failed to delete company:', err);
    }
  };

  const handleCompanyFormSuccess = () => {
    fetchCompanies();
    setSelectedCompany(null);
    setCompanyViewMode('list');
  };

  const handleCompanyFormCancel = () => {
    setSelectedCompany(null);
    setCompanyViewMode('list');
  };

  // Store handlers
  const handleStoreClick = (store: Store) => {
    router.push(`/stores/${store.id}/home`);
  };

  const handleAddStore = () => {
    setSelectedStore(null);
    setStoreViewMode('add');
  };

  const handleViewStore = (store: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStore(store);
    setStoreViewMode('view');
  };

  const handleEditStore = (store: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStore(store);
    setStoreViewMode('edit');
  };

  const handleDeleteStore = async (storeId: number) => {
    if (!confirm('Are you sure you want to delete this store?')) return;
    try {
      const res = await authFetch(`${API_URL}/stores/${storeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (selectedCompany) {
          await fetchCompanyStores(selectedCompany.id);
        }
        await fetchCompanies();
        setSelectedStore(null);
        setStoreViewMode('list');
      }
    } catch (err) {
      console.error('Failed to delete store:', err);
    }
  };

  const handleStoreFormSuccess = () => {
    if (selectedCompany) {
      fetchCompanyStores(selectedCompany.id);
    }
    fetchCompanies();
    setSelectedStore(null);
    setStoreViewMode('list');
  };

  const handleStoreFormCancel = () => {
    setSelectedStore(null);
    setStoreViewMode('list');
  };

  // Determine panel widths
  const showCompanyPanel = companyViewMode !== 'list';
  const showStoresPanel = storeViewMode !== 'none' && !showCompanyPanel;
  const showStoreDetailPanel = storeViewMode === 'view' || storeViewMode === 'add' || storeViewMode === 'edit';

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <style>{`
        @media (min-width: 1200px) {
          .admin-container {
            flex: 0 0 80%;
            max-width: 80%;
          }
        }
      `}</style>

      <div className="px-6 lg:px-8 pt-12 lg:pt-16 pb-9">
        <div className="flex flex-col min-[1200px]:flex-row gap-6 min-[1200px]:justify-center">
          <div className="w-full admin-container">
            {/* Outer card with embedded Admin header - raw divs so backdrop-filter border works */}
            <div
              className="ai-glass-border"
              style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
            >
          <div
            className="rounded-[1.5rem]"
            style={{
              ...aiGlassLightContentStyle('1.5rem', 0.6),
              padding: '1rem',
            }}
          >
            <div className="flex flex-col gap-4">
              {/* Admin Navigation Header - embedded at top */}
              <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                <GlassPillCard padding="8px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                  <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                    <NavStatsCard
                      label="Admin"
                      textOnly
                      isActive={true}
                      onClick={() => {}}
                    />
                    <div ref={userMenuRef} style={{ flex: 1, display: 'flex' }}>
                      <NavStatsCard
                        label="Account"
                        textOnly
                        isActive={isUserMenuOpen}
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      />
                    </div>
                  </nav>
                </GlassPillCard>
              </div>

              {/* Inner Companies card */}
              <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem" borderOpacity={0.08}>
                <div className="flex flex-col gap-4">
                  {/* Companies Header - embedded at top */}
                  <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                    <GlassPillCard padding="6px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                      <div className="flex items-center justify-between" style={{ width: '100%', padding: '8px 10px' }}>
                        {/* Companies title bubble */}
                        <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                          <div
                            className="ai-glass-content"
                            style={{
                              ...aiGlassLightContentStyle('9999px', 0.6),
                              padding: '6px 14px',
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              fontWeight: 500,
                              color: '#2C2C2C',
                            }}
                          >
                            Companies
                          </div>
                        </div>
                        {/* Add button */}
                        <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                          <button
                            className="ai-glass-content"
                            onClick={handleAddCompany}
                            style={{
                              ...aiGlassLightContentStyle('9999px', 0.4),
                              padding: '0 14px',
                              height: '36px',
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

                  {/* Content */}
                  <div className="flex gap-4">
                {/* Companies List */}
                <div
                  style={{
                    width: showCompanyPanel || showStoresPanel ? '40%' : '100%',
                    transition: 'width 0.3s ease',
                  }}
                >
                  <div className="flex flex-col gap-3" style={{ minHeight: '300px' }}>
                    {loading ? (
                      <div
                        className="flex items-center justify-center flex-1"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          color: '#6B6B6B',
                        }}
                      >
                        Loading...
                      </div>
                    ) : companies.length === 0 ? (
                      <div
                        className="flex items-center justify-center flex-1"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          color: '#6B6B6B',
                        }}
                      >
                        No companies found
                      </div>
                    ) : (
                      companies.map((company) => {
                        const isSelected = selectedCompany?.id === company.id;
                        const storeCount = company.stores?.length || 0;
                        return (
                          <GlassPillButton
                            key={company.id}
                            isSelected={isSelected}
                            onClick={() => handleCompanyClick(company)}
                            padding="12px 16px"
                            contentStyle={{ justifyContent: 'space-between' }}
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
                                {company.name}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '12px',
                                  color: '#6B6B6B',
                                }}
                              >
                                {storeCount} store{storeCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => handleViewCompany(company, e)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '9999px',
                                  border: 'none',
                                  background: 'rgba(0, 0, 0, 0.05)',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '12px',
                                  color: '#6B6B6B',
                                  cursor: 'pointer',
                                }}
                              >
                                View
                              </button>
                              <button
                                onClick={(e) => handleEditCompany(company, e)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '9999px',
                                  border: 'none',
                                  background: 'rgba(0, 0, 0, 0.05)',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '12px',
                                  color: '#6B6B6B',
                                  cursor: 'pointer',
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          </GlassPillButton>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Company Detail Panel */}
                {showCompanyPanel && (
                  <div
                    style={{
                      width: '60%',
                      transition: 'width 0.3s ease',
                    }}
                  >
                    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem" borderOpacity={0.08}>
                      <div className="flex flex-col gap-3">
                        {/* Panel Header */}
                        <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                          <GlassPillCard padding="6px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                            <div className="flex items-center justify-between" style={{ width: '100%', padding: '8px 10px' }}>
                              {/* Title bubble */}
                              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                <div
                                  className="ai-glass-content"
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.6),
                                    padding: '6px 14px',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#2C2C2C',
                                  }}
                                >
                                  {companyViewMode === 'add' ? 'New Company' : selectedCompany?.name || ''}
                                </div>
                              </div>
                              <button
                                onClick={handleCompanyFormCancel}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '4px 8px',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '18px',
                                  color: '#6B6B6B',
                                  cursor: 'pointer',
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </GlassPillCard>
                        </div>

                        {/* Panel Content */}
                        {(companyViewMode === 'add' || companyViewMode === 'edit') && (
                          <CompanyForm
                            mode={companyViewMode === 'add' ? 'add' : 'edit'}
                            companyId={selectedCompany?.id}
                            onSuccess={handleCompanyFormSuccess}
                            onCancel={handleCompanyFormCancel}
                          />
                        )}
                        {companyViewMode === 'view' && selectedCompany && (
                          <CompanyDetailView
                            companyId={selectedCompany.id}
                            onDelete={() => handleDeleteCompany(selectedCompany.id)}
                          />
                        )}
                      </div>
                    </CardContainer>
                  </div>
                )}

                {/* Stores Panel */}
                {showStoresPanel && (
                  <div
                    style={{
                      width: showStoreDetailPanel ? '30%' : '60%',
                      transition: 'width 0.3s ease',
                    }}
                  >
                    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem" borderOpacity={0.08}>
                      <div className="flex flex-col gap-3">
                        {/* Stores Header */}
                        <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                          <GlassPillCard padding="6px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                            <div className="flex items-center justify-between" style={{ width: '100%', padding: '8px 10px' }}>
                              {/* Stores title bubble */}
                              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                <div
                                  className="ai-glass-content"
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.6),
                                    padding: '6px 14px',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#2C2C2C',
                                  }}
                                >
                                  Stores
                                </div>
                              </div>
                              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                <button
                                  className="ai-glass-content"
                                  onClick={handleAddStore}
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.4),
                                    padding: '0 14px',
                                    height: '36px',
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

                        {/* Stores list */}
                        <div className="flex flex-col gap-3" style={{ minHeight: '200px' }}>
                          {storesLoading ? (
                            <div
                              className="flex items-center justify-center flex-1"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                                color: '#6B6B6B',
                              }}
                            >
                              Loading...
                            </div>
                          ) : companyStores.length === 0 ? (
                            <div
                              className="flex items-center justify-center flex-1"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                                color: '#6B6B6B',
                              }}
                            >
                              No stores found
                            </div>
                          ) : (
                            companyStores.map((store) => {
                              const isStoreSelected = selectedStore?.id === store.id;
                              return (
                                <GlassPillButton
                                  key={store.id}
                                  isSelected={isStoreSelected}
                                  onClick={() => handleStoreClick(store)}
                                  padding="12px 16px"
                                  contentStyle={{ justifyContent: 'space-between' }}
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
                                      {store.name}
                                    </span>
                                    <span
                                      style={{
                                        fontFamily: 'var(--font-open-sans)',
                                        fontSize: '12px',
                                        color: '#6B6B6B',
                                      }}
                                    >
                                      {store.timezone}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={(e) => handleViewStore(store, e)}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: '9999px',
                                        border: 'none',
                                        background: 'rgba(0, 0, 0, 0.05)',
                                        fontFamily: 'var(--font-open-sans)',
                                        fontSize: '12px',
                                        color: '#6B6B6B',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      View
                                    </button>
                                    <button
                                      onClick={(e) => handleEditStore(store, e)}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: '9999px',
                                        border: 'none',
                                        background: 'rgba(0, 0, 0, 0.05)',
                                        fontFamily: 'var(--font-open-sans)',
                                        fontSize: '12px',
                                        color: '#6B6B6B',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </GlassPillButton>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </CardContainer>
                  </div>
                )}

                {/* Store Detail Panel */}
                {showStoresPanel && showStoreDetailPanel && (
                  <div
                    style={{
                      width: '30%',
                      transition: 'width 0.3s ease',
                    }}
                  >
                    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem" borderOpacity={0.08}>
                      <div className="flex flex-col gap-3">
                        {/* Panel Header */}
                        <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                          <GlassPillCard padding="6px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                            <div className="flex items-center justify-between" style={{ width: '100%', padding: '8px 10px' }}>
                              {/* Title bubble */}
                              <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                                <div
                                  className="ai-glass-content"
                                  style={{
                                    ...aiGlassLightContentStyle('9999px', 0.6),
                                    padding: '6px 14px',
                                    fontFamily: 'var(--font-open-sans)',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#2C2C2C',
                                  }}
                                >
                                  {storeViewMode === 'add' ? 'New Store' : selectedStore?.name || ''}
                                </div>
                              </div>
                              <button
                                onClick={handleStoreFormCancel}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '4px 8px',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '18px',
                                  color: '#6B6B6B',
                                  cursor: 'pointer',
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </GlassPillCard>
                        </div>

                        {/* Panel Content */}
                        {(storeViewMode === 'add' || storeViewMode === 'edit') && (
                          <StoreForm
                            mode={storeViewMode === 'add' ? 'add' : 'edit'}
                            storeId={selectedStore?.id}
                            companyId={selectedCompany?.id}
                            onSuccess={handleStoreFormSuccess}
                            onCancel={handleStoreFormCancel}
                          />
                        )}
                        {storeViewMode === 'view' && selectedStore && (
                          <StoreDetailView
                            storeId={selectedStore.id}
                            onDelete={() => handleDeleteStore(selectedStore.id)}
                          />
                        )}
                      </div>
                    </CardContainer>
                  </div>
                )}
                  </div>
                </div>
              </CardContainer>
            </div>
          </div>
          </div>
          </div>
        </div>
      </div>

      {/* User dropdown menu - rendered at root level with fixed positioning */}
      {isUserMenuOpen && userMenuRef.current && (
        <div
          ref={(el) => {
            userDropdownRef.current = el;
            // Position dropdown below the user button, matching its width
            if (el && userMenuRef.current) {
              const rect = userMenuRef.current.getBoundingClientRect();
              el.style.top = `${rect.bottom + 16}px`;
              el.style.left = `${rect.left}px`;
              el.style.width = `${rect.width}px`;
            }
          }}
          className="ai-glass-border"
          style={{
            ...aiGlassLightBorderStyle('1rem'),
            position: 'fixed',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1rem', 0.95),
              padding: '8px',
              position: 'relative',
              zIndex: 5,
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
                  {user.username}
                </div>
              </div>
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
                color: '#2C2C2C',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
