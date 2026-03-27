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
  const authReady = useAuthStore((s) => s.authReady)
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!authReady) return
    if (isAuthenticated) { navigate('/home', { replace: true }); return }
    if (isInsideTelegram()) {
      const initData = getInitData()
      if (initData) telegramMutation.mutate(initData)
    }
  }, [authReady, isAuthenticated, navigate])

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
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-[28px] border border-white/[0.08] bg-[#0e0e1c]/95 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.4)] pulse-glow float">
          <Coffee className="w-10 h-10 text-black" strokeWidth={2.5} />
        </div>
        <div className="mt-6 text-center">
          <p className="text-white font-semibold text-[16px]">Signing in with Telegram</p>
          <p className="text-white/30 text-[13px] mt-1">Just a moment…</p>
        </div>
        <Spinner className="mx-auto mt-5 w-6 h-6" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-5 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-10 flex flex-col items-center gap-4 text-center fade-up">
          <div className="w-[68px] h-[68px] rounded-[20px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_8px_32px_rgba(245,158,11,0.3)]">
            <Coffee className="w-8 h-8 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[24px] font-bold text-white tracking-tight">Buy Me a Coffee</h1>
            <p className="mt-1 text-[13px] text-white/35">Support Ethiopian creators with a calmer, cleaner flow</p>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/[0.08] bg-[#0e0e1c]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="mb-6 flex rounded-2xl border border-white/[0.06] bg-white/[0.04] p-1">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); haptic('light') }}
                className={[
                  'flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all duration-200',
                  tab === t ? 'bg-amber-500 text-black shadow-[0_10px_24px_rgba(245,158,11,0.24)]' : 'text-white/35',
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
    </div>
  )
}
