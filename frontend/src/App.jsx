import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { fetchPublicSettings, fetchTechnologies } from './utils/studyData';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const HomePage = lazy(() => import('./pages/HomePage'));

const Forum = lazy(() => import('./pages/Forum'));
const Profile = lazy(() => import('./pages/Profile'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const About = lazy(() => import('./pages/About'));
const Support = lazy(() => import('./pages/Support'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
import { isStaffUser } from './utils/auth';
import { useAuth } from './context/AuthProvider';
import { RequireAuth, RequireRole } from './components/RequireRole';
import AdminLayout from './layouts/AdminLayout';
import AppLoadingScreen from './components/AppLoadingScreen';
import CookieConsent from './components/CookieConsent';
import { initCookieConsent } from './utils/cookieConsent';
import { BRAND_PLATFORM } from './utils/brand';

const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminModules = lazy(() => import('./pages/AdminModules'));
const AdminSupport = lazy(() => import('./pages/AdminSupport'));
const AdminAudit = lazy(() => import('./pages/AdminAudit'));
const AdminStats = lazy(() => import('./pages/AdminStats'));


// ===== ЗАЩИТА ДЛЯ ПОЛЬЗОВАТЕЛЬСКИХ МАРШРУТОВ =====
const ProtectedRoute = ({ children }) => <RequireAuth>{children}</RequireAuth>;

const AdminRouteFallback = () => <AppLoadingScreen alt="Загрузка админки" />;

const RouteFallback = () => <AppLoadingScreen />;

// ===== ЗАЩИТА ДЛЯ ПУБЛИЧНЫХ СТРАНИЦ (если пользователь уже авторизован) =====
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" />;
  }
  return children;
};

const RegistrationRoute = ({ children }) => {
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    fetchPublicSettings()
      .then((data) => setAllowed(data.registrationEnabled !== false))
      .catch(() => setAllowed(true));
  }, []);

  if (allowed === null) {
    return null;
  }

  if (!allowed) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function MaintenanceScreen() {
  return (
    <div className="maintenance-screen" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1>Техническое обслуживание</h1>
        <p>Сайт временно недоступен. Попробуйте зайти позже.</p>
        <Link to="/admin/login">Вход для администратора</Link>
      </div>
    </div>
  );
}

// ===== ГЛАВНЫЙ КОМПОНЕНТ APP =====
function App() {
  const [settings, setSettings] = useState({
    siteName: BRAND_PLATFORM,
    siteDescription: 'Образовательный проект по РПО',
    logoUrl: '/logo.png',
    primaryColor: '#7c3aed',
    registrationEnabled: true,
    maintenanceMode: false,
    enableComments: true,
    enableProgressTracking: true,
    emailNotifications: true,
    newTopicsNotifications: true,
    newUsersNotifications: true,
    systemNotifications: true
  });

  const [categories, setCategories] = useState([]);

  useEffect(() => {
    initCookieConsent();
  }, []);

  useEffect(() => {
    fetchPublicSettings()
      .then((data) => {
        if (data) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      })
      .catch((error) => {
        console.error('Ошибка загрузки публичных настроек:', error);
      });
  }, []);

  const { user, showToast } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.forbidden) {
      showToast('Недостаточно прав', 'error');
    }
  }, [location.state, showToast]);

  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return;

    fetchTechnologies()
      .then((data) => {
        if (data?.length > 0) {
          setCategories(data);
        }
      })
      .catch((error) => {
        console.error('Ошибка загрузки категорий для админки:', error);
      });
  }, [location.pathname]);

  useEffect(() => {
    const primaryColor = settings?.primaryColor || '#7c3aed';
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    document.documentElement.style.setProperty('--primary-color-rgb', hexToRgb(primaryColor));
  }, [settings?.primaryColor]);

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '124, 58, 237';
  };

  const pathname = window.location.pathname;
  const adminPath = pathname.startsWith('/admin') || pathname === '/admin-login';
  if (settings.maintenanceMode && !adminPath && !isStaffUser(user)) {
    return <MaintenanceScreen />;
  }

  return (
    <div className="app">
      <Routes>
        {/* 🔒 ЗАЩИЩЁННЫЕ МАРШРУТЫ (только для авторизованных) */}
        <Route path="/" element={
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <HomePage settings={settings} />
            </Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/forum" element={
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <Forum />
            </Suspense>
          </ProtectedRoute>
        } />
        
        <Route path="/profile/:userId?" element={
          <ProtectedRoute>
            <Suspense fallback={<RouteFallback />}>
              <Profile />
            </Suspense>
          </ProtectedRoute>
        } />

        {/* 🔓 ПУБЛИЧНЫЕ МАРШРУТЫ (доступны без авторизации) */}
        <Route path="/login" element={
          <PublicRoute>
            <Suspense fallback={<RouteFallback />}><Login /></Suspense>
          </PublicRoute>
        } />
        <Route path="/register" element={
          <RegistrationRoute>
            <Suspense fallback={<RouteFallback />}><Register /></Suspense>
          </RegistrationRoute>
        } />
        <Route path="/auth/oauth" element={
          <Suspense fallback={<RouteFallback />}>
            <OAuthCallback />
          </Suspense>
        } />
        <Route path="/privacy" element={<Suspense fallback={<RouteFallback />}><Privacy /></Suspense>} />
        <Route path="/support" element={<Suspense fallback={<RouteFallback />}><Support /></Suspense>} />
        <Route path="/terms" element={<Suspense fallback={<RouteFallback />}><Terms /></Suspense>} />
        <Route path="/about" element={<Suspense fallback={<RouteFallback />}><About /></Suspense>} />

        {/* 🔐 АДМИН-МАРШРУТЫ */}
        <Route path="/admin/login" element={<Suspense fallback={<RouteFallback />}><AdminLogin /></Suspense>} />
        <Route path="/admin-login" element={<Suspense fallback={<RouteFallback />}><AdminLogin /></Suspense>} />
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminPanel categories={categories} setCategories={setCategories} settings={settings} />
              </Suspense>
            }
          />
          <Route
            path="users"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminUsers settings={settings} />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminSettings settings={settings} setSettings={setSettings} />
              </Suspense>
            }
          />
          <Route
            path="modules"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminModules />
              </Suspense>
            }
          />
          <Route
            path="support"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminSupport />
              </Suspense>
            }
          />
          <Route
            path="audit"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminAudit />
              </Suspense>
            }
          />
          <Route
            path="stats"
            element={
              <Suspense fallback={<AdminRouteFallback />}>
                <AdminStats />
              </Suspense>
            }
          />
        </Route>

        {/* 👇 НОВЫЕ МАРШРУТЫ ВНУТРИ <Routes>! */}
        <Route path="/forgot-password" element={<Suspense fallback={<RouteFallback />}><ForgotPassword /></Suspense>} />
        <Route path="/reset-password" element={<Suspense fallback={<RouteFallback />}><ResetPassword /></Suspense>} />

        {/* ДОПОЛНИТЕЛЬНЫЕ СТРАНИЦЫ */}
        <Route path="/topic/:language/:topic" element={
          <ProtectedRoute>
            <div className="topic-page">
              <button className="btn-back" onClick={() => window.history.back()}>← Назад</button>
              <h1>Страница темы</h1>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
      <CookieConsent />
    </div>
  );
}

export default App;