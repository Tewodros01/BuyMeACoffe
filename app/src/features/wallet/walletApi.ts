import { z } from 'zod'
import { api } from '../../lib/api'

export const WalletSchema = z.object({
  id: z.string(),
  availableBalance: z.union([z.string(), z.number()]).transform(Number),
  lockedBalance: z.union([z.string(), z.number()]).transform(Number),
  pendingBalance: z.union([z.string(), z.number()]).transform(Number),
  totalEarned: z.union([z.string(), z.number()]).transform(Number),
  currency: z.string(),
  isActive: z.boolean(),
})

export const TransactionSchema = z.object({
  id: z.string(),
  type: z.enum(['CREDIT', 'DEBIT']),
  reason: z.enum(['SUPPORT_RECEIVED', 'WITHDRAWAL', 'WITHDRAWAL_FAILED', 'REFUND', 'ADJUSTMENT']),
  amount: z.union([z.string(), z.number()]).transform(Number),
  balanceAfter: z.union([z.string(), z.number()]).transform(Number),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
})

export const WithdrawalSchema = z.object({
  id: z.string(),
  amount: z.union([z.string(), z.number()]).transform(Number),
  currency: z.string(),
  method: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED']),
  note: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
  financialAccount: z.object({
    provider: z.string(),
    accountName: z.string(),
    label: z.string().nullable(),
  }),
})

export const RequestWithdrawalSchema = z.object({
  amount: z.number().int().min(100).max(100000),
  method: z.enum(['TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER', 'AWASH_BANK', 'DASHEN_BANK']),
  financialAccountId: z.string().min(1, 'Select an account'),
  note: z.string().max(200).optional(),
})

export type Wallet = z.infer<typeof WalletSchema>
export type Transaction = z.infer<typeof TransactionSchema>
export type Withdrawal = z.infer<typeof WithdrawalSchema>
export type RequestWithdrawalInput = z.infer<typeof RequestWithdrawalSchema>

export const walletApi = {
  getWallet: async () => {
    const { data } = await api.get('/wallet')
    return WalletSchema.parse(data)
  },

  getTransactions: async () => {
    const { data } = await api.get('/wallet/transactions')
    return z.array(TransactionSchema).parse(data)
  },

  requestWithdrawal: async (input: RequestWithdrawalInput) => {
    const { data } = await api.post('/wallet/withdraw', input)
    return data
  },

  getWithdrawals: async () => {
    const { data } = await api.get('/wallet/withdrawals')
    return z.array(WithdrawalSchema).parse(data)
  },
}
