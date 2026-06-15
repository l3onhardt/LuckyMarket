import { Home, TrendingUp, Bot, Settings } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useLocation, Link } from 'react-router-dom';

export function BottomNav() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: Home, label: '首页' },
    { path: '/portfolio', icon: TrendingUp, label: '投资组合' },
    { path: '/agents', icon: Bot, label: 'AI代理' },
  ];

  // Add admin item if user is admin
  if (user?.role === 'admin') {
    navItems.push({ path: '/admin', icon: Settings, label: '管理' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 fluid-glass-card border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-lucky-gold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
