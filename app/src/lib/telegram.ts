import WebApp from '@twa-dev/sdk'

export const tg = WebApp

export function initTelegram() {
  try {
    WebApp.ready()
    WebApp.expand()
    WebApp.setHeaderColor('#0f0f14')
    WebApp.setBackgroundColor('#0f0f14')
  } catch {
    // Running outside Telegram — dev mode
  }
}

export function getInitData(): string {
  try {
    return WebApp.initData ?? ''
  } catch {
    return ''
  }
}

export function getTelegramUser() {
  try {
    return WebApp.initDataUnsafe?.user ?? null
  } catch {
    return null
  }
}

export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  try {
    if (type === 'success') {
      WebApp.HapticFeedback.notificationOccurred('success')
    } else if (type === 'error') {
      WebApp.HapticFeedback.notificationOccurred('error')
    } else {
      WebApp.HapticFeedback.impactOccurred(type)
    }
  } catch {
    // not available
  }
}

export function isInsideTelegram(): boolean {
  try {
    return Boolean(WebApp.initData)
  } catch {
    return false
  }
}
