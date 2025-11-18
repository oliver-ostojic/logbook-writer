import create from 'zustand';

export type WizardShift = { crewId: string; crewName?: string; start: string; end: string };

type WizardState = {
  date: string;
  storeId?: number;
  shifts: WizardShift[];
  setDate: (date: string) => void;
  setStoreId: (id?: number) => void;
  setShiftCount: (count: number) => void;
  addShift: (crewId: string, crewName?: string) => void;
  removeShift: (idx: number) => void;
  updateShift: (idx: number, patch: Partial<WizardShift>) => void;
  reset: () => void;
};

const today = () => new Date().toISOString().slice(0, 10);

export const useWizardStore = create<WizardState>((set) => ({
  date: today(),
  storeId: undefined,
  shifts: [],
  setDate: (date) => set({ date }),
  setStoreId: (id) => set({ storeId: id }),
  setShiftCount: (count) =>
    set((s) => {
      const next = [...s.shifts];
      if (count > next.length) {
        const toAdd = count - next.length;
        for (let i = 0; i < toAdd; i++) {
          next.push({ crewId: '', start: '09:00', end: '17:00' });
        }
      } else if (count < next.length) {
        next.length = count;
      }
      return { shifts: next };
    }),
  addShift: (crewId, crewName) =>
    set((s) => ({ shifts: [...s.shifts, { crewId, crewName, start: '09:00', end: '17:00' }] })),
  removeShift: (idx) =>
    set((s) => ({ shifts: s.shifts.filter((_, i) => i !== idx) })),
  updateShift: (idx, patch) =>
    set((s) => ({ shifts: s.shifts.map((sh, i) => (i === idx ? { ...sh, ...patch } : sh)) })),
  reset: () => set({ date: today(), storeId: undefined, shifts: [] }),
}));
