import React from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import WorkerRegisterPage from "./pages/WorkerRegisterPage.jsx";
import WorkerRegisterLocation from "./pages/WorkerRegisterLocation.jsx";
import WorkerRegisterName from "./pages/WorkerRegisterName.jsx";
import WorkerRegisterDob from "./pages/WorkerRegisterDob.jsx";
import WorkerRegisterPhone from "./pages/WorkerRegisterPhone.jsx";
import ClientRegisterPage from "./pages/ClientRegisterPage.jsx";
import ClientRegisterName from "./pages/ClientRegisterName.jsx";
import ClientRegisterLocation from "./pages/ClientRegisterLocation.jsx";
import ClientRegisterPhone from "./pages/ClientRegisterPhone.jsx";
import ClientDashboardPage from "./pages/ClientDashboardPage.jsx";
import ProviderDashboardPage from "./pages/ProviderDashboardPage.jsx";
import ExplorePage from "./pages/ExplorePage.jsx";
import BookingsPage from "./pages/BookingsPage.jsx";
import ProviderBookingsPage from "./pages/ProviderBookingsPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import ProviderMessagesPage from "./pages/ProviderMessagesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import EditProfilePage from "./pages/EditProfilePage.jsx";
import ProviderProfilePage from "./pages/ProviderProfilePage.jsx";
import AboutUsPage from "./pages/AboutUsPage.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import CareersPage from "./pages/CareersPage.jsx";
import HelpCenterPage from "./pages/HelpCenterPage.jsx";
import BlogPage from "./pages/BlogPage.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import ContactUsPage from "./pages/ContactUsPage.jsx";
import VerificationPage from "./pages/VerificationPage.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import Footer from "./components/Footer.jsx";

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

function ProtectedRoute({ children, roles }) {
  const location = useLocation();
  const { isLoggedIn, role, user, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-600">Checking your session...</div>;
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

export default function App() {
  const location = useLocation();
  console.log("[App] rendering at:", location.pathname);
  const showFooter = !authRoutes.includes(location.pathname);
  return (
    <AuthProvider>
      <ErrorBoundary>
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<ProtectedRoute roles={["client"]}><ClientDashboardPage /></ProtectedRoute>} />
        <Route path="/provider-dashboard" element={<ProtectedRoute roles={["provider"]}><ProviderDashboardPage /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute roles={["client"]}><BookingsPage /></ProtectedRoute>} />
        <Route path="/provider-bookings" element={<ProtectedRoute roles={["provider"]}><ProviderBookingsPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute roles={["client"]}><MessagesPage /></ProtectedRoute>} />
        <Route path="/provider-messages" element={<ProtectedRoute roles={["provider"]}><ProviderMessagesPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute roles={["client"]}><ProfilePage /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute roles={["client"]}><EditProfilePage /></ProtectedRoute>} />
        <Route path="/provider-profile" element={<ProtectedRoute roles={["provider"]}><ProviderProfilePage /></ProtectedRoute>} />
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
      </ErrorBoundary>
      {showFooter && <Footer />}
    </AuthProvider>
  );
}
