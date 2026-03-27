import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Coffee, ArrowRight, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { creatorApi } from '../creator/creatorApi'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/index'
import { haptic } from '../../lib/telegram'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const [step, setStep] = useState(0)
  const [pageTitle, setPageTitle] = useState(`Buy ${user?.firstName} a coffee ☕`)
  const [coffeePrice, setCoffeePrice] = useState('50')
  const [thankYouMessage, setThankYouMessage] = useState('Thank you so much for your support! It means the world to me 🙏')

  const setupMutation = useMutation({
    mutationFn: () => creatorApi.getMyProfile().then(() =>
      creatorApi.updateProfile({
        pageTitle,
        coffeePrice: Number(coffeePrice),
        thankYouMessage,
      })
    ),
    onSuccess: () => {
      haptic('success')
      updateUser({ onboardingDone: true })
      navigate('/home', { replace: true })
    },
  })

  const steps = [
    {
      title: 'Welcome! 🎉',
      subtitle: `Hi ${user?.firstName}, let's set up your creator page`,
      content: (
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-500/30">
            <Coffee className="w-12 h-12 text-black" />
          </div>
          <div className="text-center">
            <p className="text-[#7c7c9a] text-sm leading-relaxed">
              Create your page and let your supporters buy you a coffee. It takes less than a minute.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Your Page',
      subtitle: 'Customize how your page looks',
      content: (
        <div className="flex flex-col gap-4">
          <Input label="Page Title" value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} placeholder="Buy me a coffee ☕" />
          <Input label="Coffee Price (ETB)" type="number" value={coffeePrice} onChange={(e) => setCoffeePrice(e.target.value)} placeholder="50" hint="Minimum 10 ETB" />
        </div>
      ),
    },
    {
      title: 'Thank You Message',
      subtitle: 'What do you want to say to your supporters?',
      content: (
        <div className="flex flex-col gap-3">
          <textarea
            value={thankYouMessage}
            onChange={(e) => setThankYouMessage(e.target.value)}
            rows={4}
            className="w-full bg-[#1e1e2a] border border-[#2a2a3a] rounded-[12px] px-4 py-3 text-sm text-[#e2e2f0] placeholder:text-[#4a4a6a] focus:outline-none focus:border-amber-500/60 resize-none"
          />
          <p className="text-xs text-[#4a4a6a]">This message is shown to supporters after they pay</p>
        </div>
      ),
    },
  ]

  const isLast = step === steps.length - 1
  const current = steps[step]

  return (
    <div className="flex min-h-screen flex-col px-5 py-8">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="mb-8 rounded-[28px] border border-white/[0.08] bg-[#0e0e1c]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="mb-6 flex gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= step ? 'bg-amber-500' : 'bg-white/[0.08]'}`} />
            ))}
          </div>

          <div className="mb-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/15 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
              Creator Setup
            </div>
            <h1 className="text-2xl font-bold text-[#e2e2f0]">{current.title}</h1>
            <p className="mt-1 text-sm text-[#7c7c9a]">{current.subtitle}</p>
          </div>

          <div>{current.content}</div>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          {setupMutation.error && (
            <p className="text-xs text-red-400 text-center">{(setupMutation.error as any)?.response?.data?.message ?? 'Setup failed'}</p>
          )}
          <Button
            fullWidth size="lg"
            loading={setupMutation.isPending}
            onClick={() => {
              if (isLast) { setupMutation.mutate() }
              else { haptic('light'); setStep(s => s + 1) }
            }}
          >
            {isLast ? <><Sparkles className="w-4 h-4" /> Launch My Page</> : <><ArrowRight className="w-4 h-4" /> Continue</>}
          </Button>
          {step > 0 && (
            <Button variant="ghost" fullWidth onClick={() => setStep(s => s - 1)}>Back</Button>
          )}
        </div>
      </div>
    </div>
  )
}
