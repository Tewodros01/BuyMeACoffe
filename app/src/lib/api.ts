import axios from 'axios'
import { getInitData } from './telegram'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  timeout: 15000,
})

// Inject auth token + Telegram initData on every request
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('auth')
  if (raw) {
    try {
      const { access_token } = JSON.parse(raw) as { access_token: string }
      if (access_token) config.headers.Authorization = `Bearer ${access_token}`
    } catch { /* ignore */ }
  }

  const initData = getInitData()
  if (initData) config.headers['x-telegram-init-data'] = initData

  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const raw = localStorage.getItem('auth')
        if (!raw) throw new Error('no auth')
        const { refresh_token } = JSON.parse(raw) as { refresh_token: string }
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'}/auth/refresh`,
          { refresh_token },
        )
        localStorage.setItem('auth', JSON.stringify(data))
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        localStorage.removeItem('auth')
        window.location.href = '/auth'
      }
    }
    return Promise.reject(error)
  },
)
