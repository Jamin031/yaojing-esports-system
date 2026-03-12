const MANUAL_LOGOUT_STORAGE_KEY = 'west_manual_logout_until';
const DEFAULT_MANUAL_LOGOUT_GRACE_MS = 12 * 1000;

let manualLogoutUntil = 0;
let unauthorizedHandled = false;
const pendingRequestControllers = new Set();

function readManualLogoutUntil() {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.sessionStorage.getItem(MANUAL_LOGOUT_STORAGE_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeManualLogoutUntil(timestamp) {
  if (typeof window === 'undefined') return;
  try {
    if (timestamp > 0) {
      window.sessionStorage.setItem(MANUAL_LOGOUT_STORAGE_KEY, String(timestamp));
    } else {
      window.sessionStorage.removeItem(MANUAL_LOGOUT_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function now() {
  return Date.now();
}

export function markManualLogoutInProgress(graceMs = DEFAULT_MANUAL_LOGOUT_GRACE_MS) {
  const duration = Number.isFinite(Number(graceMs)) ? Number(graceMs) : DEFAULT_MANUAL_LOGOUT_GRACE_MS;
  manualLogoutUntil = now() + Math.max(1000, duration);
  writeManualLogoutUntil(manualLogoutUntil);
}

export function clearManualLogoutFlag() {
  manualLogoutUntil = 0;
  writeManualLogoutUntil(0);
}

export function isManualLogoutInProgress() {
  const deadline = Math.max(manualLogoutUntil, readManualLogoutUntil());
  return deadline > now();
}

export function registerPendingRequestController(controller) {
  if (!controller || typeof controller.abort !== 'function') return;
  pendingRequestControllers.add(controller);
}

export function unregisterPendingRequestController(controller) {
  if (!controller) return;
  pendingRequestControllers.delete(controller);
}

export function abortAllPendingRequests(reason = 'manual-logout') {
  pendingRequestControllers.forEach((controller) => {
    try {
      controller.abort(reason);
    } catch {
      // ignore abort failures
    }
  });
  pendingRequestControllers.clear();
}

export function markUnauthorizedHandled() {
  if (unauthorizedHandled) return false;
  unauthorizedHandled = true;
  return true;
}

export function resetUnauthorizedHandled() {
  unauthorizedHandled = false;
}
