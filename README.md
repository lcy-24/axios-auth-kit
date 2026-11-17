# axios-auth-kit

Axios 增强工具库，把中后台项目里最常用的三个 HTTP 能力抽出来做成零依赖、可复用的拦截器：

1. **401 无感刷新 Token** —— 刷新期间并发请求自动排队，成功后统一重放
2. **重复请求去重** —— 防重复提交
3. **AES / RSA 前端加解密** —— 基于 Web Crypto，零依赖

全量 TypeScript，兼容 Axios 1.x。

## 安装

```bash
npm install axios-auth-kit
```

> peer 依赖：`axios >= 1.0.0`。

## 快速开始

```ts
import axios from 'axios'
import {
  setupRefreshAuth,
  setupRequestDedupe,
  aesEncrypt,
  rsaEncrypt,
} from 'axios-auth-kit'

const http = axios.create({ baseURL: '/api' })

// 1. 无感刷新：遇到 401 自动刷新 token 并重放请求
setupRefreshAuth(http, {
  refreshToken: async () => {
    const res = await axios.post('/auth/refresh', { refreshToken: getRefreshToken() })
    return res.data.accessToken
  },
  onRefreshFailed: () => {
    // 刷新失败 → 跳登录
    location.href = '/login'
  },
})

// 2. 防重复提交：300ms 内相同的请求会被拦截
setupRequestDedupe(http, { windowMs: 300 })
```

## API

### `setupRefreshAuth(instance, options)`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `isTokenExpired` | `(error: AxiosError) => boolean` | 自定义失效判定，默认 `status === 401` |
| `refreshToken` | `() => Promise<string \| null \| undefined>` | 刷新 token |
| `setToken` | `(config, token) => void` | 写回 token，默认写入 `Authorization: Bearer xxx` |
| `onRefreshFailed` | `(error) => void` | 刷新失败回调 |

### `setupRequestDedupe(instance, options?)`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `windowMs` | `number` | 去重窗口，默认 300ms |
| `key` | `(config) => string` | 自定义请求 key，默认按 method+url+params+data |

### `aesEncrypt(plaintext, password)` / `aesDecrypt(payload, password)`

基于 AES-256-GCM + PBKDF2 派生密钥的口令加解密，返回 / 接收 base64。

```ts
const cipher = await aesEncrypt('敏感数据', 'my-password')
const plain = await aesDecrypt(cipher, 'my-password')
```

### `rsaEncrypt(plaintext, publicKeyPem)` / `rsaDecrypt(cipher, privateKeyPem)`

基于 RSA-OAEP(SHA-256)。**注意：RSA 只能加密小体积数据**（2048 位密钥约 190 字节），适合加密密码、AES 密钥本身。

## 说明

- 加解密基于 Web Crypto API，需要安全上下文（`https` 或 `localhost`）。
- 典型用法：用 RSA 加密 AES 口令传输，业务数据用 AES 加密。

## License

MIT
