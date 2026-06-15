import { Bot, Home, Settings, TrendingUp } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const baseNavItems = [
  { path: '/', icon: Home, label: '市场' },
  { path: '/portfolio', icon: TrendingUp, label: '组合' },
  { path: '/agents', icon: Bot, label: 'AI 代理' },
];

export default function BottomNav() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navItems =
    user?.role === 'admin'
      ? [...baseNavItems, { path: '/admin', icon: Settings, label: '管理' }]
      : baseNavItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === '/' && location.pathname.startsWith('/markets/'));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex min-w-16 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
