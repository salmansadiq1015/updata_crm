import { useAuthStore } from '@/stores/auth-store';

export function useAuth() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  return { user, isAuthenticated, isLoading };
}
