'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import { CardContainer, CardHeader, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
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

interface HomeRightPanelProps {
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;
  setActiveView: (view: ViewId) => void;
  setPreviousView: (item: SelectedItem | null) => void;
  previousView: SelectedItem | null;
  storeId: string;
  refreshData: () => void;
  setDeleteConfirmItem: (item: EditableItem | null) => void;
  apiStore: any;
}

export function HomeRightPanel({
  selectedItem,
  setSelectedItem,
  setActiveView,
  setPreviousView,
  previousView,
  storeId,
  refreshData,
  setDeleteConfirmItem,
  apiStore,
}: HomeRightPanelProps) {
  const router = useRouter();

  if (!selectedItem) {
    return (
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
    );
  }

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
    return (
      <LogbookSupersededHistory
        logbookId={selectedItem.id}
        onViewPdf={(logbookId, date) => {
          setSelectedItem({ id: logbookId, name: date, type: 'logbooks', mode: 'pdf' });
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
            dateKey: selectedItem.dateKey,
          });
        }}
        onDelete={() => refreshData()}
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

  const titleText = selectedItem.mode === 'add' && !selectedItem.id
    ? `New ${selectedItem.type === 'crew' ? 'Crew Member' : selectedItem.type === 'roles' ? 'Role' : selectedItem.type === 'roleFamilies' ? 'Role Family' : selectedItem.type === 'preferences' ? 'Preference' : 'Logbook'}`
    : selectedItem.name;

  const modeOptions = selectedItem.type === 'logbooks'
    ? ['history', 'pdf', 'add']
    : selectedItem.type === 'roleFamilies'
    ? (selectedItem.mode === 'add' ? ['add'] : ['view', 'add'])
    : ['view', 'edit', 'add'];

  return (
    <div className="flex flex-col gap-4 h-full">
      <CardHeader
        title={titleText}
        lightMode={true}
        borderRadius="1.5rem"
        titleStyle={{ color: '#2C2C2C' }}
        leftContent={
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsla(0, 84%, 55%, 0.95)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'hsla(0, 84%, 60%, 0.85)'; }}
                >
                  {selectedItem.mode === 'add' ? 'Add' : selectedItem.mode === 'edit' ? 'Edit' : selectedItem.mode === 'pdf' ? 'PDF' : selectedItem.mode === 'history' ? 'History' : 'View'}
                </MenuButton>
              </div>
              <MenuItems
                anchor="bottom start"
                portal={false}
                transition
                className="w-32 origin-top-left shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                style={{ zIndex: 100, ...aiGlassLightBorderStyle('0.75rem'), marginTop: 8 }}
              >
                <div
                  className="py-1"
                  style={{
                    ...aiGlassLightContentStyle('0.75rem', 0.6),
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)',
                  }}
                >
                  {modeOptions.map((mode) => (
                    <MenuItem key={mode}>
                      <div className="flex items-center justify-between px-4 py-2">
                        <button
                          onClick={() => {
                            if (mode === 'add') {
                              if (selectedItem.type === 'logbooks') {
                                router.push(`/stores/${storeId}/logbook/create/shifts`);
                              } else {
                                const itemName = selectedItem.type === 'crew' ? 'Crew Member' :
                                  selectedItem.type === 'roles' ? 'Role' :
                                  selectedItem.type === 'roleFamilies' ? 'Role Family' :
                                  selectedItem.type === 'preferences' ? 'Preference' : 'Item';
                                setSelectedItem({ id: '', name: `New ${itemName}`, type: selectedItem.type, mode: 'add' });
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
              if (previousView) {
                setSelectedItem(previousView);
                setPreviousView(null);
              } else {
                const targetView = selectedItem.type === 'roleFamilies' ? 'roles'
                  : selectedItem.type === 'stores' || selectedItem.type === 'companies' ? 'home'
                  : selectedItem.type as ViewId;
                setActiveView(targetView as ViewId);
                setSelectedItem(null);
              }
            }}
            className="transition-colors duration-150"
            style={{ background: 'none', border: 'none', padding: '4px 8px', fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 400, color: '#6B6B6B', cursor: 'pointer' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#2C2C2C'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#6B6B6B'}
          >
            ×
          </button>
        }
      />

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
        <RoleRuleDetailView ruleId={Number(selectedItem.id)} constraintType="SOFT" />
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
  );
}
