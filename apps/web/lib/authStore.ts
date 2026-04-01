import create from 'zustand';

export type UserRole = 'CREW' | 'MATE' | 'CAPTAIN' | 'ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  storeId: number | null;
  crewId: string | null;
  crew?: { id: string; name: string } | null;
  store?: { id: number; name: string } | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;

  // Permission helpers
  canAccessStore: (storeId: number) => boolean;
  canEditSchedule: () => boolean;
  canManageCrew: () => boolean;
  canManageUsers: () => boolean;
  canViewStoresList: () => boolean;
  canViewCompaniesList: () => boolean;
  canAccessSettings: () => boolean;
  isAdmin: () => boolean;

  // Navigation helpers
  getNavLinks: (storeId: number | string) => { label: string; href: string }[];
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    }),

  setToken: (token) => set({ token }),

  setLoading: (loading) => set({ isLoading: loading }),

  logout: () =>
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    }),

  // Permission helpers
  canAccessStore: (storeId: number) => {
    const { user } = get();
    if (!user) return false;
    // ADMIN can access all stores
    if (user.role === 'ADMIN') return true;
    // Others can only access their assigned store
    return user.storeId === storeId;
  },

  canEditSchedule: () => {
    const { user } = get();
    if (!user) return false;
    return ['MATE', 'CAPTAIN', 'ADMIN'].includes(user.role);
  },

  canManageCrew: () => {
    const { user } = get();
    if (!user) return false;
    return ['MATE', 'CAPTAIN', 'ADMIN'].includes(user.role);
  },

  canManageUsers: () => {
    const { user } = get();
    if (!user) return false;
    return ['CAPTAIN', 'ADMIN'].includes(user.role);
  },

  canViewStoresList: () => {
    const { user } = get();
    if (!user) return false;
    return user.role === 'ADMIN';
  },

  canViewCompaniesList: () => {
    const { user } = get();
    if (!user) return false;
    return user.role === 'ADMIN';
  },

  canAccessSettings: () => {
    const { user } = get();
    if (!user) return false;
    return ['CAPTAIN', 'ADMIN'].includes(user.role);
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role === 'ADMIN';
  },

  // Navigation helpers - returns appropriate nav links based on user role
  getNavLinks: (storeId: number | string) => {
    const { user } = get();
    if (!user) return [];

    const links: { label: string; href: string }[] = [];

    // CREW can only see their own crew page
    if (user.role === 'CREW') {
      if (user.crewId) {
        links.push({ label: 'My Profile', href: `/stores/${storeId}/crew/${user.crewId}` });
      }
      return links;
    }

    // MATE, CAPTAIN, ADMIN can see Home and Dashboard
    links.push({ label: 'Home', href: `/stores/${storeId}/home` });
    links.push({ label: 'Dashboard', href: `/stores/${storeId}/fairness-dashboard` });

    // MATE, CAPTAIN, ADMIN can view Settings (but only CAPTAIN/ADMIN can edit)
    links.push({ label: 'Settings', href: `/stores/${storeId}/settings` });

    return links;
  },
}));
