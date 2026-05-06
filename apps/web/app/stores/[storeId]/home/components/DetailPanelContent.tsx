'use client';

import { CardContainer, GlassPillCard, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import {
  CrewForm, CrewDetailView,
  RoleForm, RoleDetailView,
  RoleFamilyForm, RoleFamilyDetailView,
  RoleRuleForm, RoleRuleDetailView,
  CompanyForm, CompanyDetailView,
  StoreForm, StoreDetailView,
  RunDetailView, LogbookPdfViewer, LogbookSupersededHistory,
} from './index';
import { SelectedItem, EditableItem, ViewId } from '../types';

interface DetailPanelContentProps {
  selectedItem: SelectedItem;
  setSelectedItem: (item: SelectedItem | null) => void;
  setActiveView: (view: ViewId) => void;
  setPreviousView: (item: SelectedItem | null) => void;
  previousView: SelectedItem | null;
  apiRuns: any[];
  apiStore: any;
  storeId: string;
  refreshData: () => void;
  setDeleteConfirmItem: (item: EditableItem | null) => void;
  effectiveRoleFamilies: { id: string; name: string }[];
}

export function DetailPanelContent({
  selectedItem,
  setSelectedItem,
  setActiveView,
  setPreviousView,
  previousView,
  apiRuns,
  apiStore,
  storeId,
  refreshData,
  setDeleteConfirmItem,
  effectiveRoleFamilies,
}: DetailPanelContentProps) {
  if (selectedItem.mode === 'pdf' && selectedItem.type === 'logbooks') {
    return (
      <LogbookPdfViewer
        logbookId={selectedItem.id}
        logbookDate={selectedItem.name}
        onBack={() => setSelectedItem({ ...selectedItem, mode: 'history' })}
      />
    );
  }

  if (selectedItem.mode === 'history' && selectedItem.type === 'logbooks') {
    const dateKey = selectedItem.dateKey;
    const dateRuns = dateKey
      ? (apiRuns as any[])
          .filter((r: any) => new Date(r.date).toISOString().split('T')[0] === dateKey)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : [];
    return (
      <LogbookSupersededHistory
        logbookId={selectedItem.id}
        runs={dateRuns}
        onViewPdf={(logbookId, date) => {
          setSelectedItem({ id: logbookId, name: date, type: 'logbooks', mode: 'pdf', dateKey });
        }}
        onViewRunInfo={(runId) => {
          setSelectedItem({
            id: runId,
            name: 'Run Info',
            type: 'runs',
            mode: 'runInfo',
            fromLogbookId: selectedItem.id,
            fromLogbookName: selectedItem.name,
            fromMode: 'history',
            dateKey,
          });
        }}
        onDelete={() => refreshData()}
        onClose={() => {
          setActiveView('logbooks');
          setSelectedItem(null);
        }}
      />
    );
  }

  if (selectedItem.mode === 'runsOnly' && selectedItem.type === 'logbooks') {
    const dateKey = selectedItem.dateKey;
    const dateRuns = dateKey
      ? (apiRuns as any[])
          .filter((r: any) => new Date(r.date).toISOString().split('T')[0] === dateKey)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : [];
    return (
      <LogbookSupersededHistory
        logbookId=""
        runs={dateRuns}
        runsOnly={true}
        onViewPdf={() => {}}
        onClose={() => { setActiveView('logbooks'); setSelectedItem(null); }}
      />
    );
  }

  if (selectedItem.mode === 'runInfo' && selectedItem.type === 'runs') {
    return (
      <RunDetailView
        runId={selectedItem.id}
        onBack={() => {
          if (selectedItem.fromLogbookId) {
            setSelectedItem({
              id: selectedItem.fromLogbookId,
              name: selectedItem.fromLogbookName || '',
              type: 'logbooks',
              mode: selectedItem.fromMode || 'history',
              dateKey: selectedItem.dateKey,
            });
          } else {
            setActiveView('logbooks');
            setSelectedItem(null);
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div data-tutorial-id="detail-header" style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
        <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
          <div className="flex items-center" style={{ width: '100%', gap: '12px' }}>
            {selectedItem.mode === 'view' && selectedItem.type !== 'roleFamilies' && (
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
                <button
                  onClick={() => setSelectedItem({ ...selectedItem, mode: 'edit' })}
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.6),
                    padding: '6px 14px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
              </div>
            )}
            {selectedItem.mode === 'view' && (
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
                <button
                  onClick={() => setDeleteConfirmItem({ id: selectedItem.id, name: selectedItem.name, type: selectedItem.type })}
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.6),
                    padding: '6px 14px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'hsl(0, 84%, 50%)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (selectedItem.mode === 'edit' || selectedItem.mode === 'add') {
                    setSelectedItem({ ...selectedItem, mode: 'view' });
                  } else if (previousView) {
                    setSelectedItem(previousView);
                    setPreviousView(null);
                  } else {
                    setSelectedItem(null);
                  }
                }}
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.4),
                  padding: '6px 14px',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#6B6B6B',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            </div>
          </div>
        </GlassPillCard>
      </div>

      <div data-tutorial-id="detail-content" className="flex flex-col gap-4" style={{ marginTop: '1rem' }}>
        {selectedItem.type === 'crew' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
          <CrewForm
            mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
            crewId={selectedItem.mode === 'edit' ? selectedItem.id : undefined}
            storeId={storeId}
            onSuccess={(newCrew?: any) => {
              refreshData();
              if (selectedItem.mode === 'add' && newCrew) {
                setSelectedItem({ id: newCrew.id, name: newCrew.name, type: 'crew', mode: 'view' });
              } else {
                setActiveView('crew');
                setSelectedItem(null);
              }
            }}
            onCancel={() => { setActiveView('crew'); setSelectedItem(null); }}
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
              if (selectedItem.mode === 'add' && newRole) {
                setSelectedItem({ id: String(newRole.id), name: newRole.displayName, type: 'roles', mode: 'view' });
              } else {
                setActiveView('roles');
                setSelectedItem(null);
              }
            }}
            onCancel={() => { setActiveView('roles'); setSelectedItem(null); }}
          />
        ) : selectedItem.type === 'roles' && selectedItem.mode === 'view' ? (
          <RoleDetailView
            roleId={Number(selectedItem.id)}
            onRoleRuleClick={(roleRuleId, roleRuleName) => {
              setPreviousView(selectedItem);
              setSelectedItem({ id: String(roleRuleId), name: roleRuleName, type: 'preferences', mode: 'view' });
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
                if (newFamily) {
                  setSelectedItem({ id: String(newFamily.id), name: newFamily.displayName || newFamily.name, type: 'roleFamilies', mode: 'view' });
                } else {
                  setActiveView('roles');
                  setSelectedItem(null);
                }
              }}
              onCancel={() => { setActiveView('roles'); setSelectedItem(null); }}
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
            onCancel={() => { setActiveView('preferences'); setSelectedItem(null); }}
          />
        ) : selectedItem.type === 'preferences' && selectedItem.mode === 'view' ? (
          <RoleRuleDetailView
            ruleId={Number(selectedItem.id)}
            constraintType="SOFT"
            onBack={() => {
              if (previousView) {
                setSelectedItem(previousView);
                setPreviousView(null);
              } else {
                setActiveView('preferences');
                setSelectedItem(null);
              }
            }}
            onEdit={() => setSelectedItem({ ...selectedItem, mode: 'edit' })}
            onDelete={() => setDeleteConfirmItem({ id: selectedItem.id, name: selectedItem.name, type: 'preferences' })}
          />
        ) : selectedItem.type === 'companies' && (selectedItem.mode === 'add' || selectedItem.mode === 'edit') ? (
          <CompanyForm
            mode={selectedItem.mode === 'add' ? 'add' : 'edit'}
            companyId={selectedItem.mode === 'edit' ? Number(selectedItem.id) : undefined}
            onSuccess={(newCompany?: any) => {
              refreshData();
              if (selectedItem.mode === 'add' && newCompany) {
                setSelectedItem({ id: String(newCompany.id), name: newCompany.name, type: 'companies', mode: 'view' });
              } else {
                setActiveView('home' as ViewId);
                setSelectedItem(null);
              }
            }}
            onCancel={() => { setActiveView('home' as ViewId); setSelectedItem(null); }}
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
                setSelectedItem({ id: String(newStore.id), name: newStore.name, type: 'stores', mode: 'view' });
              } else {
                setActiveView('home' as ViewId);
                setSelectedItem(null);
              }
            }}
            onCancel={() => { setActiveView('home' as ViewId); setSelectedItem(null); }}
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
                {selectedItem.mode === 'add' ? 'Adding new' : selectedItem.mode === 'edit' ? 'Editing' : 'Viewing'}{' '}
                {selectedItem.type === 'crew' ? 'crew member' : selectedItem.type === 'roles' ? 'role' : 'logbook'}
                {selectedItem.mode !== 'add' && <> : <span style={{ color: '#2C2C2C', fontWeight: 500 }}>{selectedItem.name}</span></>}
              </p>
            </div>
          </CardContainer>
        )}
      </div>
    </div>
  );
}
