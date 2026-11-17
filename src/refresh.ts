import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

export interface RefreshAuthOptions {
  /** 自定义 token 失效判定，默认响应状态码为 401 */
  isTokenExpired?: (error: AxiosError) => boolean
  /** 刷新 token，返回新 token；返回 null/undefined 视为刷新失败 */
  refreshToken: () => Promise<string | null | undefined>
  /** 如何把新 token 写回请求配置，默认写入 Authorization 头 */
  setToken?: (config: InternalAxiosRequestConfig, token: string) => void
  /** 刷新失败回调 */
  onRefreshFailed?: (error: unknown) => void
}

type Resolver = (token: string) => void
type Rejecter = (reason?: unknown) => void

const defaultSetToken = (config: InternalAxiosRequestConfig, token: string) => {
  if (config.headers && typeof config.headers.set === 'function') {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
}

/**
 * 给 Axios 实例挂上 401 无感刷新拦截器。
 * - 遇到 token 失效时自动调用 refreshToken 刷新
 * - 刷新期间的其他并发请求会排队，刷新成功后统一用新 token 重放
 * - 刷新失败时统一 reject，并触发 onRefreshFailed
 */
export function setupRefreshAuth(instance: AxiosInstance, options: RefreshAuthOptions): void {
  let refreshing = false
  let queue: Array<{ resolve: Resolver; reject: Rejecter }> = []

  const setToken = options.setToken ?? defaultSetToken

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig | undefined
      const expired = options.isTokenExpired
        ? options.isTokenExpired(error)
        : error.response?.status === 401

      if (!expired || !config) return Promise.reject(error)

      // 已有刷新在进行中，本次请求排队等待新 token
      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({
            resolve: (token: string) => {
              setToken(config, token)
              resolve(instance(config))
            },
            reject,
          })
        })
      }

      refreshing = true
      try {
        const token = await options.refreshToken()
        if (token) {
          queue.forEach((item) => item.resolve(token))
          queue = []
          setToken(config, token)
          return instance(config)
        }
        const err = new Error('[axios-auth-kit] refreshToken returned an empty token')
        queue.forEach((item) => item.reject(err))
        queue = []
        options.onRefreshFailed?.(err)
        return Promise.reject(err)
      } catch (err) {
        queue.forEach((item) => item.reject(err))
        queue = []
        options.onRefreshFailed?.(err)
        return Promise.reject(err)
      } finally {
        refreshing = false
      }
    }
  )
}
