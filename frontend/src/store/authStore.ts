import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account } from '@/types';

interface AuthState {
  currentAccount: Account | null;
  setCurrentAccount: (account: Account) => void;
  clearCurrentAccount: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentAccount: null,

      setCurrentAccount: (account) => {
        set({ currentAccount: account });
      },

      clearCurrentAccount: () => {
        set({ currentAccount: null });
      },

      isAuthenticated: () => {
        return get().currentAccount !== null;
      },
    }),
    {
      name: 'luckymarket-auth',
    }
  )
);
