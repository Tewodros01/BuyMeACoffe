import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  History,
  Search,
  Shield,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AppBar, Badge, Card, Empty, Input, Spinner } from '../../components/ui'
import { Button } from '../../components/ui/Button'
import { haptic } from '../../lib/telegram'
import { formatETB, timeAgo } from '../creator/utils'
import {
  adminWithdrawalApi,
  BulkUpdateAdminWithdrawalSchema,
  UpdateAdminWithdrawalSchema,
  type AdminWithdrawal,
  type BulkUpdateAdminWithdrawalInput,
  type UpdateAdminWithdrawalInput,
} from './adminWithdrawalApi'

const STATUSES = ['ALL', 'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'] as const
const TABS = ['overview', 'withdrawals', 'audit'] as const

function statusVariant(status: AdminWithdrawal['status']) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PROCESSING') return 'info'
  return 'warning'
}

function isFinalStatus(status: AdminWithdrawal['status']) {
  return status === 'COMPLETED' || status === 'REJECTED'
}

export default function AdminWithdrawalsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('PENDING')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selected, setSelected] = useState<AdminWithdrawal | null>(null)

  const query = useMemo(
    () => ({
      status: status === 'ALL' ? undefined : status,
      search: search.trim() || undefined,
      page,
      take: 10,
    }),
    [page, search, status],
  )

  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawals', query],
    queryFn: () => adminWithdrawalApi.list(query),
  })
  const { data: metrics } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: adminWithdrawalApi.metrics,
  })
  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ['admin-audit-logs', auditPage],
    queryFn: () =>
      adminWithdrawalApi.auditLogs({
        entityType: 'withdrawal',
        page: auditPage,
        take: 10,
      }),
  })

  const form = useForm<UpdateAdminWithdrawalInput>({
    resolver: zodResolver(UpdateAdminWithdrawalSchema),
  })
  const bulkForm = useForm<BulkUpdateAdminWithdrawalInput>({
    resolver: zodResolver(BulkUpdateAdminWithdrawalSchema),
    defaultValues: {
      status: 'PROCESSING',
      adminNote: '',
      withdrawalIds: [],
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateAdminWithdrawalInput }) =>
      adminWithdrawalApi.updateStatus(id, values),
    onSuccess: () => {
      haptic('success')
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] })
      qc.invalidateQueries({ queryKey: ['withdrawals'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      form.reset()
      setSelected(null)
    },
    onError: () => haptic('error'),
  })
  const bulkMutation = useMutation({
    mutationFn: adminWithdrawalApi.bulkUpdate,
    onSuccess: () => {
      haptic('success')
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] })
      setSelectedIds([])
      bulkForm.reset({ status: 'PROCESSING', adminNote: '', withdrawalIds: [] })
    },
    onError: () => haptic('error'),
  })

  const withdrawals = data?.items ?? []
  const pagination = data?.pagination

  const toggleSelection = (withdrawalId: string) => {
    setSelectedIds((current) =>
      current.includes(withdrawalId)
        ? current.filter((id) => id !== withdrawalId)
        : [...current, withdrawalId],
    )
  }

  const selectableWithdrawals = withdrawals.filter((item) => !isFinalStatus(item.status))

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-28 fade-in">
      <AppBar
        title="Admin Withdrawals"
        subtitle="Review and process payout requests"
        leading={
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
            <Shield className="h-5 w-5" />
          </div>
        }
      />

      <Card className="p-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
            { key: 'withdrawals', label: 'Withdrawals', icon: <Wallet className="h-4 w-4" /> },
            { key: 'audit', label: 'Audit', icon: <History className="h-4 w-4" /> },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key as (typeof TABS)[number])}
              className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-[12px] font-bold ${
                tab === item.key
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-transparent text-white/40'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/25">Pending</p>
              <p className="mt-2 text-[26px] font-black text-white">{metrics?.counts.pending ?? 0}</p>
              <p className="mt-1 text-[12px] text-amber-300">{formatETB(metrics?.amounts.pending ?? 0)} ETB</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/25">Processing</p>
              <p className="mt-2 text-[26px] font-black text-white">{metrics?.counts.processing ?? 0}</p>
              <p className="mt-1 text-[12px] text-blue-300">{formatETB(metrics?.amounts.processing ?? 0)} ETB</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/25">Completed Today</p>
              <p className="mt-2 text-[26px] font-black text-white">{metrics?.trends.completedToday ?? 0}</p>
              <p className="mt-1 text-[12px] text-emerald-300">Maker/checker finalized</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/25">Rejected This Week</p>
              <p className="mt-2 text-[26px] font-black text-white">{metrics?.trends.rejectedThisWeek ?? 0}</p>
              <p className="mt-1 text-[12px] text-red-300">Monitor payout issues</p>
            </Card>
          </div>
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/25">Total Requested Volume</p>
            <p className="mt-2 text-[32px] font-black text-white">
              {formatETB(metrics?.amounts.totalRequested ?? 0)} ETB
            </p>
            <p className="mt-2 text-[12px] text-white/35">
              Overview of all withdrawal volume currently tracked by the system.
            </p>
          </Card>
        </>
      )}

      {tab === 'withdrawals' && (
        <>
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3">
          <Input
            label="Search"
            placeholder="Email, username, provider, reference"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            leftIcon={<Search className="h-4 w-4" />}
          />
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setStatus(item)
                  setPage(1)
                }}
                className={`rounded-full border px-3 py-2 text-[11px] font-bold tracking-[0.12em] transition-all ${
                  status === item
                    ? 'border-amber-500/25 bg-amber-500/12 text-amber-300'
                    : 'border-white/[0.08] bg-white/[0.04] text-white/35'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          {selectableWithdrawals.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === selectableWithdrawals.length
                      ? []
                      : selectableWithdrawals.map((item) => item.id),
                  )
                }
              >
                {selectedIds.length === selectableWithdrawals.length ? 'Clear Page' : 'Select Page'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="p-4">
          <form
            onSubmit={bulkForm.handleSubmit((values) =>
              bulkMutation.mutate({
                ...values,
                withdrawalIds: selectedIds,
              }),
            )}
            className="flex flex-col gap-4"
          >
            <p className="text-[13px] font-semibold text-white">
              Bulk actions for {selectedIds.length} selected withdrawal{selectedIds.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                  Bulk Status
                </label>
                <select
                  className="h-[52px] rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[15px] font-medium text-white focus:outline-none"
                  {...bulkForm.register('status')}
                >
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                  Admin Note
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:outline-none"
                  placeholder="Optional note for all selected withdrawals"
                  {...bulkForm.register('adminNote')}
                />
              </div>
            </div>
            {bulkMutation.error && (
              <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] p-3 text-[13px] text-red-300">
                {(bulkMutation.error as any)?.response?.data?.message ?? 'Bulk action failed'}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
              <Button type="submit" fullWidth loading={bulkMutation.isPending}>
                Apply Bulk Action
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !withdrawals.length ? (
        <Empty
          icon={<Filter className="h-7 w-7" />}
          title="No matching withdrawals"
          description="Try a different status or search term"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {withdrawals.map((withdrawal) => (
            <Card
              key={withdrawal.id}
              className={`p-4 transition-all ${
                selected?.id === withdrawal.id ? 'border-amber-500/25 bg-amber-500/[0.04]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                    checked={selectedIds.includes(withdrawal.id)}
                    disabled={isFinalStatus(withdrawal.status)}
                    onChange={() => toggleSelection(withdrawal.id)}
                  />
                  <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[16px] font-bold text-white">
                      {formatETB(withdrawal.amount)} {withdrawal.currency}
                    </p>
                    <Badge variant={statusVariant(withdrawal.status)} dot>
                      {withdrawal.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-white/55">
                    {withdrawal.user.firstName} {withdrawal.user.lastName} · @{withdrawal.user.username}
                  </p>
                  <p className="text-[12px] text-white/28">{withdrawal.user.email}</p>
                </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(withdrawal)
                    form.reset({
                      status:
                        withdrawal.status === 'PENDING'
                          ? 'PROCESSING'
                          : withdrawal.status === 'PROCESSING'
                            ? 'COMPLETED'
                            : withdrawal.status,
                      adminNote: withdrawal.adminNote ?? '',
                      referenceId: withdrawal.referenceId ?? '',
                    })
                  }}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/70"
                >
                  {isFinalStatus(withdrawal.status) ? 'View' : 'Review'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] text-white/35">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">Method</p>
                  <p className="text-white/60">{withdrawal.method.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">Requested</p>
                  <p className="text-white/60">{timeAgo(withdrawal.createdAt)}</p>
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">Payout account</p>
                  <p className="text-white/60">
                    {withdrawal.financialAccount.label ?? withdrawal.financialAccount.accountName} · {withdrawal.financialAccount.provider} · {withdrawal.financialAccount.accountNumber}
                  </p>
                </div>
                {withdrawal.note && (
                  <div className="col-span-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">Creator note</p>
                    <p className="text-white/60">{withdrawal.note}</p>
                  </div>
                )}
                {(withdrawal.adminNote || withdrawal.referenceId) && (
                  <div className="col-span-2 rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] p-3">
                    {withdrawal.adminNote && (
                      <p className="text-[12px] text-blue-100/80">{withdrawal.adminNote}</p>
                    )}
                    {withdrawal.referenceId && (
                      <p className="mt-1 text-[11px] font-mono text-blue-200/70">
                        Ref: {withdrawal.referenceId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <p className="text-[12px] text-white/45">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                setPage((current) => Math.min(pagination.totalPages, current + 1))
              }
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
        </>
      )}

      {tab === 'audit' && (
        <>
          {auditLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          ) : !auditLogs?.items.length ? (
            <Empty
              icon={<History className="h-7 w-7" />}
              title="No audit logs yet"
              description="Admin actions will appear here"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {auditLogs.items.map((log) => (
                <Card key={log.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold text-white">{log.action.replace(/_/g, ' ')}</p>
                      <p className="mt-1 text-[12px] text-white/40">
                        {log.actor.firstName} {log.actor.lastName} · @{log.actor.username}
                      </p>
                    </div>
                    <Badge variant="info">{log.entityType}</Badge>
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-[11px] font-semibold text-white/55">
                      Entity: {log.entityId}
                    </p>
                    {log.targetUser && (
                      <p className="mt-1 text-[11px] text-white/40">
                        Target: {log.targetUser.email}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-white/30">{timeAgo(log.createdAt)}</p>
                  </div>
                  {(log.before || log.after) && (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">Before</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-white/45">
                          {JSON.stringify(log.before, null, 2) || 'null'}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">After</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-white/45">
                          {JSON.stringify(log.after, null, 2) || 'null'}
                        </pre>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          {auditLogs?.pagination && auditLogs.pagination.totalPages > 1 && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={auditLogs.pagination.page <= 1}
                  onClick={() => setAuditPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <p className="text-[12px] text-white/45">
                  Page {auditLogs.pagination.page} of {auditLogs.pagination.totalPages}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={auditLogs.pagination.page >= auditLogs.pagination.totalPages}
                  onClick={() =>
                    setAuditPage((current) =>
                      Math.min(auditLogs.pagination.totalPages, current + 1),
                    )
                  }
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {selected && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-300" />
            <p className="text-[15px] font-bold text-white">Process withdrawal</p>
          </div>

          <form
            onSubmit={form.handleSubmit((values) =>
              updateMutation.mutate({ id: selected.id, values }),
            )}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                New Status
              </label>
              <select
                className="h-[52px] rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[15px] font-medium text-white focus:outline-none"
                disabled={isFinalStatus(selected.status)}
                {...form.register('status')}
              >
                <option value="PROCESSING">PROCESSING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>

            <Input
              label="Reference ID"
              placeholder="Bank transfer or payout reference"
              error={form.formState.errors.referenceId?.message}
              disabled={isFinalStatus(selected.status)}
              {...form.register('referenceId')}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                Admin Note
              </label>
              <textarea
                rows={4}
                className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:outline-none"
                placeholder="Explain what changed or why this was rejected"
                disabled={isFinalStatus(selected.status)}
                {...form.register('adminNote')}
              />
              {form.formState.errors.adminNote && (
                <p className="text-[12px] font-medium text-red-400">
                  {form.formState.errors.adminNote.message}
                </p>
              )}
            </div>

            {updateMutation.error && (
              <div className="flex items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/[0.06] p-3 text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-[13px]">
                  {(updateMutation.error as any)?.response?.data?.message ?? 'Failed to update withdrawal'}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  setSelected(null)
                  form.reset()
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                fullWidth
                loading={updateMutation.isPending}
                disabled={isFinalStatus(selected.status)}
              >
                {isFinalStatus(selected.status) ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Finalized
                  </>
                ) : form.watch('status') === 'REJECTED' ? (
                  <>
                    <AlertCircle className="h-4 w-4" /> Reject
                  </>
                ) : form.watch('status') === 'COMPLETED' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Complete
                  </>
                ) : (
                  <>
                    <Clock3 className="h-4 w-4" /> Mark Processing
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
