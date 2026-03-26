import { NavLink } from 'react-router-dom'
import { Home, Wallet, Bell, Settings } from 'lucide-react'
import { cn } from './utils'

const tabs = [
  { to: '/home',          icon: Home,     label: 'Home'     },
  { to: '/wallet',        icon: Wallet,   label: 'Wallet'   },
  { to: '/notifications', icon: Bell,     label: 'Alerts'   },
  { to: '/settings',      icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto">
      <div className="bg-[#07070f]/90 backdrop-blur-2xl border-t border-white/[0.06] px-2 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="flex items-center justify-around">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className="flex-1">
              {({ isActive }) => (
                <div className="flex flex-col items-center gap-1 py-1">
                  <div className={cn(
                    'w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200',
                    isActive
                      ? 'bg-amber-500/15 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                      : '',
                  )}>
                    <Icon
                      className={cn('w-[22px] h-[22px] transition-colors duration-200', isActive ? 'text-amber-400' : 'text-white/20')}
                      strokeWidth={isActive ? 2.5 : 1.8}
                    />
                  </div>
                  <span className={cn('text-[10px] font-semibold transition-colors duration-200', isActive ? 'text-amber-400' : 'text-white/20')}>
                    {label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
