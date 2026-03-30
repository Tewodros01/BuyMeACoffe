import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Users, Coffee, Copy, ExternalLink, ArrowDownLeft, Bell } from 'lucide-react'
import { creatorApi } from './creatorApi'
import { useAuthStore } from '../../store/authStore'
import { AppBar, Avatar, Badge, Spinner, Empty, SectionHeader } from '../../components/ui/index'
import { haptic } from '../../lib/telegram'
import { formatETB, timeAgo } from './utils'
import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: creatorApi.getDashboard,
  })

  const copyLink = () => {
    if (!dashboard?.profile.slug) return
    navigator.clipboard.writeText(`${window.location.origin}/c/${dashboard.profile.slug}`)
    haptic('success')
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#07070f]">
      <Spinner className="w-8 h-8" />
    </div>
  )

  const wallet = dashboard?.wallet
  const profile = dashboard?.profile

  return (
    <div className="min-h-screen bg-[#07070f] pb-28">
      {/* Top ambient */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-amber-500/[0.06] to-transparent pointer-events-none max-w-[430px] mx-auto" />

      <div className="relative flex flex-col gap-5 px-4 pt-5 stagger">

        {/* Header */}
        <AppBar
          title={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Creator'}
          subtitle="Good day ☕"
          trailing={
            <>
              <button onClick={() => navigate('/notifications')}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.05] text-white/30 transition-transform active:scale-95">
                <Bell className="h-[18px] w-[18px]" />
              </button>
              <Avatar src={user?.avatar} name={`${user?.firstName} ${user?.lastName}`} size="md" />
            </>
          }
          className="fade-up"
        />

        {/* Balance Card */}
        <div className="relative rounded-3xl overflow-hidden fade-up" style={{ animationDelay: '50ms' }}>
          <div className="absolute inset-0 bg-linear-to-br from-[#1a1408] via-[#120f06] to-[#07070f]" />
          <div className="absolute inset-0 border border-amber-500/[0.18] rounded-3xl" />
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/[0.12] rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

          <div className="relative p-5">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[11px] font-bold text-amber-500/50 uppercase tracking-[0.12em] mb-2">Available Balance</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[40px] font-black text-white leading-none tracking-tight">
                    {formatETB(wallet?.availableBalance ?? 0)}
                  </span>
                  <span className="text-[15px] font-semibold text-white/30 mb-1">ETB</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-500/[0.12] border border-amber-500/[0.18] flex items-center justify-center">
                <Coffee className="w-5 h-5 text-amber-400" />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 bg-black/30 rounded-[14px] px-3 py-2.5 border border-white/[0.05]">
                <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider mb-1">Pending</p>
                <p className="text-[14px] font-bold text-amber-400">{formatETB(wallet?.pendingBalance ?? 0)}</p>
              </div>
              <div className="flex-1 bg-black/30 rounded-[14px] px-3 py-2.5 border border-white/[0.05]">
                <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider mb-1">Processing</p>
                <p className="text-[14px] font-bold text-blue-400">{formatETB(wallet?.lockedBalance ?? 0)}</p>
              </div>
              <div className="flex-1 bg-black/30 rounded-[14px] px-3 py-2.5 border border-white/[0.05]">
                <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider mb-1">Earned</p>
                <p className="text-[14px] font-bold text-emerald-400">{formatETB(wallet?.totalEarned ?? 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 fade-up" style={{ animationDelay: '100ms' }}>
          {[
            { icon: <Coffee className="w-4 h-4 text-amber-400" />, label: 'Supports', value: profile?.totalSupports ?? 0, color: 'border-amber-500/15 bg-amber-500/[0.06]' },
            { icon: <Users className="w-4 h-4 text-blue-400" />, label: 'Supporters', value: profile?.totalSupporters ?? 0, color: 'border-blue-500/15 bg-blue-500/[0.06]' },
            { icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, label: 'Earned', value: formatETB(wallet?.totalEarned ?? 0), color: 'border-emerald-500/15 bg-emerald-500/[0.06]', small: true },
          ].map((s, i) => (
            <div key={i} className={`rounded-[18px] p-3.5 border ${s.color} flex flex-col gap-2`}>
              <div className="w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center">{s.icon}</div>
              <p className={`font-bold text-white leading-tight ${s.small ? 'text-[13px]' : 'text-[20px]'}`}>{s.value}</p>
              <p className="text-[10px] text-white/25 font-semibold">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Page link */}
        {profile?.slug && (
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 flex items-center gap-3 fade-up" style={{ animationDelay: '150ms' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/25 font-semibold uppercase tracking-wider mb-1">Your page</p>
              <p className="text-[13px] text-white/50 font-medium truncate">
                /c/<span className="text-amber-400 font-semibold">{profile.slug}</span>
              </p>
            </div>
            <button onClick={copyLink} className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-white/25 hover:text-amber-400 active:scale-95 transition-all">
              <Copy className="w-4 h-4" />
            </button>
            <a href={`/c/${profile.slug}`} target="_blank" rel="noreferrer"
              className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-white/25 hover:text-amber-400 active:scale-95 transition-all">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Recent supports */}
        <div className="fade-up" style={{ animationDelay: '200ms' }}>
          <SectionHeader title="Recent Supports" action={<span className="text-[12px] text-white/20">{dashboard?.recentSupports.length ?? 0} total</span>} />
          {!dashboard?.recentSupports.length ? (
            <Empty icon={<Coffee className="w-6 h-6" />} title="No supports yet" description="Share your page link to start receiving support" />
          ) : (
            <div className="flex flex-col gap-2">
              {dashboard.recentSupports.map((s, i) => (
                <div key={s.id} className="rounded-2xl bg-[#0e0e1c] border border-white/6 p-4 flex items-center gap-3 fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/[0.08] border border-amber-500/[0.12] flex items-center justify-center flex-shrink-0 text-[16px]">
                    {'☕'.repeat(Math.min(s.coffeeCount, 2))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white truncate">{s.supporterName}</p>
                    {s.message && <p className="text-[12px] text-white/30 mt-0.5 truncate">"{s.message}"</p>}
                    <p className="text-[11px] text-white/20 mt-0.5">{s.coffeeCount} coffee{s.coffeeCount > 1 ? 's' : ''} · {s.paidAt ? timeAgo(s.paidAt) : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                    <span className="text-[14px] font-bold text-emerald-400">{formatETB(s.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
