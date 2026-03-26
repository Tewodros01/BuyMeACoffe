import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Coffee, Eye, EyeOff, Mail, Lock, User, AtSign } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { authApi, LoginSchema, RegisterSchema, type LoginInput, type RegisterInput } from './authApi'
import { useAuthStore } from '../../store/authStore'
import { getInitData, isInsideTelegram, haptic } from '../../lib/telegram'
import { Button } from '../../components/ui/Button'
import { Input, Spinner } from '../../components/ui/index'

export default function AuthPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (isAuthenticated) { navigate('/home', { replace: true }); return }
    if (isInsideTelegram()) {
      const initData = getInitData()
      if (initData) telegramMutation.mutate(initData)
    }
  }, [])

  const telegramMutation = useMutation({
    mutationFn: authApi.loginWithTelegram,
    onSuccess: (data) => { setAuth(data); haptic('success'); navigate(data.user.onboardingDone ? '/home' : '/onboarding', { replace: true }) },
  })

  const loginForm = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) })
  const registerForm = useForm<RegisterInput>({ resolver: zodResolver(RegisterSchema) })

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => { setAuth(data); haptic('success'); navigate(data.user.onboardingDone ? '/home' : '/onboarding', { replace: true }) },
  })

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => { setAuth(data); haptic('success'); navigate('/onboarding', { replace: true }) },
  })

  if (telegramMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-[#07070f]">
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.4)] pulse-glow float">
          <Coffee className="w-10 h-10 text-black" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-[16px]">Signing in with Telegram</p>
          <p className="text-white/30 text-[13px] mt-1">Just a moment…</p>
        </div>
        <Spinner className="w-6 h-6" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#07070f] relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[280px] h-[280px] rounded-full bg-amber-500/[0.07] blur-[80px] pointer-events-none" />

      <div className="flex-1 flex flex-col px-6 pt-14 pb-10 relative z-10">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-10 fade-up">
          <div className="w-[68px] h-[68px] rounded-[20px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_8px_32px_rgba(245,158,11,0.3)]">
            <Coffee className="w-8 h-8 text-black" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-[24px] font-bold text-white tracking-tight">Buy Me a Coffee</h1>
            <p className="text-[13px] text-white/30 mt-1">Support Ethiopian creators ☕</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-white/[0.04] rounded-2xl p-1 mb-6 border border-white/[0.06]">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); haptic('light') }}
              className={[
                'flex-1 py-2.5 text-[14px] font-semibold rounded-xl transition-all duration-200',
                tab === t ? 'bg-white/[0.09] text-white' : 'text-white/30',
              ].join(' ')}
            >
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <form onSubmit={loginForm.handleSubmit((d) => loginMutation.mutate(d))} className="flex flex-col gap-4 fade-up">
            <Input label="Email" type="email" placeholder="you@example.com"
              leftIcon={<Mail className="w-4 h-4" />}
              error={loginForm.formState.errors.email?.message}
              {...loginForm.register('email')} />
            <Input label="Password" type={showPassword ? 'text' : 'password'} placeholder="Your password"
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-white/25 hover:text-white/60 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={loginForm.formState.errors.password?.message}
              {...loginForm.register('password')} />
            {loginMutation.error && (
              <p className="text-[13px] text-red-400 text-center bg-red-500/[0.07] border border-red-500/15 rounded-xl py-3 px-4">
                {(loginMutation.error as any)?.response?.data?.message ?? 'Invalid credentials'}
              </p>
            )}
            <Button type="submit" fullWidth size="lg" loading={loginMutation.isPending} className="mt-1">Sign In</Button>
          </form>
        ) : (
          <form onSubmit={registerForm.handleSubmit((d) => registerMutation.mutate(d))} className="flex flex-col gap-4 fade-up">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" placeholder="Abebe" leftIcon={<User className="w-4 h-4" />}
                error={registerForm.formState.errors.firstName?.message} {...registerForm.register('firstName')} />
              <Input label="Last name" placeholder="Bikila"
                error={registerForm.formState.errors.lastName?.message} {...registerForm.register('lastName')} />
            </div>
            <Input label="Username" placeholder="abebe_bikila" leftIcon={<AtSign className="w-4 h-4" />}
              error={registerForm.formState.errors.username?.message} {...registerForm.register('username')} />
            <Input label="Email" type="email" placeholder="you@example.com" leftIcon={<Mail className="w-4 h-4" />}
              error={registerForm.formState.errors.email?.message} {...registerForm.register('email')} />
            <Input label="Password" type="password" placeholder="Min. 8 characters" leftIcon={<Lock className="w-4 h-4" />}
              error={registerForm.formState.errors.password?.message} {...registerForm.register('password')} />
            {registerMutation.error && (
              <p className="text-[13px] text-red-400 text-center bg-red-500/[0.07] border border-red-500/15 rounded-xl py-3 px-4">
                {(registerMutation.error as any)?.response?.data?.message ?? 'Registration failed'}
              </p>
            )}
            <Button type="submit" fullWidth size="lg" loading={registerMutation.isPending} className="mt-1">Create Account</Button>
          </form>
        )}
      </div>
    </div>
  )
}
