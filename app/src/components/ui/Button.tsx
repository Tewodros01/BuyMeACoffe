import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { haptic } from '../../lib/telegram'
import { cn } from './utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, className, children, onClick, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold select-none transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none rounded-2xl'

    const variants = {
      primary:   'bg-gradient-to-b from-amber-400 to-amber-500 text-black shadow-[0_8px_20px_rgba(245,158,11,0.25)] hover:shadow-[0_8px_24px_rgba(245,158,11,0.35)] hover:from-amber-300 hover:to-amber-400',
      secondary: 'bg-white/[0.06] text-white/80 border border-white/[0.09] hover:bg-white/[0.1] hover:text-white',
      ghost:     'bg-transparent text-white/50 hover:text-white hover:bg-white/[0.05]',
      danger:    'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15',
      outline:   'bg-transparent border border-amber-500/30 text-amber-400 hover:bg-amber-500/[0.08] hover:border-amber-500/50',
    }

    const sizes = {
      sm: 'h-9 px-4 text-[13px]',
      md: 'h-[52px] px-6 text-[15px]',
      lg: 'h-[56px] px-8 text-[15px] font-bold',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
        onClick={(e) => { haptic('light'); onClick?.(e) }}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
      </button>
    )
  },
)
Button.displayName = 'Button'
