'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/layouts';
import { CardContainer, CardHeader, GlassPillButton, aiGlassAnimations, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { CompanyForm, CompanyDetailView } from '../stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Company {
  id: number;
  name: string;
  stores?: { id: number; name: string }[];
}

type ViewMode = 'list' | 'view' | 'add' | 'edit';

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCompanyClick = (company: Company) => {
    // Navigate to the stores page for this company
    router.push(`/admin/companies/${company.id}`);
  };

  const handleAddCompany = () => {
    setSelectedCompany(null);
    setViewMode('add');
  };

  const handleViewCompany = (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCompany(company);
    setViewMode('view');
  };

  const handleEditCompany = (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCompany(company);
    setViewMode('edit');
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
        setViewMode('list');
      }
    } catch (err) {
      console.error('Failed to delete company:', err);
    }
  };

  const handleFormSuccess = () => {
    fetchCompanies();
    setSelectedCompany(null);
    setViewMode('list');
  };

  const handleFormCancel = () => {
    setSelectedCompany(null);
    setViewMode('list');
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <DashboardHeader navLinks={[]} lightMode={true} />

      <div className="px-6 lg:px-8 pt-20 pb-9">
        <div className="max-w-5xl mx-auto">
          <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem" borderOpacity={0.15}>
            <div className="flex flex-col gap-6">
              {/* Header */}
              <CardHeader
                title="Admin"
                lightMode={true}
                borderRadius="1.5rem"
                titleStyle={{ color: '#2C2C2C' }}
                borderOpacity={0.15}
              />

              {/* Content */}
              <div className="flex gap-4">
                {/* Companies List */}
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
                            Companies
                          </div>
                        </div>
                        <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                          <button
                            onClick={handleAddCompany}
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

                      {/* Companies list */}
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
                        title={viewMode === 'add' ? 'New Company' : selectedCompany?.name || ''}
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
                        <CompanyForm
                          mode={viewMode === 'add' ? 'add' : 'edit'}
                          companyId={selectedCompany?.id}
                          onSuccess={handleFormSuccess}
                          onCancel={handleFormCancel}
                        />
                      )}
                      {viewMode === 'view' && selectedCompany && (
                        <CompanyDetailView
                          companyId={selectedCompany.id}
                          onDelete={() => handleDeleteCompany(selectedCompany.id)}
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
