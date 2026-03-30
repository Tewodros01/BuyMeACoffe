import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '../../components/ui/Layout'
import { APP_ROUTES, AUTHED_ROUTES } from '../../config/routes'
import AdminWithdrawalsPage from '../../features/admin/AdminWithdrawalsPage'
import AuthPage from '../../features/auth/AuthPage'
import HomePage from '../../features/creator/HomePage'
import OnboardingPage from '../../features/creator/OnboardingPage'
import PublicCreatorPage from '../../features/creator/PublicCreatorPage'
import NotificationsPage from '../../features/notifications/NotificationsPage'
import SettingsPage from '../../features/settings/SettingsPage'
import PaymentSuccessPage from '../../features/support/PaymentSuccessPage'
import WalletPage from '../../features/wallet/WalletPage'
import { AdminGuard, AuthGuard, OnboardingGuard } from './guards'

function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const showNav =
    AUTHED_ROUTES.includes(location.pathname as (typeof AUTHED_ROUTES)[number]) &&
    location.pathname !== APP_ROUTES.onboarding

  return <AppLayout showNav={showNav}>{children}</AppLayout>
}

export default function AppRouter() {
  return (
    <AppShell>
      <Routes>
        <Route path={APP_ROUTES.auth} element={<AuthPage />} />
        <Route path={APP_ROUTES.publicCreator} element={<PublicCreatorPage />} />
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
    </AppShell>
  )
}
