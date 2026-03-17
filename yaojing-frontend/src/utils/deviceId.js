import sharedDeviceId from '@shared/deviceId.js'

const {
  DEVICE_ID_BODY_FIELD,
  DEVICE_ID_HEADER,
  DEVICE_ID_STORAGE_KEY,
  isValidDeviceId,
  normalizeDeviceId,
} = sharedDeviceId

let memoryDeviceId = ''

function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function buildBrowserDeviceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return normalizeDeviceId(`yd-${crypto.randomUUID()}`)
  }

  const timestamp = Date.now().toString(36)
  const randomPart = `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`
  return normalizeDeviceId(`yd-${timestamp}-${randomPart}`)
}

export { DEVICE_ID_BODY_FIELD, DEVICE_ID_HEADER, DEVICE_ID_STORAGE_KEY, isValidDeviceId, normalizeDeviceId }

export function getStoredDeviceId() {
  const storage = getStorage()
  let persistedValue = memoryDeviceId

  try {
    persistedValue = storage?.getItem(DEVICE_ID_STORAGE_KEY) || memoryDeviceId
  } catch {
    persistedValue = memoryDeviceId
  }

  const normalized = normalizeDeviceId(persistedValue)

  if (!isValidDeviceId(normalized)) {
    try {
      storage?.removeItem(DEVICE_ID_STORAGE_KEY)
    } catch {
      // Ignore storage cleanup failures and fall back to memory state.
    }
    memoryDeviceId = ''
    return ''
  }

  memoryDeviceId = normalized
  return normalized
}

export function getOrCreateDeviceId() {
  const existingDeviceId = getStoredDeviceId()
  if (existingDeviceId) {
    return existingDeviceId
  }

  const nextDeviceId = buildBrowserDeviceId()
  memoryDeviceId = nextDeviceId

  try {
    getStorage()?.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId)
  } catch {
    // Ignore persistence failures and keep the generated id in memory.
  }

  return nextDeviceId
}
