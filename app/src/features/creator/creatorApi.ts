import { z } from 'zod'
import { api } from '../../lib/api'

export const CreatorProfileSchema = z.object({
  id: z.string(),
  slug: z.string(),
  pageTitle: z.string(),
  thankYouMessage: z.string().nullable(),
  coverImage: z.string().nullable(),
  coffeePrice: z.union([z.string(), z.number()]).transform(Number),
  socialLinks: z.record(z.string()).nullable(),
  isPublished: z.boolean(),
  totalSupporters: z.number(),
  totalSupports: z.number(),
  createdAt: z.string(),
  user: z.object({
    username: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().nullable(),
    bio: z.string().nullable(),
  }),
})

export const SupportItemSchema = z.object({
  id: z.string(),
  supporterName: z.string(),
  message: z.string().nullable(),
  coffeeCount: z.number(),
  amount: z.union([z.string(), z.number()]).transform(Number),
  paidAt: z.string().nullable(),
})

export const DashboardSchema = z.object({
  profile: z.object({
    id: z.string(),
    slug: z.string(),
    totalSupporters: z.number(),
    totalSupports: z.number(),
    coffeePrice: z.union([z.string(), z.number()]).transform(Number),
  }),
  wallet: z.object({
    availableBalance: z.union([z.string(), z.number()]).transform(Number),
    pendingBalance: z.union([z.string(), z.number()]).transform(Number),
    lockedBalance: z.union([z.string(), z.number()]).transform(Number),
    totalEarned: z.union([z.string(), z.number()]).transform(Number),
    currency: z.string(),
  }).nullable(),
  recentSupports: z.array(SupportItemSchema),
})

export type CreatorProfile = z.infer<typeof CreatorProfileSchema>
export type SupportItem = z.infer<typeof SupportItemSchema>
export type Dashboard = z.infer<typeof DashboardSchema>

export const UpdateProfileSchema = z.object({
  slug: z.string().min(3).max(30).regex(/^[a-z0-9_-]+$/).optional(),
  pageTitle: z.string().max(100).optional(),
  thankYouMessage: z.string().max(500).optional(),
  coffeePrice: z.number().min(10).max(10000).optional(),
  isPublished: z.boolean().optional(),
})
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>

export const creatorApi = {
  getMyProfile: async () => {
    const { data } = await api.get('/creator/profile')
    return CreatorProfileSchema.parse(data)
  },

  updateProfile: async (input: UpdateProfileInput) => {
    const { data } = await api.patch('/creator/profile', input)
    return CreatorProfileSchema.parse(data)
  },

  getDashboard: async () => {
    const { data } = await api.get('/creator/dashboard')
    return DashboardSchema.parse(data)
  },

  getPublicProfile: async (slug: string) => {
    const { data } = await api.get(`/creator/${slug}`)
    return CreatorProfileSchema.parse(data)
  },

  getRecentSupporters: async (slug: string) => {
    const { data } = await api.get(`/creator/${slug}/supporters`)
    return z.array(SupportItemSchema).parse(data)
  },
}
