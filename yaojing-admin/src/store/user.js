import { defineStore } from 'pinia';
import { loginApi, getProfileApi } from '../api/auth';
import { getPayloadObject, isApiSuccess, isPlainObject } from '../utils/api';
import {
  clearAuthCache,
  getExpireAt,
  getRole,
  getToken,
  getUser,
  isTokenExpired,
  setAuthCache,
} from '../utils/token';
import { clearRolePermissionTemplateCache } from '../utils/permissionTemplateCache';
import { disconnectSocket } from '../utils/socket';
import {
  abortAllPendingRequests,
  clearManualLogoutFlag,
  markManualLogoutInProgress,
  resetUnauthorizedHandled,
} from '../utils/authFlow';

function normalizeRole(role) {
  const text = String(role || '')
    .trim()
    .toLowerCase();

  if (!text) return '';
  if (['super_admin', 'superadmin', 'super-admin'].includes(text)) return 'super_admin';
  if (['admin', 'administrator'].includes(text)) return 'admin';
  if (['store_owner', 'store-owner', 'owner'].includes(text)) return 'store_owner';
  if (['customer_service', 'customer-service', 'customer', 'service'].includes(text)) return 'customer_service';
  if (['finance', 'financial'].includes(text)) return 'finance';
  return text;
}

function normalizeUserInfo(userInfo, role) {
  if (!userInfo || typeof userInfo !== 'object') return userInfo;
  const nextRole = normalizeRole(role || userInfo.role);
  return {
    ...userInfo,
    role: nextRole || userInfo.role || '',
  };
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isLikelyUserInfo(value) {
  if (!isPlainObject(value)) return false;
  const keys = [
    'id',
    'user_id',
    'userId',
    'uid',
    'account_id',
    'accountId',
    'username',
    'name',
    'nickname',
    'role',
    'user_role',
    'role_key',
    'permissions',
    'menus_permissions',
    'pages_permissions',
    'buttons_permissions',
    'fields_permissions',
    'views_permissions',
    'view_permissions',
    'scope_permissions',
  ];
  return keys.some((key) => hasOwn(value, key));
}

function normalizeAuthPayload(resp) {
  const raw = isPlainObject(resp) ? resp : {};
  const payload = getPayloadObject(resp);
  const data = raw === payload ? payload : { ...raw, ...payload };
  let rawUserInfo = data.userInfo || data.user || data.profile || data.account || data.admin || null;
  if (!isPlainObject(rawUserInfo) && isLikelyUserInfo(data)) {
    rawUserInfo = data;
  }
  if (!isPlainObject(rawUserInfo) && isLikelyUserInfo(raw)) {
    rawUserInfo = raw;
  }
  const role = normalizeRole(data.role || rawUserInfo?.role || rawUserInfo?.user_role || rawUserInfo?.role_key || '');
  const userInfo = normalizeUserInfo(rawUserInfo, role);

  return {
    token: data.token || raw.token || '',
    role,
    userInfo,
    expiresAt: data.expiresAt || data.expire_at || data.expireAt || data.expired_at || raw.expiresAt || raw.expire_at || 0,
  };
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    role: '',
    userInfo: null,
    expireAt: 0,
    profileLoaded: false,
    profileSyncedAt: 0,
  }),
  getters: {
    user: (state) => state.userInfo,
    userName: (state) => state.userInfo?.name || state.userInfo?.username || '',
    isLoggedIn: (state) => Boolean(state.token && state.role),
  },
  actions: {
    restoreFromStorage() {
      resetUnauthorizedHandled();
      this.token = getToken();
      this.role = normalizeRole(getRole());
      this.userInfo = normalizeUserInfo(getUser(), this.role);
      this.expireAt = getExpireAt();
      this.profileLoaded = false;
      this.profileSyncedAt = 0;

      if (!this.token || !this.role || this.isExpired()) {
        this.logout({ manual: false });
      } else {
        clearManualLogoutFlag();
      }
    },
    async login(form) {
      const resp = await loginApi(form);
      if (!isApiSuccess(resp)) {
        return resp;
      }

      const payload = normalizeAuthPayload(resp);

      this.token = payload.token;
      this.role = normalizeRole(payload.role || payload.userInfo?.role || '');
      this.userInfo = normalizeUserInfo(payload.userInfo, this.role);
      this.expireAt = Number(payload.expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000);
      this.profileLoaded = Boolean(this.userInfo);
      this.profileSyncedAt = Date.now();

      setAuthCache(this.token, this.role, this.userInfo, this.expireAt);
      clearManualLogoutFlag();
      resetUnauthorizedHandled();
      return resp;
    },
    async fetchProfile() {
      const resp = await getProfileApi();
      if (!isApiSuccess(resp)) {
        return resp;
      }

      const payload = normalizeAuthPayload(resp);
      this.role = normalizeRole(payload.role || payload.userInfo?.role || this.role);
      this.userInfo = normalizeUserInfo(payload.userInfo, this.role);
      this.profileLoaded = true;
      this.profileSyncedAt = Date.now();
      setAuthCache(this.token, this.role, this.userInfo, this.expireAt);
      return resp;
    },
    isExpired() {
      return isTokenExpired();
    },
    logout(options = {}) {
      const manual = options?.manual === true;
      if (manual) {
        markManualLogoutInProgress();
      } else {
        clearManualLogoutFlag();
      }

      abortAllPendingRequests(manual ? 'manual-logout' : 'auth-logout');
      this.token = '';
      this.role = '';
      this.userInfo = null;
      this.expireAt = 0;
      this.profileLoaded = false;
      this.profileSyncedAt = 0;
      clearAuthCache();
      clearRolePermissionTemplateCache();
      disconnectSocket();
    },
  },
});
