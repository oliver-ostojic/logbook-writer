'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/layouts';
import { CardContainer, GlassPillCard, GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { CompanyForm, CompanyDetailView, StoreForm, StoreDetailView } from '../stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';

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
  const { user } = useAuthStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyViewMode, setCompanyViewMode] = useState<CompanyViewMode>('list');

  // Store state
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [storeViewMode, setStoreViewMode] = useState<StoreViewMode>('none');
  const [storesLoading, setStoresLoading] = useState(false);
  const [companyStores, setCompanyStores] = useState<Store[]>([]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/companies`, { credentials: 'include' });
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
      const res = await fetch(`${API_URL}/companies/${companyId}`, { credentials: 'include' });
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
      const res = await fetch(`${API_URL}/companies/${companyId}`, {
        method: 'DELETE',
        credentials: 'include',
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
      const res = await fetch(`${API_URL}/stores/${storeId}`, {
        method: 'DELETE',
        credentials: 'include',
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
  const showStoreDetailPanel = (storeViewMode === 'view' || storeViewMode === 'add' || storeViewMode === 'edit') && storeViewMode !== 'list';

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <DashboardHeader navLinks={[]} lightMode={true} />

      <div className="px-6 lg:px-8 pt-20 pb-9">
        <div className="max-w-5xl mx-auto">
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
              {/* Admin Header - embedded at top */}
              <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                <GlassPillCard padding="6px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                  <div className="flex items-center justify-center" style={{ width: '100%', padding: '8px 0' }}>
                    {/* Admin title bubble */}
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
                        Admin
                      </div>
                    </div>
                  </div>
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
    </main>
  );
}
