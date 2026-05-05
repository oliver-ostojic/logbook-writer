'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { useRouter, useParams } from 'next/navigation';
import { DashboardHeader } from '@/components/layouts';
import { CardContainer, CardHeader, GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { StoreForm, StoreDetailView } from '../../../stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';
import { ChevronLeftIcon } from '@heroicons/react/20/solid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Store {
  id: number;
  name: string;
  timezone: string;
  Company?: { id: number; name: string };
}

interface Company {
  id: number;
  name: string;
  stores: Store[];
}

type ViewMode = 'list' | 'view' | 'add' | 'edit';

export default function CompanyStoresPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  const { user } = useAuthStore();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const fetchCompany = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`${API_URL}/companies/${companyId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCompany(data);
      }
    } catch (err) {
      console.error('Failed to fetch company:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchCompany();
    }
  }, [companyId]);

  const handleStoreClick = (store: Store) => {
    // Navigate to the store's home page
    router.push(`/stores/${store.id}/home`);
  };

  const handleAddStore = () => {
    setSelectedStore(null);
    setViewMode('add');
  };

  const handleViewStore = (store: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStore(store);
    setViewMode('view');
  };

  const handleEditStore = (store: Store, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStore(store);
    setViewMode('edit');
  };

  const handleDeleteStore = async (storeId: number) => {
    if (!confirm('Are you sure you want to delete this store?')) return;
    try {
      const res = await authFetch(`${API_URL}/stores/${storeId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchCompany();
        setSelectedStore(null);
        setViewMode('list');
      }
    } catch (err) {
      console.error('Failed to delete store:', err);
    }
  };

  const handleFormSuccess = () => {
    fetchCompany();
    setSelectedStore(null);
    setViewMode('list');
  };

  const handleFormCancel = () => {
    setSelectedStore(null);
    setViewMode('list');
  };

  const handleBackToCompanies = () => {
    router.push('/admin');
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <DashboardHeader navLinks={[]} lightMode={true} />

      <div className="px-6 lg:px-8 pt-20 pb-9">
        <div className="max-w-5xl mx-auto">
          {/* Back button above the card */}
          <button
            onClick={handleBackToCompanies}
            className="ai-glass-border"
            style={{
              ...aiGlassLightBorderStyle('9999px'),
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              width: 'fit-content',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ChevronLeftIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  color: '#6B6B6B',
                }}
              >
                Companies
              </span>
            </div>
          </button>

          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem" borderOpacity={0.15}>
            <div className="flex flex-col gap-6">
              {/* Header */}
              <CardHeader
                title={company?.name || 'Loading...'}
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                borderOpacity={0.15}
              />

              {/* Content */}
              <div className="flex gap-4">
                {/* Stores List */}
                <div
                  style={{
                    width: viewMode === 'list' ? '100%' : '40%',
                    transition: 'width 0.3s ease',
                  }}
                >
                  <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
                    <div className="flex flex-col" style={{ minHeight: '400px' }}>
                      {/* Title and Add button */}
                      <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
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
                            Stores
                          </div>
                        </div>
                        <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                          <button
                            onClick={handleAddStore}
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

                      {/* Stores list */}
                      <div className="flex flex-col gap-3 flex-1">
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
                        ) : !company?.stores || company.stores.length === 0 ? (
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
                          company.stores.map((store) => {
                            const isSelected = selectedStore?.id === store.id;
                            return (
                              <GlassPillButton
                                key={store.id}
                                isSelected={isSelected}
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

                {/* Detail Panel */}
                {viewMode !== 'list' && (
                  <div
                    style={{
                      width: '60%',
                      transition: 'width 0.3s ease',
                    }}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Panel Header */}
                      <CardHeader
                        title={viewMode === 'add' ? 'New Store' : selectedStore?.name || ''}
                        lightMode={true}
                        borderRadius="1.5rem"
                        titleStyle={{ color: '#2C2C2C' }}
                        rightContent={
                          <button
                            onClick={handleFormCancel}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '4px 8px',
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '14px',
                              color: '#6B6B6B',
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        }
                      />

                      {/* Panel Content */}
                      {(viewMode === 'add' || viewMode === 'edit') && (
                        <StoreForm
                          mode={viewMode === 'add' ? 'add' : 'edit'}
                          storeId={selectedStore?.id}
                          onSuccess={handleFormSuccess}
                          onCancel={handleFormCancel}
                        />
                      )}
                      {viewMode === 'view' && selectedStore && (
                        <StoreDetailView
                          storeId={selectedStore.id}
                          onDelete={() => handleDeleteStore(selectedStore.id)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContainer>
        </div>
      </div>
    </main>
  );
}
