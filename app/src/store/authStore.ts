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
  isAuthenticated: boolean
  authReady: boolean
  setAuth: (payload: { user: User }) => void
  setSession: (user: User | null) => void
  updateUser: (user: Partial<User>) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      authReady: false,

      setAuth: ({ user }) => {
        set({ user, isAuthenticated: true, authReady: true })
      },

      setSession: (user) => set({
        user,
        isAuthenticated: !!user,
        authReady: true,
      }),

      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),

      logout: () => {
        set({ user: null, isAuthenticated: false, authReady: true })
      },
    }),
    {
      name: 'bmac-auth',
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        authReady: false,
      }),
    },
  ),
)
