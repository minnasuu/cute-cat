import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/index.css';

// 首屏关键路径(Landing / Auth)保持同步,其余按路由懒加载以减小主包
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DashboardHistoryPage = lazy(() => import('./pages/DashboardPage/HistoryPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const VibeAssets = lazy(() => import('./pages/VibeAssets').then((m) => ({ default: m.VibeAssets })));
const LaisseAncieApp = lazy(() =>
  import('./pages/LaisseAncie').then((m) => {
    const Comp = (m as { LaisseAncieApp: React.ComponentType }).LaisseAncieApp;
    return { default: Comp };
  }),
);
const AdminWorkflowsPage = lazy(() => import('./pages/AdminWorkflowsPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center text-text-tertiary">加载中...</div>
);

// Route guard: redirect to login if not authenticated
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Redirect authenticated users away from auth pages
const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// Landing page: show only to guests, redirect logged-in users to dashboard
const LandingRoute: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
};

// Admin-only route: 仅 role==='admin' 可访问(后端 me 接口返回 role)
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
    <ToastProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
              {/* Landing - only for guests */}
              <Route path="/" element={<LandingRoute />} />
              <Route
                path="/login"
                element={
                  <GuestRoute>
                    <LoginPage />
                  </GuestRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <GuestRoute>
                    <RegisterPage />
                  </GuestRoute>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <GuestRoute>
                    <ForgotPasswordPage />
                  </GuestRoute>
                }
              />
              <Route path="/community" element={<CommunityPage />} />
              <Route
                path="/vibe-assets"
                element={
                  <ProtectedRoute>
                    <VibeAssets />
                  </ProtectedRoute>
                }
              />
              <Route path="/vibe-style-lib" element={<Navigate to="/vibe-assets" replace />} />
              <Route
                path="/admin/workflows"
                element={
                  <AdminRoute>
                    <AdminWorkflowsPage />
                  </AdminRoute>
                }
              />

              {/* Laisse Ancie — 已合并到通用团队工作台,重定向到 /dashboard */}
              <Route
                path="/laisse-ancie/*"
                element={
                  <ProtectedRoute>
                    <LaisseAncieApp />
                  </ProtectedRoute>
                }
              />

              {/* Account - requires login */}
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <AccountPage />
                  </ProtectedRoute>
                }
              />

              {/* Dashboard - requires login */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/history"
                element={
                  <ProtectedRoute>
                    <DashboardHistoryPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ToastProvider>
    </ThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
