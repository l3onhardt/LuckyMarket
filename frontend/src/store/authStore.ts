import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account } from '@/types';

export const DEFAULT_ADMIN_ACCOUNT: Account = {
  id: 'admin',
  kind: 'human',
  handle: 'admin',
  displayName: 'Admin',
  status: 'active',
  role: 'admin',
  createdAt: new Date(0).toISOString(),
  lastActiveAt: null,
};

interface AuthState {
  currentAccount: Account | null;
  user: Account | null; // Alias for compatibility
  isAuthenticated: boolean;
  setCurrentAccount: (account: Account) => void;
  clearCurrentAccount: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentAccount: DEFAULT_ADMIN_ACCOUNT,
      user: DEFAULT_ADMIN_ACCOUNT,
      isAuthenticated: true,

      setCurrentAccount: (account) => {
        set({
          currentAccount: account,
          user: account,
          isAuthenticated: true
        });
      },

      clearCurrentAccount: () => {
        set({
          currentAccount: DEFAULT_ADMIN_ACCOUNT,
          user: DEFAULT_ADMIN_ACCOUNT,
          isAuthenticated: true
        });
      },
    }),
    {
      name: 'luckymarket-auth',
    }
  )
);
