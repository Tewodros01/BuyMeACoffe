import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownLeft, ArrowUpRight, Clock, Lock, AlertCircle, Send, X } from 'lucide-react'
import { walletApi, RequestWithdrawalSchema, type RequestWithdrawalInput } from './walletApi'
import { financialAccountApi } from '../settings/financialAccountApi'
import { AppBar, Badge, Spinner, Empty, Divider } from '../../components/ui/index'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/index'
import { getApiErrorMessage } from '../../lib/api'
import { formatETB, timeAgo } from '../creator/utils'
import { haptic } from '../../lib/telegram'

const METHODS = [
  { value: 'TELEBIRR', label: '📱 TeleBirr' },
  { value: 'CBE_BIRR', label: '🏦 CBE Birr' },
  { value: 'AWASH_BANK', label: '🏦 Awash Bank' },
  { value: 'DASHEN_BANK', label: '🏦 Dashen Bank' },
  { value: 'BANK_TRANSFER', label: '💳 Bank Transfer' },
]

function formatTransactionReason(reason: string) {
  return reason.replace(/_/g, ' ').toLowerCase()
}

function transactionBalanceLabel(reason: string) {
  if (reason === 'SUPPORT_PENDING') return 'Pending'
  if (reason === 'SUPPORT_SETTLED') return 'Available'
  if (reason === 'WITHDRAWAL_RESERVED') return 'Locked'
  if (reason === 'WITHDRAWAL_COMPLETED') return 'Locked'
  if (reason === 'WITHDRAWAL_FAILED' || reason === 'WITHDRAWAL_RELEASED') return 'Available'
  return 'Available'
}

function transactionBalanceValue(tx: {
  reason: string
  availableBalanceAfter: number
  pendingBalanceAfter: number
  lockedBalanceAfter: number
}) {
  if (tx.reason === 'SUPPORT_PENDING') return tx.pendingBalanceAfter
  if (tx.reason === 'WITHDRAWAL_RESERVED' || tx.reason === 'WITHDRAWAL_COMPLETED') {
    return tx.lockedBalanceAfter
  }
  return tx.availableBalanceAfter
}

export default function WalletPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'transactions' | 'history'>('transactions')
  const [showWithdraw, setShowWithdraw] = useState(false)

  const { data: wallet, isLoading } = useQuery({ queryKey: ['wallet'], queryFn: walletApi.getWallet })
  const { data: transactions } = useQuery({ queryKey: ['transactions'], queryFn: walletApi.getTransactions, enabled: tab === 'transactions' })
  const { data: withdrawals } = useQuery({ queryKey: ['withdrawals'], queryFn: walletApi.getWithdrawals, enabled: tab === 'history' })
  const { data: accounts } = useQuery({ queryKey: ['financial-accounts'], queryFn: financialAccountApi.list, enabled: showWithdraw })

  const form = useForm<RequestWithdrawalInput>({ resolver: zodResolver(RequestWithdrawalSchema) })

  const withdrawMutation = useMutation({
    mutationFn: walletApi.requestWithdrawal,
    onSuccess: () => {
      haptic('success')
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['withdrawals'] })
      setShowWithdraw(false)
      setTab('history')
      form.reset()
    },
    onError: () => haptic('error'),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#07070f]">
      <Spinner className="w-8 h-8" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#07070f] pb-28">
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-emerald-500/[0.05] to-transparent pointer-events-none max-w-[430px] mx-auto" />

      <div className="relative flex flex-col gap-5 px-4 pt-5 stagger">

        {/* Header */}
        <AppBar title="Wallet" trailing={<Badge variant="success" dot>ETB</Badge>} className="fade-up" />

        {/* Balance Card */}
        <div className="relative rounded-3xl overflow-hidden fade-up" style={{ animationDelay: '40ms' }}>
          <div className="absolute inset-0 bg-linear-to-br from-[#081a10] via-[#060f09] to-[#07070f]" />
          <div className="absolute inset-0 border border-emerald-500/[0.18] rounded-3xl" />
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/[0.1] rounded-full blur-3xl" />

          <div className="relative p-5">
            <p className="text-[11px] font-bold text-emerald-500/50 uppercase tracking-[0.12em] mb-2">Available to Withdraw</p>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-[40px] font-black text-white leading-none tracking-tight">{formatETB(wallet?.availableBalance ?? 0)}</span>
              <span className="text-[15px] font-semibold text-white/30">ETB</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/30 rounded-[14px] px-3 py-2.5 border border-white/[0.05]">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider">Pending</p>
                </div>
                <p className="text-[15px] font-bold text-amber-400">{formatETB(wallet?.pendingBalance ?? 0)}</p>
              </div>
              <div className="bg-black/30 rounded-[14px] px-3 py-2.5 border border-white/[0.05]">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lock className="w-3 h-3 text-blue-400" />
                  <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider">Processing</p>
                </div>
                <p className="text-[15px] font-bold text-blue-400">{formatETB(wallet?.lockedBalance ?? 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Withdraw button */}
        {!showWithdraw && (
          <Button fullWidth variant="outline" onClick={() => setShowWithdraw(true)} className="fade-up">
            <Send className="w-4 h-4" /> Withdraw Funds
          </Button>
        )}

        {/* Withdraw form */}
        {showWithdraw && (
          <div className="rounded-3xl bg-[#0e0e1c] border border-amber-500/[0.15] p-5 scale-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-bold text-white">Withdraw Funds</h2>
              <button onClick={() => setShowWithdraw(false)} className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={form.handleSubmit((d) => withdrawMutation.mutate(d))} className="flex flex-col gap-4">
              <Input label="Amount (ETB)" type="number" placeholder="Minimum 100 ETB"
                hint={`Available: ${formatETB(wallet?.availableBalance ?? 0)} ETB`}
                error={form.formState.errors.amount?.message}
                {...form.register('amount', { valueAsNumber: true })} />

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/35 uppercase tracking-widest">Method</label>
                <select className="w-full h-[52px] rounded-2xl px-4 text-[15px] font-medium text-white bg-white/4 border border-white/8 focus:outline-none focus:border-amber-500/50 transition-all appearance-none" {...form.register('method')}>
                  <option value="" className="bg-[#0e0e1c]">Select method</option>
                  {METHODS.map((m) => <option key={m.value} value={m.value} className="bg-[#0e0e1c]">{m.label}</option>)}
                </select>
                {form.formState.errors.method && <p className="text-[12px] text-red-400 font-medium">{form.formState.errors.method.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/35 uppercase tracking-widest">Account</label>
                <select className="w-full h-[52px] rounded-2xl px-4 text-[15px] font-medium text-white bg-white/4 border border-white/8 focus:outline-none focus:border-amber-500/50 transition-all appearance-none" {...form.register('financialAccountId')}>
                  <option value="" className="bg-[#0e0e1c]">Select account</option>
                  {accounts?.map((a) => <option key={a.id} value={a.id} className="bg-[#0e0e1c]">{a.label ?? a.accountName} · {a.accountNumber}</option>)}
                </select>
                {form.formState.errors.financialAccountId && <p className="text-[12px] text-red-400 font-medium">{form.formState.errors.financialAccountId.message}</p>}
              </div>

              {withdrawMutation.error && (
                <div className="flex items-center gap-3 p-3.5 bg-red-500/[0.07] rounded-xl border border-red-500/15">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-[13px] text-red-400">{getApiErrorMessage(withdrawMutation.error, 'Withdrawal failed')}</p>
                </div>
              )}

              <div className="flex gap-3 mt-1">
                <Button variant="secondary" fullWidth type="button" onClick={() => setShowWithdraw(false)}>Cancel</Button>
                <Button fullWidth loading={withdrawMutation.isPending} type="submit">Confirm</Button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-white/4 rounded-2xl p-1 border border-white/6">
          {(['transactions', 'history'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); haptic('light') }}
              className={['flex-1 py-2.5 text-[13px] font-semibold rounded-xl transition-all duration-200', tab === t ? 'bg-white/[0.09] text-white' : 'text-white/30'].join(' ')}>
              {t === 'transactions' ? 'Transactions' : 'Withdrawals'}
            </button>
          ))}
        </div>

        {/* Transactions */}
        {tab === 'transactions' && (
          <div className="flex flex-col gap-2">
            {!transactions?.length
              ? <Empty icon={<ArrowDownLeft className="w-6 h-6" />} title="No transactions yet" description="Transactions appear after you receive support" />
              : transactions.map((tx, i) => (
                <div key={tx.id} className="rounded-2xl bg-[#0e0e1c] border border-white/6 p-4 flex items-center gap-3 fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${tx.type === 'CREDIT' ? 'bg-emerald-500/[0.1] border border-emerald-500/[0.12]' : 'bg-red-500/[0.1] border border-red-500/[0.12]'}`}>
                    {tx.type === 'CREDIT' ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" /> : <ArrowUpRight className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white capitalize">{formatTransactionReason(tx.reason)}</p>
                    <p className="text-[12px] text-white/25 mt-0.5">{timeAgo(tx.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[15px] font-bold ${tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.type === 'CREDIT' ? '+' : '−'}{formatETB(tx.amount)}
                    </p>
                    <p className="text-[11px] text-white/20 mt-0.5">
                      {transactionBalanceLabel(tx.reason)}: {formatETB(transactionBalanceValue(tx))}
                    </p>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* Withdrawals */}
        {tab === 'history' && (
          <div className="flex flex-col gap-2">
            {!withdrawals?.length
              ? <Empty icon={<Send className="w-6 h-6" />} title="No withdrawals yet" />
              : withdrawals.map((w, i) => (
                <div key={w.id} className="rounded-2xl bg-[#0e0e1c] border border-white/6 p-4 fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[17px] font-bold text-white">{formatETB(w.amount)} <span className="text-white/25 text-[13px] font-medium">ETB</span></p>
                      <p className="text-[12px] text-white/30 mt-0.5">{w.financialAccount.accountName}</p>
                    </div>
                    <Badge variant={w.status === 'COMPLETED' ? 'success' : w.status === 'REJECTED' ? 'danger' : w.status === 'PROCESSING' ? 'info' : 'warning'} dot>
                      {w.status}
                    </Badge>
                  </div>
                  <Divider />
                  <div className="flex items-center justify-between mt-3 text-[12px] text-white/25">
                    <span>{w.method.replace(/_/g, ' ')}</span>
                    <span>{timeAgo(w.createdAt)}</span>
                  </div>
                  {(w.processingStartedAt || w.processedAt) && (
                    <div className="mt-3 space-y-1 text-[11px] text-white/28">
                      {w.processingStartedAt && <p>Started: {timeAgo(w.processingStartedAt)}</p>}
                      {w.processedAt && <p>Finalized: {timeAgo(w.processedAt)}</p>}
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
