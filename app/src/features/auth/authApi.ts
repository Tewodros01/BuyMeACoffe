import { z } from 'zod'
import { api } from '../../lib/api'
import { UserSchema } from '../../store/authStore'

const AuthResponseSchema = z.object({
  user: UserSchema,
})

export type AuthResponse = z.infer<typeof AuthResponseSchema>

export const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const RegisterSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must include upper, lower, and number'),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>

export const authApi = {
  loginWithTelegram: async (initData: string) => {
    const { data } = await api.post('/auth/telegram', { initData })
    return AuthResponseSchema.parse(data)
  },

  login: async (input: LoginInput) => {
    const { data } = await api.post('/auth/login', input)
    return AuthResponseSchema.parse(data)
  },

  register: async (input: RegisterInput) => {
    const { data } = await api.post('/auth/register', input)
    return AuthResponseSchema.parse(data)
  },

  getProfile: async () => {
    const { data } = await api.get('/auth/profile')
    return UserSchema.parse(data)
  },

  logout: async () => {
    await api.post('/auth/logout', {})
  },
}
