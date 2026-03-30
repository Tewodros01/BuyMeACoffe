import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { APP_ROUTES } from '../../config/routes'
import { useAuthStore } from '../../store/authStore'

export function AuthGuard({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to={APP_ROUTES.auth} state={{ from: location }} replace />
  }

  return <>{children}</>
}

export function OnboardingGuard({
  children,
}: {
  children: ReactNode
}) {
  const user = useAuthStore((state) => state.user)

  if (user && !user.onboardingDone) {
    return <Navigate to={APP_ROUTES.onboarding} replace />
  }

  return <>{children}</>
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)

  if (user?.role !== 'ADMIN') {
    return <Navigate to={APP_ROUTES.home} replace />
  }

  return <>{children}</>
}
