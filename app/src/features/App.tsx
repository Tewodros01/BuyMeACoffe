import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "../components/ui/Layout";
import { Spinner } from "../components/ui";
import { APP_ROUTES, AUTHED_ROUTES } from "../config/routes";
import { authApi } from "./auth/authApi";
import { useAuthStore } from "../store/authStore";
import AuthPage from "./auth/AuthPage";
import HomePage from "./creator/HomePage";
import OnboardingPage from "./creator/OnboardingPage";
import PublicCreatorPage from "./creator/PublicCreatorPage";
import NotificationsPage from "./notifications/NotificationsPage";
import AdminWithdrawalsPage from "./admin/AdminWithdrawalsPage";
import SettingsPage from "./settings/SettingsPage";
import PaymentSuccessPage from "./support/PaymentSuccessPage";
import WalletPage from "./wallet/WalletPage";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={APP_ROUTES.auth} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (user && !user.onboardingDone) {
    return <Navigate to={APP_ROUTES.onboarding} replace />;
  }

  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (user?.role !== 'ADMIN') {
    return <Navigate to={APP_ROUTES.home} replace />;
  }

  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const showNav =
    AUTHED_ROUTES.some((route) => route === location.pathname) &&
    location.pathname !== APP_ROUTES.onboarding;

  return <AppLayout showNav={showNav}>{children}</AppLayout>;
}

const App = () => {
  const authReady = useAuthStore((state) => state.authReady);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    if (authReady) return;

    authApi
      .getProfile()
      .then((user) => setSession(user))
      .catch(() => setSession(null));
  }, [authReady, setSession]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070f]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path={APP_ROUTES.auth} element={<AuthPage />} />
        <Route
          path={APP_ROUTES.publicCreator}
          element={<PublicCreatorPage />}
        />
        <Route
          path={APP_ROUTES.paymentSuccess}
          element={<PaymentSuccessPage />}
        />

        <Route
          path={APP_ROUTES.onboarding}
          element={
            <AuthGuard>
              <OnboardingPage />
            </AuthGuard>
          }
        />

        <Route
          path={APP_ROUTES.home}
          element={
            <AuthGuard>
              <OnboardingGuard>
                <HomePage />
              </OnboardingGuard>
            </AuthGuard>
          }
        />
        <Route
          path={APP_ROUTES.wallet}
          element={
            <AuthGuard>
              <OnboardingGuard>
                <WalletPage />
              </OnboardingGuard>
            </AuthGuard>
          }
        />
        <Route
          path={APP_ROUTES.notifications}
          element={
            <AuthGuard>
              <OnboardingGuard>
                <NotificationsPage />
              </OnboardingGuard>
            </AuthGuard>
          }
        />
        <Route
          path={APP_ROUTES.adminWithdrawals}
          element={
            <AuthGuard>
              <AdminGuard>
                <AdminWithdrawalsPage />
              </AdminGuard>
            </AuthGuard>
          }
        />
        <Route
          path={APP_ROUTES.settings}
          element={
            <AuthGuard>
              <OnboardingGuard>
                <SettingsPage />
              </OnboardingGuard>
            </AuthGuard>
          }
        />

        <Route path="*" element={<Navigate to={APP_ROUTES.auth} replace />} />
      </Routes>
    </Layout>
  );
};

export default App;
