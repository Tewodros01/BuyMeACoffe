import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatar: z.string().nullable(),
  phone: z.string().nullable().optional(),
  role: z.enum(['USER', 'CREATOR', 'ADMIN']),
  isVerified: z.boolean(),
  onboardingDone: z.boolean(),
  telegramId: z.string().nullable().optional(),
  telegramUsername: z.string().nullable().optional(),
  createdAt: z.string(),
})

export type User = z.infer<typeof UserSchema>

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (payload: { user: User; access_token: string; refresh_token: string }) => void
  updateUser: (user: Partial<User>) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: ({ user, access_token, refresh_token }) => {
        // Also write to localStorage key that axios interceptor reads
        localStorage.setItem('auth', JSON.stringify({ access_token, refresh_token }))
        set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true })
      },

      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),

      logout: () => {
        localStorage.removeItem('auth')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },
    }),
    {
      name: 'bmac-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
)
