import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center text-center">
        <div>
          <h1 className="mb-4 text-4xl font-bold text-red-400">403</h1>
          <p className="text-gray-300">当前账号没有管理员权限</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
