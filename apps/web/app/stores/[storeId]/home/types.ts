export const VIEW_OPTIONS = [
  { id: 'home', name: 'Home', title: 'Overview' },
  { id: 'crew', name: 'Crew', title: 'List View' },
  { id: 'roles', name: 'Roles', title: 'List View' },
  { id: 'preferences', name: 'Preferences', title: 'List View' },
  { id: 'logbooks', name: 'Logbooks', title: 'List View' },
] as const;

export type ViewId = typeof VIEW_OPTIONS[number]['id'];

export type EditableItem = {
  id: string;
  name: string;
  type: 'crew' | 'roles' | 'roleFamilies' | 'logbooks' | 'preferences' | 'runs' | 'companies' | 'stores';
};

export type SelectedItem = EditableItem & {
  mode: 'view' | 'edit' | 'add' | 'pdf' | 'history' | 'runInfo' | 'runsOnly';
  fromLogbookId?: string;
  fromLogbookName?: string;
  fromMode?: 'history' | 'runsOnly';
  dateKey?: string;
};
