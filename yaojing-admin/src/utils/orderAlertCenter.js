import { ElNotification } from 'element-plus';
import { notifyIncomingOrderByAudio } from './alertAudio';

const SHORT_APP_TITLE = '\u66dc\u7ade\u540e\u53f0';
const NEW_ORDER_FLASH_PREFIX = '\u3010\u65b0\u8ba2\u5355\u3011';
const GENERIC_FLASH_PREFIX = '\u3010\u8ba2\u5355\u63d0\u9192\u3011';
const SYSTEM_NOTIFICATION_TITLE_NEW = '\u66dc\u7ade\u65b0\u8ba2\u5355\u63d0\u9192';
const SYSTEM_NOTIFICATION_TITLE_GENERIC = '\u66dc\u7ade\u8ba2\u5355\u63d0\u9192';
const PERMISSION_HINT_STORAGE_KEY = 'west-order-desktop-notify-hint-at';
const PERMISSION_HINT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const FLASH_INTERVAL_MS = 1000;
const MAX_BACKGROUND_QUEUE = 50;

let listenersBound = false;
let windowFocused = true;
let originalDocumentTitle = '';
let flashTimer = null;
let flashVisible = false;
let backgroundQueue = [];
let shouldReplayAudioOnReturn = false;
let shouldHintDesktopPermission = false;

let openOrderHandler = null;
let foregroundReturnHandler = null;
let permissionHintHandler = null;

function isCompletedAlertType(type = '') {
  return String(type || '').trim().toLowerCase().includes('completed');
}

function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && typeof window.Notification !== 'undefined';
}

function getDesktopNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return String(window.Notification.permission || 'default');
}

function isPageForeground() {
  if (typeof document === 'undefined') return true;
  return !document.hidden && windowFocused;
}

function normalizeAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function buildToastTitle(item = {}) {
  return isCompletedAlertType(item.type)
    ? `${item.store_name || '-'} \u5b8c\u5355\u63d0\u9192`
    : `${item.store_name || '-'} \u6765\u5355\u63d0\u9192`;
}

function buildToastMessage(item = {}) {
  const amountText = normalizeAmount(item.amount);
  if (isCompletedAlertType(item.type)) {
    return `${item.store_name || '-'}\u8ba2\u5355\u5b8c\u6210\uff1a${item.order_info || '-'}\uff0c\u91d1\u989d${amountText}`;
  }
  return `${item.store_name || '-'}\u6765\u5355\uff1a${item.order_info || '-'}\uff0c\u91d1\u989d${amountText}\uff0c\u8054\u7cfb\u65b9\u5f0f${item.contact || '-'}`;
}

function buildDesktopNotificationTitle(item = {}) {
  return isCompletedAlertType(item.type) ? SYSTEM_NOTIFICATION_TITLE_GENERIC : SYSTEM_NOTIFICATION_TITLE_NEW;
}

function buildDesktopNotificationBody(item = {}) {
  const lines = [
    item.store_name || '-',
    item.order_info || '-',
    `\u91d1\u989d ${normalizeAmount(item.amount)}`,
  ];

  if (item.contact && !isCompletedAlertType(item.type)) {
    lines.push(`\u8054\u7cfb\u65b9\u5f0f ${item.contact}`);
  }

  return lines.filter(Boolean).join('\n');
}

function rememberOriginalTitle() {
  if (typeof document === 'undefined') return;
  if (!flashTimer) {
    originalDocumentTitle = String(document.title || SHORT_APP_TITLE);
  }
}

function resolveFlashPrefix() {
  const latestItem = backgroundQueue[backgroundQueue.length - 1] || null;
  return latestItem && !isCompletedAlertType(latestItem.type) ? NEW_ORDER_FLASH_PREFIX : GENERIC_FLASH_PREFIX;
}

function buildFlashTitle() {
  const count = backgroundQueue.length;
  const prefix = resolveFlashPrefix();
  if (count > 1) {
    return `${prefix}${SHORT_APP_TITLE} x${count}`;
  }
  return `${prefix}${SHORT_APP_TITLE}`;
}

function applyFlashTitle() {
  if (typeof document === 'undefined') return;
  document.title = flashVisible ? buildFlashTitle() : SHORT_APP_TITLE;
}

function startTitleFlashing() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  rememberOriginalTitle();
  if (flashTimer) {
    applyFlashTitle();
    return;
  }

  flashVisible = true;
  applyFlashTitle();
  flashTimer = window.setInterval(() => {
    flashVisible = !flashVisible;
    applyFlashTitle();
  }, FLASH_INTERVAL_MS);
}

function stopTitleFlashing() {
  if (typeof window !== 'undefined' && flashTimer) {
    window.clearInterval(flashTimer);
  }
  flashTimer = null;
  flashVisible = false;

  if (typeof document !== 'undefined') {
    document.title = originalDocumentTitle || document.title || SHORT_APP_TITLE;
  }

  originalDocumentTitle = '';
}

function markPermissionHintShown() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PERMISSION_HINT_STORAGE_KEY, String(Date.now()));
  } catch {
    // best-effort cache
  }
}

function shouldShowPermissionHint() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = Number(window.localStorage.getItem(PERMISSION_HINT_STORAGE_KEY) || 0);
    return !Number.isFinite(raw) || raw <= 0 || Date.now() - raw >= PERMISSION_HINT_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function queueBackgroundItem(item) {
  backgroundQueue = [...backgroundQueue, item].slice(-MAX_BACKGROUND_QUEUE);
  shouldReplayAudioOnReturn = true;
}

function clearBackgroundQueue() {
  backgroundQueue = [];
  shouldReplayAudioOnReturn = false;
}

function openOrderFromNotification(item) {
  try {
    window.focus();
  } catch {
    // best effort
  }

  if (typeof openOrderHandler === 'function') {
    void Promise.resolve(openOrderHandler(item)).catch(() => null);
  }
}

function showForegroundToast(item) {
  ElNotification({
    title: buildToastTitle(item),
    message: buildToastMessage(item),
    duration: 9000,
    type: 'warning',
    position: 'top-right',
    offset: 78,
    onClick: () => openOrderFromNotification(item),
  });
}

function showDesktopNotification(item) {
  if (!isBrowserNotificationSupported()) return false;
  if (getDesktopNotificationPermission() !== 'granted') return false;

  try {
    const notification = new window.Notification(buildDesktopNotificationTitle(item), {
      body: buildDesktopNotificationBody(item),
      tag: `order-alert:${item.order_id || item.id || Date.now()}`,
      renotify: true,
      requireInteraction: true,
    });

    notification.onclick = () => {
      openOrderFromNotification(item);
      if (typeof notification.close === 'function') {
        notification.close();
      }
    };
    return true;
  } catch {
    return false;
  }
}

function flushBackgroundQueueOnReturn() {
  if (!isPageForeground()) return;

  const queuedCount = backgroundQueue.length;
  const latestItem = queuedCount ? backgroundQueue[queuedCount - 1] : null;
  const shouldReplay = shouldReplayAudioOnReturn;

  stopTitleFlashing();
  clearBackgroundQueue();

  if (shouldReplay) {
    notifyIncomingOrderByAudio();
  }

  if (latestItem && typeof foregroundReturnHandler === 'function') {
    foregroundReturnHandler({
      latestItem,
      count: queuedCount,
    });
  }

  if (
    shouldHintDesktopPermission &&
    getDesktopNotificationPermission() === 'default' &&
    typeof permissionHintHandler === 'function' &&
    shouldShowPermissionHint()
  ) {
    permissionHintHandler();
    markPermissionHintShown();
  }

  shouldHintDesktopPermission = false;
}

function handleVisibilityChange() {
  if (isPageForeground()) {
    flushBackgroundQueueOnReturn();
  }
}

function handleWindowFocus() {
  windowFocused = true;
  flushBackgroundQueueOnReturn();
}

function handleWindowBlur() {
  windowFocused = false;
}

function bindGlobalListeners() {
  if (listenersBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  listenersBound = true;
  windowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);
}

export function initOrderAlertCenter(options = {}) {
  openOrderHandler = typeof options.onOpenOrder === 'function' ? options.onOpenOrder : null;
  foregroundReturnHandler =
    typeof options.onForegroundReturn === 'function' ? options.onForegroundReturn : null;
  permissionHintHandler =
    typeof options.onDesktopPermissionHint === 'function' ? options.onDesktopPermissionHint : null;
  bindGlobalListeners();
}

export function dispatchIncomingOrderAlert(item = {}) {
  rememberOriginalTitle();

  if (isPageForeground()) {
    showForegroundToast(item);
    notifyIncomingOrderByAudio();
    return {
      foreground: true,
      background: false,
      pendingCount: backgroundQueue.length,
    };
  }

  queueBackgroundItem(item);
  startTitleFlashing();

  const permission = getDesktopNotificationPermission();
  if (permission === 'granted') {
    showDesktopNotification(item);
  } else if (permission === 'default') {
    shouldHintDesktopPermission = true;
  }

  return {
    foreground: false,
    background: true,
    pendingCount: backgroundQueue.length,
  };
}

export function requestDesktopNotificationPermission() {
  if (!isBrowserNotificationSupported()) {
    return Promise.resolve('unsupported');
  }

  if (window.Notification.permission !== 'default') {
    return Promise.resolve(window.Notification.permission);
  }

  return window.Notification.requestPermission().then((permission) => {
    shouldHintDesktopPermission = false;
    return permission;
  });
}

export function getOrderAlertCenterState() {
  return {
    desktopNotificationSupported: isBrowserNotificationSupported(),
    desktopNotificationPermission: getDesktopNotificationPermission(),
    pendingCount: backgroundQueue.length,
    pageForeground: isPageForeground(),
  };
}

export function isOrderAlertPageForeground() {
  return isPageForeground();
}

export function clearOrderAlertCenter() {
  stopTitleFlashing();
  clearBackgroundQueue();
  shouldHintDesktopPermission = false;
  openOrderHandler = null;
  foregroundReturnHandler = null;
  permissionHintHandler = null;
}
