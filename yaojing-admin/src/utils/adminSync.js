const ADMIN_SYNC_EVENT = 'west-admin-sync';
const ADMIN_SYNC_STORAGE_KEY = 'west-admin-sync-pulse';
const SYNC_SOURCE = `west-admin-${Math.random().toString(36).slice(2, 10)}`;
const storageHandlerMap = new WeakMap();

function buildSyncDetail(reason = 'data-updated', extra = {}) {
  return {
    reason,
    time: Date.now(),
    source: SYNC_SOURCE,
    ...extra,
  };
}

function parseSyncDetail(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

export function emitAdminSync(reason = 'data-updated', extra = {}) {
  if (typeof window === 'undefined') return;
  const detail = buildSyncDetail(reason, extra);
  window.dispatchEvent(new CustomEvent(ADMIN_SYNC_EVENT, { detail }));
  try {
    window.localStorage.setItem(ADMIN_SYNC_STORAGE_KEY, JSON.stringify(detail));
  } catch (error) {
    // best-effort cross-tab sync
  }
}

export function onAdminSync(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return;
  if (storageHandlerMap.has(handler)) return;

  window.addEventListener(ADMIN_SYNC_EVENT, handler);

  const storageHandler = (event) => {
    if (event?.key !== ADMIN_SYNC_STORAGE_KEY || !event.newValue) return;
    const detail = parseSyncDetail(event.newValue);
    if (!detail || detail.source === SYNC_SOURCE) return;
    handler({ detail, type: ADMIN_SYNC_EVENT });
  };

  storageHandlerMap.set(handler, storageHandler);
  window.addEventListener('storage', storageHandler);
}

export function offAdminSync(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return;
  window.removeEventListener(ADMIN_SYNC_EVENT, handler);
  const storageHandler = storageHandlerMap.get(handler);
  if (storageHandler) {
    window.removeEventListener('storage', storageHandler);
    storageHandlerMap.delete(handler);
  }
}

export function isSelfAdminSyncEvent(event) {
  return String(event?.detail?.source || '') === SYNC_SOURCE;
}
