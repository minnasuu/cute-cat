import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import DashboardHistoryPage from './pages/DashboardPage/HistoryPage';
import DashboardUsagePage from './pages/DashboardPage/UsagePage';
import TeamDetailPage from './pages/TeamDetailPage';
import CatEditorPage from './pages/TeamDetailPage/CatEditorPage';
import WorkflowEditorPage from './pages/TeamDetailPage/WorkflowEditorPage';
import CommunityPage from './pages/CommunityPage';
import { ToastProvider } from './components/Toast';
import './styles/index.css';
import { VibeStyleLib } from './pages/VibeStyleLib';

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

// Admin-only route: only specified emails can access
const ADMIN_ROUTE_EMAILS = ['minhansu508@gmail.com'];
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROUTE_EMAILS.includes(user.email)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ToastProvider>
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Landing - only for guests */}
            <Route path="/" element={<LandingRoute />} />
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/vibe-style-lib" element={<AdminRoute><VibeStyleLib /></AdminRoute>} />

            {/* Dashboard - requires login */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/dashboard/history" element={<ProtectedRoute><DashboardHistoryPage /></ProtectedRoute>} />
            <Route path="/dashboard/usage" element={<ProtectedRoute><DashboardUsagePage /></ProtectedRoute>} />
            <Route path="/teams/:teamId" element={<ProtectedRoute><TeamDetailPage /></ProtectedRoute>} />
            <Route path="/teams/:teamId/cats/new" element={<ProtectedRoute><CatEditorPage /></ProtectedRoute>} />
            <Route path="/teams/:teamId/cats/:catId" element={<ProtectedRoute><CatEditorPage /></ProtectedRoute>} />
            <Route path="/teams/:teamId/workflows/new" element={<ProtectedRoute><WorkflowEditorPage /></ProtectedRoute>} />
            <Route path="/teams/:teamId/workflows/:workflowId" element={<ProtectedRoute><WorkflowEditorPage /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
    </ToastProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
