import { useEffect } from 'react'
import { authApi } from '../features/auth/authApi'
import { useAuthStore } from '../store/authStore'

export function useBootstrapSession() {
  const authReady = useAuthStore((state) => state.authReady)
  const setSession = useAuthStore((state) => state.setSession)

  useEffect(() => {
    if (authReady) return

    authApi
      .getProfile()
      .then((user) => setSession(user))
      .catch(() => setSession(null))
  }, [authReady, setSession])

  return authReady
}
