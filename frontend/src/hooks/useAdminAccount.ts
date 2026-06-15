import { useQuery } from '@tanstack/react-query';
import { getAccountByHandle, seedDemoData } from '@/lib/api-client';
import { useAuthStore } from '@/store/authStore';

export function useAdminAccount() {
  const setCurrentAccount = useAuthStore((state) => state.setCurrentAccount);

  return useQuery({
    queryKey: ['default-admin-account'],
    queryFn: async () => {
      await seedDemoData();
      const admin = await getAccountByHandle('admin');
      setCurrentAccount(admin);
      return admin;
    },
    retry: 1,
    staleTime: 60_000,
  });
}
