import { CanceledError } from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

export interface RequestDedupeOptions {
  /** 去重窗口（毫秒），窗口内完全相同的请求会被拦截，默认 300ms */
  windowMs?: number
  /** 自定义请求 key，默认按 method + url + params + data 计算 */
  key?: (config: InternalAxiosRequestConfig) => string
}

/**
 * 给 Axios 实例挂上重复请求去重拦截器，用于「防重复提交」场景。
 * 在 windowMs 内重复发起的相同请求会被 CanceledError 拦截。
 */
export function setupRequestDedupe(
  instance: AxiosInstance,
  options: RequestDedupeOptions = {}
): void {
  const windowMs = options.windowMs ?? 300
  const pending = new Map<string, number>()

  instance.interceptors.request.use((config) => {
    const k = options.key ? options.key(config) : defaultKey(config)
    const now = Date.now()
    const last = pending.get(k)
    if (last !== undefined && now - last < windowMs) {
      return Promise.reject(new CanceledError('[axios-auth-kit] duplicate request cancelled'))
    }
    pending.set(k, now)
    setTimeout(() => {
      if (pending.get(k) === now) pending.delete(k)
    }, windowMs)
    return config
  })
}

function defaultKey(config: InternalAxiosRequestConfig): string {
  const params = config.params ? JSON.stringify(config.params) : ''
  let data = ''
  if (config.data != null) {
    data = typeof config.data === 'string' ? config.data : JSON.stringify(config.data)
  }
  return `${config.method ?? 'get'}:${config.url ?? ''}:${params}:${data}`
}
