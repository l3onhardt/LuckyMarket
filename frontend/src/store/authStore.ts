import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account } from '@/types';

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
      currentAccount: null,
      user: null,
      isAuthenticated: false,

      setCurrentAccount: (account) => {
        set({
          currentAccount: account,
          user: account,
          isAuthenticated: true
        });
      },

      clearCurrentAccount: () => {
        set({
          currentAccount: null,
          user: null,
          isAuthenticated: false
        });
      },
    }),
    {
      name: 'luckymarket-auth',
    }
  )
);
