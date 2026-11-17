/**
 * 零依赖的浏览器端加解密工具，基于 Web Crypto API（SubtleCrypto）。
 * 注意：Web Crypto 需要安全上下文（https 或 localhost）。
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/* ---------------- base64 工具 ---------------- */

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

/* ---------------- AES-GCM ---------------- */

async function deriveAesKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** 使用口令加密明文，返回 base64（内含随机 salt + iv + 密文） */
export async function aesEncrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  return toBase64(concatBytes(salt, iv, new Uint8Array(ciphertext)))
}

/** 解密 aesEncrypt 的输出 */
export async function aesDecrypt(payload: string, password: string): Promise<string> {
  const bytes = fromBase64(payload)
  const salt = bytes.subarray(0, 16)
  const iv = bytes.subarray(16, 28)
  const ciphertext = bytes.subarray(28)
  const key = await deriveAesKey(password, salt)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return decoder.decode(plain)
}

/* ---------------- RSA-OAEP ---------------- */

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s/g, '')
  return fromBase64(b64)
}

/**
 * 使用公钥（SPKI PEM）加密，返回 base64。
 * 注意：RSA-OAEP 只能加密小体积数据（2048 位密钥约 190 字节），适合加密密码、密钥等敏感短字段。
 */
export async function rsaEncrypt(plaintext: string, publicKeyPem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'spki',
    pemToDer(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
  const ciphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, encoder.encode(plaintext))
  return toBase64(new Uint8Array(ciphertext))
}

/** 使用私钥（PKCS8 PEM）解密 rsaEncrypt 的输出 */
export async function rsaDecrypt(cipherB64: string, privateKeyPem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  )
  const plain = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, fromBase64(cipherB64))
  return decoder.decode(plain)
}
