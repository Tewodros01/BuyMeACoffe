import { z } from 'zod'
import { api } from '../../lib/api'

export const AdminWithdrawalSchema = z.object({
  id: z.string(),
  amount: z.union([z.string(), z.number()]).transform(Number),
  currency: z.string(),
  method: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED']),
  note: z.string().nullable(),
  adminNote: z.string().nullable(),
  referenceId: z.string().nullable(),
  createdAt: z.string(),
  processingStartedAt: z.string().nullable(),
  processedAt: z.string().nullable(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  financialAccount: z.object({
    id: z.string(),
    provider: z.string(),
    accountName: z.string(),
    accountNumber: z.string(),
    label: z.string().nullable(),
  }),
})

export const UpdateAdminWithdrawalSchema = z.object({
  status: z.enum(['PROCESSING', 'COMPLETED', 'REJECTED']),
  adminNote: z.string().max(500).optional(),
  referenceId: z.string().max(100).optional(),
})

export const AdminWithdrawalListSchema = z.object({
  items: z.array(AdminWithdrawalSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    take: z.number(),
    totalPages: z.number(),
  }),
})

export const AdminMetricsSchema = z.object({
  counts: z.object({
    pending: z.number(),
    processing: z.number(),
    completed: z.number(),
    rejected: z.number(),
  }),
  amounts: z.object({
    pending: z.number(),
    processing: z.number(),
    totalRequested: z.number(),
  }),
  trends: z.object({
    completedToday: z.number(),
    rejectedThisWeek: z.number(),
  }),
})

export const AuditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reasonCode: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  actor: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  targetUser: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }).nullable(),
})

export const AuditLogListSchema = z.object({
  items: z.array(AuditLogSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    take: z.number(),
    totalPages: z.number(),
  }),
})

export const AccountingEntrySchema = z.object({
  id: z.string(),
  walletId: z.string().nullable(),
  accountCode: z.string(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.union([z.string(), z.number()]).transform(Number),
  currency: z.string(),
  metadata: z.unknown().nullable().optional(),
})

export const AccountingBatchSchema = z.object({
  id: z.string(),
  batchType: z.string(),
  currency: z.string(),
  description: z.string().nullable(),
  idempotencyKey: z.string(),
  supportId: z.string().nullable(),
  withdrawalId: z.string().nullable(),
  createdAt: z.string(),
  providerTransaction: z.object({
    id: z.string(),
    provider: z.string(),
    providerRef: z.string(),
    status: z.string(),
  }).nullable(),
  entries: z.array(AccountingEntrySchema),
})

export const AccountingBatchListSchema = z.object({
  items: z.array(AccountingBatchSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    take: z.number(),
    totalPages: z.number(),
  }),
})

export const ProviderTransactionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerRef: z.string(),
  status: z.string(),
  eventType: z.string().nullable(),
  amount: z.union([z.string(), z.number()]).transform(Number),
  feeAmount: z.union([z.string(), z.number()]).transform(Number),
  netAmount: z.union([z.string(), z.number()]).nullable().transform((value) => value == null ? null : Number(value)),
  currency: z.string(),
  verifiedAt: z.string().nullable(),
  recordedAt: z.string(),
  paymentIntent: z.object({
    id: z.string(),
    supportId: z.string(),
    support: z.object({
      id: z.string(),
      supporterName: z.string(),
      creatorProfile: z.object({
        slug: z.string(),
        user: z.object({
          firstName: z.string(),
          lastName: z.string(),
        }),
      }),
    }),
  }),
  paymentAttempt: z.object({
    id: z.string(),
    attemptNumber: z.number(),
    checkoutUrl: z.string().nullable(),
  }).nullable(),
})

export const ProviderTransactionListSchema = z.object({
  items: z.array(ProviderTransactionSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    take: z.number(),
    totalPages: z.number(),
  }),
})

export const ReconciliationBalanceSchema = z.object({
  availableBalance: z.union([z.string(), z.number()]).transform(Number),
  pendingBalance: z.union([z.string(), z.number()]).transform(Number),
  lockedBalance: z.union([z.string(), z.number()]).transform(Number),
})

export const ReconciliationMismatchSchema = z.object({
  walletId: z.string(),
  userId: z.string(),
  actual: ReconciliationBalanceSchema,
  expected: ReconciliationBalanceSchema,
  latestSnapshot: ReconciliationBalanceSchema,
  mismatchFields: z.array(z.string()),
  snapshotMismatchFields: z.array(z.string()),
  lastTransactionId: z.string().nullable(),
})

export const ReconciliationReportSchema = z.object({
  checkedWallets: z.number(),
  mismatchedWallets: z.number(),
  mismatches: z.array(ReconciliationMismatchSchema),
})

export const BulkUpdateAdminWithdrawalSchema = z.object({
  withdrawalIds: z.array(z.string()).min(1),
  status: z.enum(['PROCESSING', 'COMPLETED', 'REJECTED']),
  adminNote: z.string().max(500).optional(),
})

export type AdminWithdrawal = z.infer<typeof AdminWithdrawalSchema>
export type UpdateAdminWithdrawalInput = z.infer<typeof UpdateAdminWithdrawalSchema>
export type AdminWithdrawalList = z.infer<typeof AdminWithdrawalListSchema>
export type AdminMetrics = z.infer<typeof AdminMetricsSchema>
export type AuditLogItem = z.infer<typeof AuditLogSchema>
export type AuditLogList = z.infer<typeof AuditLogListSchema>
export type BulkUpdateAdminWithdrawalInput = z.infer<typeof BulkUpdateAdminWithdrawalSchema>
export type AccountingBatch = z.infer<typeof AccountingBatchSchema>
export type AccountingBatchList = z.infer<typeof AccountingBatchListSchema>
export type ProviderTransaction = z.infer<typeof ProviderTransactionSchema>
export type ProviderTransactionList = z.infer<typeof ProviderTransactionListSchema>
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>

export const adminWithdrawalApi = {
  list: async (params?: { status?: string; search?: string; page?: number; take?: number }) => {
    const { data } = await api.get('/wallet/admin/withdrawals', {
      params,
    })
    return AdminWithdrawalListSchema.parse(data)
  },

  metrics: async () => {
    const { data } = await api.get('/wallet/admin/metrics')
    return AdminMetricsSchema.parse(data)
  },

  auditLogs: async (params?: { action?: string; entityType?: string; search?: string; page?: number; take?: number }) => {
    const { data } = await api.get('/wallet/admin/audit-logs', {
      params,
    })
    return AuditLogListSchema.parse(data)
  },

  accountingBatches: async (params?: { page?: number; take?: number; batchType?: string; search?: string }) => {
    const { data } = await api.get('/wallet/admin/accounting-batches', {
      params,
    })
    return AccountingBatchListSchema.parse(data)
  },

  providerTransactions: async (params?: { page?: number; take?: number; status?: string; search?: string }) => {
    const { data } = await api.get('/wallet/admin/provider-transactions', {
      params,
    })
    return ProviderTransactionListSchema.parse(data)
  },

  reconciliation: async (params?: { limit?: number }) => {
    const { data } = await api.get('/wallet/admin/reconciliation', {
      params,
    })
    return ReconciliationReportSchema.parse(data)
  },

  runReconciliation: async (params?: { limit?: number }) => {
    const { data } = await api.post('/wallet/admin/reconciliation/run', undefined, {
      params,
    })
    return ReconciliationReportSchema.parse(data)
  },

  updateStatus: async (id: string, input: UpdateAdminWithdrawalInput) => {
    const { data } = await api.post(`/wallet/admin/withdrawals/${id}/status`, input)
    return data
  },

  bulkUpdate: async (input: BulkUpdateAdminWithdrawalInput) => {
    const { data } = await api.post('/wallet/admin/withdrawals/bulk-status', input)
    return data as {
      requested: number
      succeeded: number
      failed: Array<{ withdrawalId: string; reason: string }>
    }
  },
}
