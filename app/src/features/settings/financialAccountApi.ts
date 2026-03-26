import { z } from 'zod'
import { api } from '../../lib/api'

export const FinancialAccountSchema = z.object({
  id: z.string(),
  type: z.enum(['MOBILE_MONEY', 'BANK_ACCOUNT']),
  provider: z.string(),
  accountName: z.string(),
  accountNumber: z.string(),
  label: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
})

export const CreateAccountSchema = z.object({
  type: z.enum(['MOBILE_MONEY', 'BANK_ACCOUNT']),
  provider: z.string().min(2).max(50),
  accountName: z.string().min(2).max(100),
  accountNumber: z.string().min(5).max(30),
  label: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
})

export type FinancialAccount = z.infer<typeof FinancialAccountSchema>
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>

export const financialAccountApi = {
  list: async () => {
    const { data } = await api.get('/financial-accounts')
    return z.array(FinancialAccountSchema).parse(data)
  },

  create: async (input: CreateAccountInput) => {
    const { data } = await api.post('/financial-accounts', input)
    return FinancialAccountSchema.parse(data)
  },

  remove: async (id: string) => {
    await api.delete(`/financial-accounts/${id}`)
  },

  setDefault: async (id: string) => {
    const { data } = await api.patch(`/financial-accounts/${id}`, { isDefault: true })
    return FinancialAccountSchema.parse(data)
  },
}
