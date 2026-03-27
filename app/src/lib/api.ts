import axios from 'axios'
import { getInitData } from './telegram'
import { useAuthStore } from '../store/authStore'

function getCookie(name: string) {
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  timeout: 15000,
  withCredentials: true,
})

// Inject CSRF header + Telegram initData on every request
api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCookie('bmac_csrf')
    if (csrf) config.headers['x-csrf-token'] = decodeURIComponent(csrf)
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
        await axios.post(
          `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: {
              'x-csrf-token': decodeURIComponent(getCookie('bmac_csrf') ?? ''),
            },
          },
        )
        return api(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/auth'
      }
    }
    return Promise.reject(error)
  },
)
