import sharedFingerprint from '@shared/fingerprint.js'

const {
  FINGERPRINT_HASH_BODY_FIELD,
  FINGERPRINT_HASH_HEADER,
  isValidFingerprintHash,
  normalizeFingerprintHash
} = sharedFingerprint

let cachedFingerprintPromise = null

function safeWindowValue(getter, fallback = '') {
  try {
    const value = getter()
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

function getCanvasSignature() {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 280
    canvas.height = 60
    const context = canvas.getContext('2d')
    if (!context) return ''

    context.textBaseline = 'top'
    context.font = "14px 'Segoe UI'"
    context.fillStyle = '#f60'
    context.fillRect(8, 8, 90, 18)
    context.fillStyle = '#123456'
    context.fillText('yaojing-fingerprint', 10, 10)
    context.strokeStyle = '#0a84ff'
    context.strokeRect(6, 6, 120, 24)
    return canvas.toDataURL().slice(0, 160)
  } catch {
    return ''
  }
}

function getWebglRenderer() {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl') ||
      canvas.getContext('webgl2')
    if (!gl) return ''

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (!debugInfo) return String(gl.getParameter(gl.RENDERER) || '')

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    return [vendor, renderer].filter(Boolean).join('::')
  } catch {
    return ''
  }
}

function stableStringify(parts = {}) {
  return Object.keys(parts)
    .sort()
    .map((key) => `${key}:${String(parts[key] ?? '')}`)
    .join('|')
}

function fallbackHash(text) {
  let hash = 2166136261
  const input = String(text || '')
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv${(hash >>> 0).toString(16).padStart(8, '0')}`
}

async function sha256Hex(text) {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') {
    return fallbackHash(text)
  }

  const encoded = new TextEncoder().encode(String(text || ''))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

function collectFingerprintParts() {
  const screenInfo = safeWindowValue(() => {
    const { width = 0, height = 0, colorDepth = 0, pixelDepth = 0 } = window.screen || {}
    return `${width}x${height}:${colorDepth}:${pixelDepth}`
  })

  return {
    ua: safeWindowValue(() => navigator.userAgent, ''),
    lang: safeWindowValue(() => navigator.language || navigator.languages?.join(','), ''),
    tz: safeWindowValue(() => Intl.DateTimeFormat().resolvedOptions().timeZone, ''),
    screen: screenInfo,
    platform: safeWindowValue(() => navigator.platform, ''),
    cores: safeWindowValue(() => navigator.hardwareConcurrency, ''),
    memory: safeWindowValue(() => navigator.deviceMemory, ''),
    webgl: getWebglRenderer(),
    canvas: getCanvasSignature()
  }
}

export async function collectFingerprint() {
  try {
    const parts = collectFingerprintParts()
    const base = stableStringify(parts)
    const fingerprintHash = normalizeFingerprintHash(await sha256Hex(base))
    if (!isValidFingerprintHash(fingerprintHash)) {
      return {
        ok: false,
        fingerprintHash: '',
        status: 'failed',
        error: 'invalid_hash',
        parts
      }
    }

    return {
      ok: true,
      fingerprintHash,
      status: 'ready',
      error: '',
      parts
    }
  } catch (error) {
    return {
      ok: false,
      fingerprintHash: '',
      status: 'failed',
      error: String(error?.message || 'fingerprint_failed').slice(0, 120),
      parts: {}
    }
  }
}

export async function getOrderFingerprintPayload() {
  if (!cachedFingerprintPromise) {
    cachedFingerprintPromise = collectFingerprint()
  }

  const result = await cachedFingerprintPromise
  return {
    [FINGERPRINT_HASH_BODY_FIELD]: result.ok ? result.fingerprintHash : '',
    fingerprint_status: result.status,
    fingerprint_error: result.ok ? '' : result.error
  }
}

export { FINGERPRINT_HASH_BODY_FIELD, FINGERPRINT_HASH_HEADER, isValidFingerprintHash, normalizeFingerprintHash }
