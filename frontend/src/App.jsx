import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import ServerWakeNotice from './components/layout/ServerWakeNotice';
import ProtectedRoute from './components/ProtectedRoute';
import { PageLoader } from './components/ui';

const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const StaffLogin = lazy(() => import('./pages/auth/StaffLogin'));
const Profile = lazy(() => import('./pages/Profile'));
const ReportPage = lazy(() => import('./pages/reports/ReportPage'));
const MyReports = lazy(() => import('./pages/reports/MyReports'));
const FoodHub = lazy(() => import('./pages/food/FoodHub'));
const FoodNew = lazy(() => import('./pages/food/FoodNew'));
const FoodDetail = lazy(() => import('./pages/food/FoodDetail'));
const FoodDashboard = lazy(() => import('./pages/food/FoodDashboard'));
const GarbageTrucks = lazy(() => import('./pages/GarbageTrucks'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const StaffDashboard = lazy(() => import('./pages/staff/StaffDashboard'));
const StaffReportDetail = lazy(() => import('./pages/staff/StaffReportDetail'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const AccountStatus = lazy(() => import('./pages/AccountStatus'));
const NotFound = lazy(() => import('./pages/NotFound'));

const FULL_BLEED = ['/live-map', '/chatbot'];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const fullBleed = FULL_BLEED.includes(pathname);
  const auth = (el, roles) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;
  const donors = ['restaurant', 'citizen'];
  const staff = ['staff', 'admin'];
  // Restaurants and NGOs waiting for approval (or rejected / suspended accounts) can only
  // see their status and edit their details until an admin lets them in.
  const restricted = user && user.status && user.status !== 'active';

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1 pt-16">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageLoader />}>
            {restricted ? (
              <Routes>
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<AccountStatus />} />
              </Routes>
            ) : (
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/MainPage" element={<Navigate to="/" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/staff-login" element={<StaffLogin />} />
                <Route path="/admin/login" element={<StaffLogin />} />

                <Route path="/profile" element={auth(<Profile />)} />
                <Route path="/report-waste" element={auth(<ReportPage />)} />
                <Route path="/my-reports" element={auth(<MyReports />)} />

                <Route path="/food" element={<FoodHub />} />
                <Route path="/food/new" element={auth(<FoodNew />, donors)} />
                <Route path="/report-food" element={auth(<FoodNew />, donors)} />
                <Route path="/food/dashboard" element={auth(<FoodDashboard />)} />
                <Route path="/food/:id" element={<FoodDetail />} />

                <Route path="/live-map" element={auth(<GarbageTrucks />)} />
                <Route path="/chatbot" element={auth(<ChatPage />)} />

                <Route path="/staff/dashboard" element={auth(<StaffDashboard />, staff)} />
                <Route path="/staff/report/:id" element={auth(<StaffReportDetail />, staff)} />
                <Route path="/admin" element={auth(<AdminPanel />, ['admin'])} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            )}
          </Suspense>
        </ErrorBoundary>
      </main>
      {!fullBleed && <Footer />}
      <ServerWakeNotice />
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <BrowserRouter>
          <Shell />
          <ToastContainer position="bottom-right" theme="dark" autoClose={3500} newestOnTop pauseOnFocusLoss={false} />
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}
