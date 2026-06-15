import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app-container">
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
              path="/market/:id"
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
    </QueryClientProvider>
  );
}

export default App;
