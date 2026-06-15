import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import TopBar from './components/layout/TopBar';
import BottomNav from './components/layout/BottomNav';
import ProtectedRoute from './components/layout/ProtectedRoute';
import ToastContainer from './components/ui/ToastContainer';
import Home from './pages/Home';
import MarketDetail from './pages/MarketDetail';
import Portfolio from './pages/Portfolio';
import Agents from './pages/Agents';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Register from './pages/Register';
import { useAdminAccount } from './hooks/useAdminAccount';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function AppRoutes() {
  const adminQuery = useAdminAccount();

  return (
    <BrowserRouter>
      <div className="app-container">
        {adminQuery.isError && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
            后端暂时不可用，请确认 http://localhost:4000 已启动。
          </div>
        )}
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <>
                  <TopBar />
                  <main className="main-content">
                    <Home />
                  </main>
                  <BottomNav />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/markets/:id"
            element={
              <ProtectedRoute>
                <>
                  <TopBar />
                  <main className="main-content">
                    <MarketDetail />
                  </main>
                  <BottomNav />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ProtectedRoute>
                <>
                  <TopBar />
                  <main className="main-content">
                    <Portfolio />
                  </main>
                  <BottomNav />
                </>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents"
            element={
              <ProtectedRoute>
                <>
                  <TopBar />
                  <main className="main-content">
                    <Agents />
                  </main>
                  <BottomNav />
                </>
              </ProtectedRoute>
            }
          />

          {/* Admin route */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <>
                  <TopBar />
                  <main className="main-content">
                    <Admin />
                  </main>
                  <BottomNav />
                </>
              </ProtectedRoute>
            }
          />

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <ToastContainer />
      </div>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <AppRoutes />
      </MotionConfig>
    </QueryClientProvider>
  );
}

export default App;
