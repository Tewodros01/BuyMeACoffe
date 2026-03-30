import { z } from 'zod'
import { api } from '../../lib/api'

export const InitiateSupportSchema = z.object({
  supporterName: z.string().min(1).max(100),
  supporterEmail: z.string().email().optional(),
  message: z.string().max(500).optional(),
  coffeeCount: z.number().int().min(1).max(50),
})

export const SupportResponseSchema = z.object({
  checkoutUrl: z.string(),
  txRef: z.string(),
  amount: z.number(),
  platformFee: z.number(),
  netAmount: z.number(),
  currency: z.string(),
})

export type InitiateSupportInput = z.infer<typeof InitiateSupportSchema>
export type SupportResponse = z.infer<typeof SupportResponseSchema>

const VerifySupportSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
})

export type VerifySupportResponse = z.infer<typeof VerifySupportSchema>

export const supportApi = {
  initiate: async (slug: string, input: InitiateSupportInput) => {
    const { data } = await api.post(`/supports/${slug}`, input)
    return SupportResponseSchema.parse(data)
  },

  verify: async (txRef: string) => {
    const { data } = await api.get(`/supports/verify/${txRef}`)
    return VerifySupportSchema.parse(data)
  },
}
