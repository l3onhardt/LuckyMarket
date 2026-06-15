import { useAuthStore } from '@/store/authStore';

export default function TopBar() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="sticky top-0 z-50 backdrop-blur-lg bg-dark-800/80 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Title */}
          <h1 className="text-2xl font-bold bg-gradient-to-r from-lucky-gold to-lucky-red bg-clip-text text-transparent">
            LuckyMarket
          </h1>

          {/* Right Side: Balance & Avatar */}
          <div className="flex items-center gap-4">
            {/* Balance */}
            <div className="text-right">
              <div className="text-xs text-gray-400">余额</div>
              <div className="text-lg font-semibold text-lucky-gold">
                ¥12,500
              </div>
            </div>

            {/* User Avatar */}
            {user && (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-lucky-gold to-lucky-red flex items-center justify-center text-white font-semibold">
                {(user.displayName || 'U').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
