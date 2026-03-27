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
