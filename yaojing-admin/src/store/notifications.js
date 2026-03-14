import { defineStore } from 'pinia';
import { ElNotification } from 'element-plus';
import {
  getOrderNotificationsApi,
  markOrderNotificationReadApi,
} from '../api/notifications';
import { getList, getPayloadObject } from '../utils/api';
import {
  getIncomingOrderAudioVolume,
  getIncomingOrderAudioVolumeRange,
  setIncomingOrderAudioVolume,
  setupIncomingOrderAudio,
} from '../utils/alertAudio';
import {
  hasAnyPermissionByKeys,
  hasExplicitPermissionCollection,
  normalizeRole,
} from '../utils/permissionAccess';
import { NOTIFICATION_AUDIO_VIEW_KEYS } from '../utils/viewPermissionKeys';
import { connectSocket, getSocket } from '../utils/socket';
import { emitAdminSync } from '../utils/adminSync';
import {
  clearOrderAlertCenter,
  dispatchIncomingOrderAlert,
  getOrderAlertCenterState,
  initOrderAlertCenter,
  isOrderAlertPageForeground,
  requestDesktopNotificationPermission,
} from '../utils/orderAlertCenter';

const POLLING_INTERVAL = 5000;
const MAX_UNREAD_ITEMS = 80;
const MAX_MEMORY_KEYS = 500;
const SEEN_STAMP_STORAGE_KEY = 'west-notify-last-seen-stamp';
const LOCAL_READ_KEYS_STORAGE_KEY = 'west-notify-local-read-keys';

let activeSocket = null;
let socketConnectHandler = null;
let socketOrderCreatedHandler = null;

function parseTime(value) {
  if (!value) return 0;
  const stamp = new Date(value).getTime();
  return Number.isNaN(stamp) ? 0 : stamp;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      return trimmed;
    }
    return value;
  }
  return '';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const text = normalizeText(value);
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function normalizeAmount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function displayAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function normalizeCreatedAt(value) {
  const raw = firstNonEmpty(value);
  if (!raw) return new Date().toLocaleString();
  const stamp = parseTime(raw);
  if (!stamp) return String(raw);
  return new Date(stamp).toLocaleString();
}

function isUnreadRaw(raw) {
  if (!raw || typeof raw !== 'object') return false;

  const unreadValue = firstNonEmpty(raw.unread, raw.is_unread, raw.isUnread, raw.unread_flag, raw.unreadFlag);
  if (unreadValue !== '') {
    return toBoolean(unreadValue, true);
  }

  const readValue = firstNonEmpty(raw.read, raw.is_read, raw.isRead, raw.has_read, raw.hasRead);
  if (readValue !== '') {
    return !toBoolean(readValue, false);
  }

  if (firstNonEmpty(raw.read_at, raw.readAt, raw.read_time, raw.readTime, '') !== '') {
    return false;
  }

  return true;
}

function trimUnique(list) {
  if (!Array.isArray(list)) return [];

  const merged = [];
  const seen = new Set();

  list.forEach((item) => {
    if (item === null || item === undefined || item === '') return;
    const key = String(item);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(key);
  });

  return merged.slice(0, MAX_MEMORY_KEYS);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNotification(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const storeName = firstNonEmpty(
    raw.store_name,
    raw.storeName,
    raw.netbar_name,
    raw.netbarName,
    raw.source_store_name,
    raw.sourceStoreName,
    raw.shop_name,
    raw.shopName,
    raw.domain_prefix,
    raw.subdomain,
    raw.source_identifier,
    raw.sourceIdentifier,
    raw.store_key,
    raw.storeKey,
    raw.store,
    '-',
  );

  const contact = firstNonEmpty(
    raw.contact,
    raw.phone,
    raw.mobile,
    raw.tel,
    raw.contact_phone,
    raw.contactPhone,
    raw.user_phone,
    raw.userPhone,
    '-',
  );

  const orderInfo = firstNonEmpty(
    raw.order_info,
    raw.orderInfo,
    raw.order_title,
    raw.orderTitle,
    raw.service_name,
    raw.serviceName,
    raw.item_name,
    raw.itemName,
    raw.remark,
    raw.note,
    raw.title,
    raw.description,
    '-',
  );

  const amount = normalizeAmount(
    firstNonEmpty(
      raw.amount,
      raw.order_amount,
      raw.orderAmount,
      raw.total_amount,
      raw.totalAmount,
      raw.pay_amount,
      raw.payAmount,
      raw.price,
      raw.total_price,
      raw.totalPrice,
      0,
    ),
  );

  const orderId = firstNonEmpty(
    raw.order_id,
    raw.orderId,
    raw.biz_order_id,
    raw.bizOrderId,
    raw.online_order_id,
    raw.onlineOrderId,
    raw.source_order_id,
    raw.sourceOrderId,
    raw.trade_no,
    raw.tradeNo,
    raw.biz_no,
    raw.bizNo,
    raw.sn,
    raw.uuid,
    null,
  );
  const notifyId = firstNonEmpty(raw.notification_id, raw.notificationId, raw.notify_id, raw.notifyId, raw.id, null);
  const createdRaw = firstNonEmpty(
    raw.created_at,
    raw.createdAt,
    raw.created_time,
    raw.createdTime,
    raw.order_time,
    raw.orderTime,
    raw.submit_time,
    raw.submitTime,
    raw.pay_time,
    raw.payTime,
    '',
  );

  const key = String(
    firstNonEmpty(
      orderId,
      notifyId,
      raw.order_no,
      raw.orderNo,
      raw.channel_order_no,
      raw.channelOrderNo,
      `${createdRaw}-${storeName}-${contact}-${amount}-${orderInfo}-${firstNonEmpty(
        raw.source,
        raw.source_type,
        raw.sourceType,
        raw.channel,
        raw.order_channel,
        raw.orderChannel,
        '',
      )}`,
    ),
  );

  return {
    id: key,
    notify_id: notifyId ? String(notifyId) : null,
    order_id: orderId ? String(orderId) : null,
    type: String(firstNonEmpty(raw.type, raw.notification_type, raw.notificationType, 'order_created') || 'order_created')
      .trim()
      .toLowerCase(),
    order_no: String(firstNonEmpty(raw.order_no, raw.orderNo, orderId, '-')),
    store_name: String(storeName || '-'),
    amount,
    contact: String(contact || '-'),
    order_info: String(orderInfo || '-'),
    created_at: normalizeCreatedAt(createdRaw),
    created_stamp: parseTime(createdRaw),
    read: false,
  };
}

function collectRowsFromPayload(payload, collector, depth = 0) {
  if (!isObject(payload) || depth > 2) return;

  const arrayCandidates = [
    payload.unread,
    payload.unread_list,
    payload.unreadList,
    payload.notifications,
    payload.notify_list,
    payload.notifyList,
    payload.orders,
    payload.order_list,
    payload.orderList,
    payload.online_orders,
    payload.onlineOrders,
    payload.online_unread,
    payload.onlineUnread,
    payload.unread_orders,
    payload.unreadOrders,
    payload.unread_online_orders,
    payload.unreadOnlineOrders,
    payload.items,
    payload.rows,
    payload.records,
    payload.list,
    payload.result,
    payload.data,
  ];

  arrayCandidates.forEach((item) => {
    if (Array.isArray(item) && item.length) {
      collector.push(...item);
    }
  });

  const singleCandidates = [payload.order, payload.notification, payload.item];
  singleCandidates.forEach((item) => {
    if (isObject(item)) {
      collector.push(item);
    }
  });

  if (payload.order_id || payload.orderId || payload.notification_id || payload.notify_id || payload.id) {
    collector.push(payload);
  }

  const nestedCandidates = [
    payload.data,
    payload.result,
    payload.payload,
    payload.online,
    payload.offline,
    payload.unread_map,
    payload.notify_data,
    payload.notification_data,
    payload.notificationData,
  ];

  nestedCandidates.forEach((item) => {
    if (isObject(item)) {
      collectRowsFromPayload(item, collector, depth + 1);
    }
  });
}

function extractRows(response) {
  const collected = [];

  const list = getList(response);
  if (list.length) {
    collected.push(...list);
  }

  const payload = getPayloadObject(response);
  if (!payload || typeof payload !== 'object') return collected;

  collectRowsFromPayload(payload, collected);

  if (!collected.length) return [];

  const unique = [];
  const seen = new Set();
  collected.forEach((item) => {
    if (!isObject(item)) return;
    const key = String(
      firstNonEmpty(
        item.notification_id,
        item.notificationId,
        item.notify_id,
        item.notifyId,
        item.order_id,
        item.orderId,
        item.online_order_id,
        item.onlineOrderId,
        item.id,
        `${firstNonEmpty(item.created_at, item.createdAt, item.created_time, item.createdTime, '')}-${firstNonEmpty(
          item.contact,
          item.phone,
          '',
        )}-${firstNonEmpty(item.order_info, item.orderInfo, '')}`,
      ),
    );
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  return unique;
}

function resolveUserId(userInfo) {
  if (!userInfo || typeof userInfo !== 'object') return '';
  const value = firstNonEmpty(userInfo.id, userInfo.user_id, userInfo.userId, userInfo.uid, userInfo.account_id, userInfo.accountId, '');
  return value === '' ? '' : String(value);
}

function seenStampStorageKey(sessionKey) {
  return `${SEEN_STAMP_STORAGE_KEY}:${sessionKey}`;
}

function readSeenStamp(sessionKey) {
  if (typeof window === 'undefined' || !sessionKey) return Date.now();
  try {
    const key = seenStampStorageKey(sessionKey);
    const raw = window.localStorage.getItem(key);
    const value = Number(raw || 0);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }

    const now = Date.now();
    window.localStorage.setItem(key, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function writeSeenStamp(sessionKey, stamp) {
  if (typeof window === 'undefined' || !sessionKey || !Number.isFinite(stamp) || stamp <= 0) return;
  try {
    window.localStorage.setItem(seenStampStorageKey(sessionKey), String(stamp));
  } catch {
    // best-effort cache
  }
}

function localReadStorageKey(sessionKey) {
  return `${LOCAL_READ_KEYS_STORAGE_KEY}:${sessionKey}`;
}

function readLocalReadKeys(sessionKey) {
  if (typeof window === 'undefined' || !sessionKey) return [];
  try {
    const raw = window.localStorage.getItem(localReadStorageKey(sessionKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return trimUnique(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function writeLocalReadKeys(sessionKey, keys) {
  if (typeof window === 'undefined' || !sessionKey) return;
  try {
    window.localStorage.setItem(localReadStorageKey(sessionKey), JSON.stringify(trimUnique(keys)));
  } catch {
    // best-effort cache
  }
}

function buildLocalReadKeys(item) {
  if (!item || typeof item !== 'object') return [];
  const keys = [];

  const pushKey = (prefix, value) => {
    if (value === null || value === undefined || value === '') return;
    keys.push(`${prefix}:${String(value)}`);
  };

  pushKey('id', item.id);
  pushKey('notify', item.notify_id || item.notification_id);
  pushKey('order', item.order_id);
  pushKey('orderNo', item.order_no);
  return trimUnique(keys);
}

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [],
    unread: 0,
    initialized: false,
    role: '',
    userInfo: null,
    userId: '',
    polling: false,
    pollingTimer: null,
    sessionKey: '',
    displayedKeys: [],
    lastSeenStamp: 0,
    localReadKeys: [],
    audioVolume: getIncomingOrderAudioVolume(),
    audioVolumeRange: getIncomingOrderAudioVolumeRange(),
    desktopNotificationSupported: false,
    desktopNotificationPermission: 'unsupported',
    backgroundAttentionCount: 0,
    needsFollowUpPoll: false,
  }),
  actions: {
    canUseNotification(overrideUserInfo = null, overrideRole = '') {
      const role = normalizeRole(overrideRole || this.role);
      const userInfo = overrideUserInfo || this.userInfo;
      if (!role) return false;
      const explicitViewPermission = hasExplicitPermissionCollection(userInfo, 'views');
      if (!explicitViewPermission) {
        return ['super_admin', 'admin'].includes(role);
      }
      return hasAnyPermissionByKeys(userInfo, role, 'views', NOTIFICATION_AUDIO_VIEW_KEYS);
    },
    addDisplayedKey(key) {
      if (!key) return;
      this.displayedKeys = trimUnique([String(key), ...this.displayedKeys]);
    },
    isDisplayedKey(key) {
      if (!key) return false;
      return this.displayedKeys.includes(String(key));
    },
    isLocallyRead(item) {
      if (!item) return false;
      const readKeys = buildLocalReadKeys(item);
      if (!readKeys.length) return false;
      return readKeys.some((key) => this.localReadKeys.includes(key));
    },
    rememberLocallyRead(item) {
      const readKeys = buildLocalReadKeys(item);
      if (!readKeys.length) return;
      this.localReadKeys = trimUnique([...readKeys, ...this.localReadKeys]);
      writeLocalReadKeys(this.sessionKey, this.localReadKeys);
    },
    setAudioVolume(value) {
      const profileKey = this.sessionKey || `${this.role}:${this.userId || 'anonymous'}`;
      this.audioVolume = setIncomingOrderAudioVolume(value, profileKey);
      return this.audioVolume;
    },
    syncAlertCenterState() {
      const runtimeState = getOrderAlertCenterState();
      this.desktopNotificationSupported = Boolean(runtimeState.desktopNotificationSupported);
      this.desktopNotificationPermission = runtimeState.desktopNotificationPermission || 'unsupported';
      this.backgroundAttentionCount = Number(runtimeState.pendingCount || 0);
    },
    promptDesktopPermissionHint() {
      ElNotification({
        title: '建议开启系统通知',
        message: '为减少后台挂页漏单，请在右上角提醒面板里开启系统通知。',
        type: 'info',
        duration: 8000,
        position: 'top-right',
        offset: 78,
      });
    },
    async requestDesktopPermissionAccess() {
      const permission = await requestDesktopNotificationPermission();
      this.syncAlertCenterState();
      return permission;
    },
    emitIncomingOrderSync(item, source = 'order-alert') {
      if (!item?.order_id) return;
      emitAdminSync('order-alert-received', {
        focus_order_id: String(item.order_id),
        focus_at: String(Date.now()),
        allow_same_tab: true,
        source_type: source,
      });
    },
    bindRealtimeChannel(token, router) {
      if (!token) return;

      const socket = connectSocket(token);
      if (!socket) return;

      const prevSocket = activeSocket || getSocket();
      if (prevSocket && socketConnectHandler) {
        prevSocket.off('connect', socketConnectHandler);
      }
      if (prevSocket && socketOrderCreatedHandler) {
        prevSocket.off('order:new', socketOrderCreatedHandler);
      }

      activeSocket = socket;
      socketConnectHandler = () => {
        this.pollNewOrders(router);
      };
      socketOrderCreatedHandler = () => {
        this.pollNewOrders(router);
      };

      socket.on('connect', socketConnectHandler);
      socket.on('order:new', socketOrderCreatedHandler);
    },
    unbindRealtimeChannel() {
      const socket = activeSocket || getSocket();
      if (socket && socketConnectHandler) {
        socket.off('connect', socketConnectHandler);
      }
      if (socket && socketOrderCreatedHandler) {
        socket.off('order:new', socketOrderCreatedHandler);
      }

      activeSocket = null;
      socketConnectHandler = null;
      socketOrderCreatedHandler = null;
    },
    shouldIncludeByRole(raw) {
      if (!isUnreadRaw(raw)) return false;
      // 线上/线下订单统一提醒，不做前端来源过滤。
      return this.canUseNotification();
    },
    syncSeenStamp(items) {
      const maxStamp = (items || []).reduce((max, item) => {
        const stamp = Number(item?.created_stamp || 0);
        if (!Number.isFinite(stamp)) return max;
        return Math.max(max, stamp);
      }, this.lastSeenStamp || 0);

      if (maxStamp > (this.lastSeenStamp || 0)) {
        this.lastSeenStamp = maxStamp;
        writeSeenStamp(this.sessionKey, this.lastSeenStamp);
      }
    },
    syncItemsFromRows(rows, router) {
      const mergedMap = new Map();

      rows.forEach((row) => {
        if (!this.shouldIncludeByRole(row)) return;
        const item = normalizeNotification(row);
        if (!item || !item.id) return;
        if (this.isLocallyRead(item)) return;
        if (mergedMap.has(item.id)) return;
        mergedMap.set(item.id, item);
      });

      const nextItems = Array.from(mergedMap.values())
        .sort((a, b) => (b.created_stamp || 0) - (a.created_stamp || 0))
        .slice(0, MAX_UNREAD_ITEMS);

      const prevSet = new Set(this.items.map((item) => String(item.id)));

      this.items = nextItems;
      this.unread = nextItems.length;

      nextItems
        .filter((item) => {
          if (prevSet.has(String(item.id))) return false;
          if (this.isDisplayedKey(item.id)) return false;

          const stamp = Number(item.created_stamp || 0);
          if (!Number.isFinite(stamp) || stamp <= 0) return true;
          return stamp > Number(this.lastSeenStamp || 0);
        })
        .sort((a, b) => (a.created_stamp || 0) - (b.created_stamp || 0))
        .forEach((item) => {
          this.addDisplayedKey(item.id);
          const alertResult = dispatchIncomingOrderAlert(item);
          this.syncAlertCenterState();

          if (alertResult.foreground && isOrderAlertPageForeground()) {
            this.emitIncomingOrderSync(item, 'foreground');
          }
        });

      this.syncSeenStamp(nextItems);
    },
    async syncReadWithServer(item) {
      if (!item) return false;

      try {
        const success = await markOrderNotificationReadApi({
          order_id: item.order_id,
          notification_id: item.notify_id || item.notification_id || item.id,
        });
        return Boolean(success);
      } catch {
        return false;
      }
    },
    removeItemLocally(itemId) {
      if (!itemId) return false;
      const index = this.items.findIndex((entry) => String(entry.id) === String(itemId));
      if (index < 0) return false;
      this.items.splice(index, 1);
      this.unread = this.items.length;
      return true;
    },
    async markRead(target) {
      const item = typeof target === 'object' ? target : this.items.find((entry) => String(entry.id) === String(target));
      if (!item) return null;

      this.removeItemLocally(item.id);
      this.addDisplayedKey(item.id);
      this.rememberLocallyRead(item);
      await this.syncReadWithServer(item).catch(() => false);
      return item;
    },
    async markAllRead() {
      if (!this.items.length) return { successCount: 0, total: 0 };
      const list = this.items.slice();

      list.forEach((item) => {
        this.addDisplayedKey(item.id);
        this.rememberLocallyRead(item);
      });
      this.items = [];
      this.unread = this.items.length;

      const results = await Promise.allSettled(list.map((item) => this.syncReadWithServer(item)));
      const successCount = results.filter((result) => result.status === 'fulfilled' && result.value).length;
      return {
        successCount,
        total: list.length,
      };
    },
    async openNotification(item, router) {
      if (!item) return;
      await this.markRead(item);

      if (item.order_id) {
        router.push({
          path: '/orders',
          query: {
            focus_order_id: String(item.order_id),
            focus_at: String(Date.now()),
          },
        });
        return;
      }

      router.push('/orders');
    },
    async pollNewOrders(router) {
      if (!this.canUseNotification()) return;
      if (this.polling) {
        this.needsFollowUpPoll = true;
        return;
      }

      this.polling = true;
      try {
        const resp = await getOrderNotificationsApi({
          unread: 1,
          only_unread: 1,
          is_read: 0,
          read: 0,
          page: 1,
          page_size: MAX_UNREAD_ITEMS,
        });

        const rows = extractRows(resp).slice();
        rows.sort(
          (a, b) =>
            parseTime(firstNonEmpty(a.created_at, a.createdAt, a.created_time, a.createdTime))
            - parseTime(firstNonEmpty(b.created_at, b.createdAt, b.created_time, b.createdTime)),
        );

        this.syncItemsFromRows(rows, router);
      } catch {
        // polling is best-effort
      } finally {
        this.polling = false;
        if (this.needsFollowUpPoll) {
          this.needsFollowUpPoll = false;
          this.pollNewOrders(router);
        }
      }
    },
    startPolling(router) {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
      }

      this.pollNewOrders(router);
      this.pollingTimer = setInterval(() => {
        this.pollNewOrders(router);
      }, POLLING_INTERVAL);
    },
    async init(token, router, role, userInfo) {
      if (!token) return;

      this.role = role || this.role;
      this.userInfo = userInfo || this.userInfo;
      this.userId = resolveUserId(userInfo);

      if (!this.canUseNotification(userInfo, role)) {
        this.clear();
        return;
      }

      const nextSessionKey = `${this.role}:${this.userId || 'anonymous'}`;
      const sessionChanged = this.sessionKey !== nextSessionKey;
      if (sessionChanged) {
        this.sessionKey = nextSessionKey;
        this.items = [];
        this.unread = 0;
        this.displayedKeys = [];
        this.lastSeenStamp = readSeenStamp(nextSessionKey);
        this.localReadKeys = readLocalReadKeys(nextSessionKey);
        this.needsFollowUpPoll = false;
      }

      setupIncomingOrderAudio(this.sessionKey);
      this.audioVolume = getIncomingOrderAudioVolume();
      this.audioVolumeRange = getIncomingOrderAudioVolumeRange();
      initOrderAlertCenter({
        onOpenOrder: (item) => this.openNotification(item, router),
        onForegroundReturn: ({ latestItem }) => {
          this.syncAlertCenterState();
          if (latestItem) {
            this.emitIncomingOrderSync(latestItem, 'return-to-foreground');
          }
        },
        onDesktopPermissionHint: () => {
          this.promptDesktopPermissionHint();
          this.syncAlertCenterState();
        },
      });
      this.syncAlertCenterState();
      this.bindRealtimeChannel(token, router);

      if (this.initialized && !sessionChanged) return;

      this.initialized = true;
      this.startPolling(router);
    },
    clear() {
      this.items = [];
      this.unread = 0;
      this.initialized = false;
      this.role = '';
      this.userInfo = null;
      this.userId = '';
      this.polling = false;
      this.sessionKey = '';
      this.displayedKeys = [];
      this.lastSeenStamp = 0;
      this.localReadKeys = [];
      this.audioVolume = getIncomingOrderAudioVolume();
      this.audioVolumeRange = getIncomingOrderAudioVolumeRange();
      this.desktopNotificationSupported = false;
      this.desktopNotificationPermission = 'unsupported';
      this.backgroundAttentionCount = 0;
      this.needsFollowUpPoll = false;

      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }

      this.unbindRealtimeChannel();
      clearOrderAlertCenter();
    },
  },
});
