import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/ui/Layout'
import AuthPage from './features/auth/AuthPage'
import HomePage from './features/creator/HomePage'
import PublicCreatorPage from './features/creator/PublicCreatorPage'
import OnboardingPage from './features/creator/OnboardingPage'
import PaymentSuccessPage from './features/support/PaymentSuccessPage'
import WalletPage from './features/wallet/WalletPage'
import NotificationsPage from './features/notifications/NotificationsPage'
import SettingsPage from './features/settings/SettingsPage'

const AUTHED_ROUTES = ['/home', '/wallet', '/notifications', '/settings', '/onboarding']

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/auth" state={{ from: location }} replace />
  return <>{children}</>
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user && !user.onboardingDone) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const showNav = AUTHED_ROUTES.includes(location.pathname) && location.pathname !== '/onboarding'
  return <AppLayout showNav={showNav}>{children}</AppLayout>
}

export default function AppRouter() {
  return (
    <Layout>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/c/:slug" element={<PublicCreatorPage />} />
        <Route path="/payment/success" element={<PaymentSuccessPage />} />

        <Route path="/onboarding" element={
          <AuthGuard><OnboardingPage /></AuthGuard>
        } />

        <Route path="/home" element={
          <AuthGuard><OnboardingGuard><HomePage /></OnboardingGuard></AuthGuard>
        } />
        <Route path="/wallet" element={
          <AuthGuard><OnboardingGuard><WalletPage /></OnboardingGuard></AuthGuard>
        } />
        <Route path="/notifications" element={
          <AuthGuard><OnboardingGuard><NotificationsPage /></OnboardingGuard></AuthGuard>
        } />
        <Route path="/settings" element={
          <AuthGuard><OnboardingGuard><SettingsPage /></OnboardingGuard></AuthGuard>
        } />

        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </Layout>
  )
}
