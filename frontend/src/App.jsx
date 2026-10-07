import React, { lazy, Suspense } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { BookingProvider } from "./context/BookingContext.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import Footer from "./components/Footer.jsx";
import CommunityImpactBanner from "./components/CommunityImpactBanner.jsx";
import { SkeletonBlock } from "./components/Skeletons.jsx";

const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage.jsx"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage.jsx"));
const RegisterPage = lazy(() => import("./pages/RegisterPage.jsx"));
const WorkerRegisterPage = lazy(() => import("./pages/WorkerRegisterPage.jsx"));
const WorkerRegisterLocation = lazy(() => import("./pages/WorkerRegisterLocation.jsx"));
const WorkerRegisterName = lazy(() => import("./pages/WorkerRegisterName.jsx"));
const WorkerRegisterDob = lazy(() => import("./pages/WorkerRegisterDob.jsx"));
const WorkerRegisterPhone = lazy(() => import("./pages/WorkerRegisterPhone.jsx"));
const ClientRegisterPage = lazy(() => import("./pages/ClientRegisterPage.jsx"));
const ClientRegisterName = lazy(() => import("./pages/ClientRegisterName.jsx"));
const ClientRegisterLocation = lazy(() => import("./pages/ClientRegisterLocation.jsx"));
const ClientRegisterPhone = lazy(() => import("./pages/ClientRegisterPhone.jsx"));
const ClientDashboardPage = lazy(() => import("./pages/ClientDashboardPage.jsx"));
const ProviderDashboardPage = lazy(() => import("./pages/ProviderDashboardPage.jsx"));
const ExplorePage = lazy(() => import("./pages/ExplorePage.jsx"));
const BookingsPage = lazy(() => import("./pages/BookingsPage.jsx"));
const ProviderBookingsPage = lazy(() => import("./pages/ProviderBookingsPage.jsx"));
const MessagesPage = lazy(() => import("./pages/MessagesPage.jsx"));
const ProviderMessagesPage = lazy(() => import("./pages/ProviderMessagesPage.jsx"));
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const EditProfilePage = lazy(() => import("./pages/EditProfilePage.jsx"));
const ProviderProfilePage = lazy(() => import("./pages/ProviderProfilePage.jsx"));
const AboutUsPage = lazy(() => import("./pages/AboutUsPage.jsx"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage.jsx"));
const CareersPage = lazy(() => import("./pages/CareersPage.jsx"));
const HelpCenterPage = lazy(() => import("./pages/HelpCenterPage.jsx"));
const BlogPage = lazy(() => import("./pages/BlogPage.jsx"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage.jsx"));
const ContactUsPage = lazy(() => import("./pages/ContactUsPage.jsx"));
const VerificationPage = lazy(() => import("./pages/VerificationPage.jsx"));
const TesdaCertificatePage = lazy(() => import("./pages/TesdaCertificatePage.jsx"));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
          <h1>Something went wrong</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error?.message || "Unknown error"}
            {"\n\n"}
            {this.state.error?.stack || ""}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "10px 20px", marginTop: "10px" }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const authRoutes = ["/login", "/forgot-password", "/verify-email", "/register", "/worker-register", "/worker-register/name", "/worker-register/location", "/worker-register/dob", "/worker-register/phone", "/client-register", "/client-register/name", "/client-register/location", "/client-register/phone", "/admin"];
const footerlessRoutes = ["/messages", "/client/messages", "/provider-messages", "/provider/messages"];

function ProtectedRoute({ children, roles }) {
  const location = useLocation();
  const { isLoggedIn, role, user, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="dashboard-page">
        <div role="status" aria-label="Checking your session" aria-busy="true" className="dashboard-shell flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <span className="sr-only">Checking your session…</span>
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-3 w-60 max-w-full" />
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user?.emailVerified === false || user?.registrationComplete === false) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(role)) {
    const home = role === "provider" ? "/provider-dashboard" : role === "admin" ? "/admin" : "/dashboard";
    return <Navigate to={home} replace />;
  }

  return children;
}

function LandingRoute() {
  const { isLoggedIn, role, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="dashboard-page">
        <div role="status" aria-label="Checking your session" aria-busy="true" className="dashboard-shell flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <span className="sr-only">Checking your session…</span>
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <SkeletonBlock className="h-4 w-44" />
        </div>
      </div>
    );
  }

  if (isLoggedIn) {
    const home = role === "provider" ? "/provider-dashboard" : role === "admin" ? "/admin" : "/dashboard";
    return <Navigate to={home} replace />;
  }

  return <LandingPage />;
}

function RouteLoadingFallback() {
  return (
    <div className="dashboard-page">
      <div role="status" aria-label="Loading page" aria-busy="true" className="dashboard-shell flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <span className="sr-only">Loading page…</span>
        <SkeletonBlock className="h-12 w-12 rounded-full" />
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-3 w-60 max-w-full" />
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  console.log("[App] rendering at:", location.pathname);
  const showFooter = !authRoutes.includes(location.pathname) && !footerlessRoutes.includes(location.pathname);
  return (
    <AuthProvider>
      <BookingProvider>
        <ErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/worker-register" element={<WorkerRegisterPage />} />
        <Route path="/worker-register/name" element={<WorkerRegisterName />} />
        <Route path="/worker-register/location" element={<WorkerRegisterLocation />} />
        <Route path="/worker-register/dob" element={<WorkerRegisterDob />} />
        <Route path="/worker-register/phone" element={<WorkerRegisterPhone />} />
        <Route path="/client-register" element={<ClientRegisterPage />} />
        <Route path="/client-register/name" element={<ClientRegisterName />} />
        <Route path="/client-register/location" element={<ClientRegisterLocation />} />
        <Route path="/client-register/phone" element={<ClientRegisterPhone />} />
        <Route path="/" element={<LandingRoute />} />
        <Route path="/dashboard" element={<ProtectedRoute roles={["client"]}><ClientDashboardPage /></ProtectedRoute>} />
        <Route path="/provider-dashboard" element={<ProtectedRoute roles={["provider"]}><ProviderDashboardPage /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute roles={["client"]}><BookingsPage /></ProtectedRoute>} />
        <Route path="/provider-bookings" element={<ProtectedRoute roles={["provider"]}><ProviderBookingsPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute roles={["client"]}><MessagesPage /></ProtectedRoute>} />
        <Route path="/client/messages" element={<ProtectedRoute roles={["client"]}><MessagesPage /></ProtectedRoute>} />
        <Route path="/provider-messages" element={<ProtectedRoute roles={["provider"]}><ProviderMessagesPage /></ProtectedRoute>} />
        <Route path="/provider/messages" element={<ProtectedRoute roles={["provider"]}><ProviderMessagesPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute roles={["client"]}><ProfilePage /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute roles={["client", "provider"]}><EditProfilePage /></ProtectedRoute>} />
        <Route path="/provider-profile" element={<ProtectedRoute roles={["provider"]}><ProviderProfilePage /></ProtectedRoute>} />
        <Route path="/provider-profile/verify" element={<ProtectedRoute roles={["provider"]}><VerificationPage /></ProtectedRoute>} />
        <Route path="/provider-profile/tesda" element={<ProtectedRoute roles={["provider"]}><TesdaCertificatePage /></ProtectedRoute>} />
        <Route path="/profile/tesda" element={<ProtectedRoute roles={["client", "provider"]}><TesdaCertificatePage /></ProtectedRoute>} />
        <Route path="/explore" element={<ProtectedRoute roles={["client", "provider"]}><ExplorePage /></ProtectedRoute>} />
          <Route path="/about" element={<AboutUsPage />} />
          <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/careers" element={<CareersPage />} />
        <Route path="/help-center" element={<HelpCenterPage />} />
        <Route path="/contact" element={<ContactUsPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/profile/verify" element={<ProtectedRoute roles={["client", "provider"]}><VerificationPage /></ProtectedRoute>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        {showFooter && <>
          <CommunityImpactBanner />
          <Footer />
        </>}
      </BookingProvider>
    </AuthProvider>
  );
}
