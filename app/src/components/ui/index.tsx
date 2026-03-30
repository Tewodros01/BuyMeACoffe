import { type HTMLAttributes, type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from './utils'
export { AppBar } from './AppBar'

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps extends HTMLAttributes<HTMLDivElement> { glow?: 'amber' | 'green' | 'blue' }
export function Card({ glow, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.07] bg-[#0e0e1c]',
        glow === 'amber' && 'border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.08)]',
        glow === 'green' && 'border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.08)]',
        glow === 'blue'  && 'border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.08)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string
  leftIcon?: React.ReactNode; rightIcon?: React.ReactNode
}
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-white/35 uppercase tracking-widest">{label}</label>}
      <div className="relative">
        {leftIcon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">{leftIcon}</span>}
        <input
          ref={ref}
          className={cn(
            'w-full h-[52px] rounded-2xl px-4 text-[15px] font-medium text-white',
            'bg-white/4 border border-white/8',
            'placeholder:text-white/20',
            'focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.06]',
            'transition-all duration-200',
            leftIcon && 'pl-11',
            rightIcon && 'pr-11',
            error && 'border-red-500/40 focus:border-red-500/60',
            className,
          )}
          {...props}
        />
        {rightIcon && <span className="absolute right-4 top-1/2 -translate-y-1/2">{rightIcon}</span>}
      </div>
      {error && <p className="text-[12px] text-red-400 font-medium">{error}</p>}
      {hint && !error && <p className="text-[12px] text-white/25">{hint}</p>}
    </div>
  ),
)
Input.displayName = 'Input'

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'default'
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { variant?: BadgeVariant; dot?: boolean }
export function Badge({ variant = 'default', dot, className, children, ...props }: BadgeProps) {
  const v: Record<BadgeVariant, string> = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    danger:  'bg-red-500/10 text-red-400 border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    info:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    default: 'bg-white/[0.06] text-white/40 border-white/8',
  }
  const d: Record<BadgeVariant, string> = {
    success: 'bg-emerald-400', danger: 'bg-red-400', warning: 'bg-amber-400', info: 'bg-blue-400', default: 'bg-white/30',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[11px] font-semibold border', v[variant], className)} {...props}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', d[variant])} />}
      {children}
    </span>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <div className={cn('w-5 h-5 rounded-full border-2 border-white/10 border-t-amber-400 animate-spin', className)} />
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
interface AvatarProps { src?: string | null; name?: string; size?: 'xs'|'sm'|'md'|'lg'|'xl'; className?: string }
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const s = { xs:'w-6 h-6 text-[9px]', sm:'w-8 h-8 text-[11px]', md:'w-10 h-10 text-[13px]', lg:'w-14 h-14 text-[17px]', xl:'w-20 h-20 text-[22px]' }
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?'
  return src
    ? <img src={src} alt={name} className={cn('rounded-full object-cover', s[size], className)} />
    : <div className={cn('rounded-full flex items-center justify-center font-bold text-black bg-linear-to-br from-amber-400 to-amber-600', s[size], className)}>{initials}</div>
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px bg-white/[0.05]', className)} />
}

// ─── Empty ────────────────────────────────────────────────────────────────────
export function Empty({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
      {icon && <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/6 flex items-center justify-center text-white/20 mb-1">{icon}</div>}
      <p className="text-[14px] font-semibold text-white/35">{title}</p>
      {description && <p className="text-[12px] text-white/20 max-w-[180px] leading-relaxed">{description}</p>}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest">{title}</p>
      {action}
    </div>
  )
}
