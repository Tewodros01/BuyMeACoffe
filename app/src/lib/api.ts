import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getInitData } from './telegram'
import { useAuthStore } from '../store/authStore'

type ApiErrorPayload = {
  message?: string
}

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'
let refreshRequest: Promise<void> | null = null

function getCookie(name: string) {
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
}

function getCsrfToken() {
  const csrf = getCookie('bmac_csrf')
  return csrf ? decodeURIComponent(csrf) : null
}

function attachSecurityHeaders(config: RetriableRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase()
  const headers = (config.headers ?? {}) as Record<string, string>

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken
    }
  }

  const initData = getInitData()
  if (initData) {
    headers['x-telegram-init-data'] = initData
  }

  config.headers = headers
  return config
}

async function refreshSession() {
  if (!refreshRequest) {
    refreshRequest = axios
      .post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: {
            ...(getCsrfToken() ? { 'x-csrf-token': getCsrfToken() } : {}),
          },
        },
      )
      .then(() => undefined)
      .finally(() => {
        refreshRequest = null
      })
  }

  return refreshRequest
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
})

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    return error.response?.data?.message ?? fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

api.interceptors.request.use((config) =>
  attachSecurityHeaders(config as RetriableRequestConfig),
)

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const axiosError = error as AxiosError<ApiErrorPayload>
    const original = axiosError.config as RetriableRequestConfig | undefined

    if (axiosError.response?.status === 401 && original && !original._retry) {
      original._retry = true

      try {
        await refreshSession()
        return api(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/auth'
      }
    }
    return Promise.reject(error)
  },
)
