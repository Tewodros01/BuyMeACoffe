import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Coffee, Heart, MessageCircle, ExternalLink } from 'lucide-react'
import { z } from 'zod'
import { creatorApi } from './creatorApi'
import { supportApi } from '../support/supportApi'
import { Avatar, Card, Spinner, Empty, Badge } from '../../components/ui/index'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/index'
import { getApiErrorMessage } from '../../lib/api'
import { formatETB, timeAgo } from './utils'
import { haptic } from '../../lib/telegram'
import { useAuthStore } from '../../store/authStore'

const SupportFormSchema = z.object({
  supporterName: z.string().min(1, 'Name is required').max(100),
  supporterEmail: z.string().email().optional().or(z.literal('')),
  message: z.string().max(500).optional(),
})

export default function PublicCreatorPage() {
  const { slug } = useParams<{ slug: string }>()
  const user = useAuthStore((s) => s.user)
  const [coffeeCount, setCoffeeCount] = useState(1)
  const [name, setName] = useState(user ? `${user.firstName} ${user.lastName}` : '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', slug],
    queryFn: () => creatorApi.getPublicProfile(slug!),
    enabled: !!slug,
  })

  const { data: supporters } = useQuery({
    queryKey: ['supporters', slug],
    queryFn: () => creatorApi.getRecentSupporters(slug!),
    enabled: !!slug,
  })

  const initiateMutation = useMutation({
    mutationFn: () => supportApi.initiate(slug!, { supporterName: name, supporterEmail: email || undefined, message: message || undefined, coffeeCount }),
    onSuccess: (data) => {
      haptic('success')
      window.location.href = data.checkoutUrl
    },
    onError: () => haptic('error'),
  })

  const handleSupport = () => {
    const result = SupportFormSchema.safeParse({ supporterName: name, supporterEmail: email, message })
    if (!result.success) {
      const errs: Record<string, string> = {}
      result.error.errors.forEach((e) => { errs[e.path[0]] = e.message })
      setErrors(errs)
      return
    }
    setErrors({})
    initiateMutation.mutate()
  }

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Spinner className="w-8 h-8" /></div>
  if (!profile) return <div className="flex items-center justify-center min-h-screen"><p className="text-[#7c7c9a]">Creator not found</p></div>

  const totalAmount = profile.coffeePrice * coffeeCount

  return (
    <div className="flex min-h-screen flex-col pb-8">
      <div className="relative overflow-hidden rounded-b-[32px] border-b border-white/6 bg-[linear-gradient(180deg,rgba(245,158,11,0.22),rgba(14,14,28,0.9)_45%,rgba(7,7,15,1))] px-5 pb-6 pt-10">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.25),_transparent_60%)]" />
        <div className="relative flex flex-col items-center text-center">
          <Avatar src={profile.user.avatar} name={`${profile.user.firstName} ${profile.user.lastName}`} size="xl"
            className="ring-4 ring-[#0f0f14] shadow-xl" />
          <h1 className="text-xl font-bold text-[#e2e2f0] mt-3">{profile.pageTitle}</h1>
          <p className="text-sm text-[#7c7c9a] mt-1">@{profile.user.username}</p>
          {profile.user.bio && <p className="text-sm text-[#7c7c9a] mt-2 max-w-xs">{profile.user.bio}</p>}

          <div className="flex items-center gap-3 mt-3">
            <Badge variant="default"><Coffee className="w-3 h-3 mr-1" />{profile.totalSupports} supports</Badge>
            <Badge variant="default"><Heart className="w-3 h-3 mr-1" />{profile.totalSupporters} supporters</Badge>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 flex flex-col gap-4">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/6 bg-gradient-to-r from-amber-500/[0.08] to-transparent px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300/80">Support creator</p>
          </div>
          <div className="p-4">
          <p className="text-xs text-[#7c7c9a] font-medium mb-3">Buy {profile.user.firstName} a coffee</p>
          <div className="flex items-center gap-2 mb-4">
            {[1, 3, 5].map((n) => (
              <button key={n} onClick={() => { setCoffeeCount(n); haptic('light') }}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-all ${
                  coffeeCount === n ? 'bg-amber-500 text-black' : 'bg-[#1e1e2a] text-[#7c7c9a] border border-[#2a2a3a]'
                }`}>
                {'☕'.repeat(n)}
              </button>
            ))}
            <button onClick={() => { setCoffeeCount(10); haptic('light') }}
              className={`flex-1 py-2.5 rounded-[10px] text-sm font-semibold transition-all ${
                coffeeCount === 10 ? 'bg-amber-500 text-black' : 'bg-[#1e1e2a] text-[#7c7c9a] border border-[#2a2a3a]'
              }`}>
              ×10
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#7c7c9a]">{coffeeCount} × {formatETB(profile.coffeePrice)} ETB</span>
            <span className="font-bold text-amber-400 text-lg">{formatETB(totalAmount)} ETB</span>
          </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-col gap-4">
            <Input label="Your Name" placeholder="Abebe Bikila" value={name} onChange={(e) => setName(e.target.value)} error={errors.supporterName} />
            <Input label="Email (optional)" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.supporterEmail} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#7c7c9a] uppercase tracking-wider flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> Message (optional)
              </label>
              <textarea
                placeholder="Say something nice…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full bg-[#1e1e2a] border border-[#2a2a3a] rounded-[12px] px-4 py-3 text-sm text-[#e2e2f0] placeholder:text-[#4a4a6a] focus:outline-none focus:border-amber-500/60 resize-none"
              />
            </div>

            {initiateMutation.error && (
              <p className="text-xs text-red-400 text-center">{getApiErrorMessage(initiateMutation.error, 'Payment failed')}</p>
            )}

            <Button fullWidth size="lg" loading={initiateMutation.isPending} onClick={handleSupport}
              className="shadow-xl shadow-amber-500/20">
              <Coffee className="w-5 h-5" />
              Support with {formatETB(totalAmount)} ETB
            </Button>

            <p className="text-center text-[10px] text-[#4a4a6a] flex items-center justify-center gap-1">
              <ExternalLink className="w-3 h-3" /> Powered by Chapa · Secure payment
            </p>
          </div>
        </Card>
      </div>

      {supporters && supporters.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="mb-3 text-sm font-semibold text-[#e2e2f0]">Recent Supporters</h2>
          <div className="flex flex-col gap-2">
            {supporters.map((s) => (
              <Card key={s.id} className="p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 text-sm">
                  {'☕'.repeat(Math.min(s.coffeeCount, 3))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#e2e2f0]">{s.supporterName}</p>
                    <p className="text-xs text-[#4a4a6a]">{s.paidAt ? timeAgo(s.paidAt) : ''}</p>
                  </div>
                  {s.message && <p className="text-xs text-[#7c7c9a] mt-0.5 line-clamp-2">"{s.message}"</p>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
