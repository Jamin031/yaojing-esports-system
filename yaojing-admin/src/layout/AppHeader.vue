<template>
  <div class="header-wrap">
    <div class="left">
      <el-button class="collapse-btn" text @click="appStore.toggleSidebar">
        <el-icon size="18"><Fold /></el-icon>
      </el-button>

      <div class="brand-inline">
        <div class="brand-cn">曜竞</div>
        <div class="brand-en">ESPORTS CLUB</div>
      </div>

      <span class="divider" />
      <div class="page-title">{{ pageTitle }}</div>
    </div>

    <div class="right">
      <el-popover v-if="canSeeOrderNotify" placement="bottom" :width="notifyPopoverWidth" trigger="click">
        <template #reference>
          <el-badge :value="notificationStore.unread" :hidden="notificationStore.unread === 0">
            <el-button class="notify-btn" text>
              <el-icon size="20"><Bell /></el-icon>
            </el-button>
          </el-badge>
        </template>

        <div class="notify-head">
          <span>实时订单提醒</span>
          <div class="notify-actions">
            <el-button text size="small" @click="notificationStore.markAllRead">全部已读</el-button>
          </div>
        </div>

        <div class="notify-volume" @click.stop>
          <span class="notify-volume-label">提醒音量</span>
          <el-slider
            v-model="notifyVolumePercent"
            class="notify-volume-slider"
            :min="volumeRange.min"
            :max="volumeRange.max"
            :step="volumeRange.step"
            size="small"
            :show-tooltip="false"
          />
          <span class="notify-volume-value">{{ notifyVolumePercent }}%</span>
        </div>

        <div class="notify-system" @click.stop>
          <span class="notify-volume-label">系统通知</span>
          <el-tag size="small" :type="desktopNotifyTagType">{{ desktopNotifyStatusText }}</el-tag>
          <el-button v-if="canRequestDesktopNotify" text size="small" @click="enableDesktopNotifications">
            开启
          </el-button>
        </div>

        <div v-if="!notificationStore.items.length" class="notify-empty">暂无通知</div>

        <div v-for="item in notificationStore.items.slice(0, 8)" :key="item.id" class="notify-item" @click="goOrders(item)">
          <div class="notify-row">
            <div class="notify-title" :class="{ unread: !item.read }">{{ notifyTitle(item) }}</div>
            <el-button text size="small" @click.stop="markRead(item)">标记已读</el-button>
          </div>
          <div class="notify-line">订单信息 {{ item.order_info || '-' }}</div>
          <div class="notify-line">金额 ¥{{ item.amount }}</div>
          <div class="notify-line">联系方式 {{ item.contact }}</div>
          <div class="notify-time">{{ item.created_at }}</div>
        </div>
      </el-popover>

      <el-dropdown trigger="click" placement="bottom-end">
        <div class="user-chip">
          <el-avatar :size="32" :style="{ background: 'var(--accent)' }">{{ initials }}</el-avatar>
          <div class="user-meta">
            <div class="name">{{ displayName }}</div>
            <div class="role">{{ roleText }}</div>
          </div>
        </div>

        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAppStore } from '../store/app';
import { useAuthStore } from '../store/auth';
import { useNotificationStore } from '../store/notifications';
import { usePermission } from '../composables/usePermission';
import { NOTIFICATION_AUDIO_VIEW_KEYS } from '../utils/viewPermissionKeys';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const { hasAnyView, hasExplicit } = usePermission();

const roleMap = {
  super_admin: '超级管理员',
  admin: '管理员',
  store_owner: '网吧老板',
  customer_service: '客服',
  finance: '财务',
};

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

const normalizedRole = computed(() => normalizeRole(authStore.role || authStore.userInfo?.role));
const roleText = computed(() => roleMap[normalizedRole.value] || '未知角色');
const displayName = computed(() => authStore.userName || authStore.userInfo?.nickname || authStore.userInfo?.account || '未命名用户');
const initials = computed(() => (displayName.value?.slice(0, 1) || 'U').toUpperCase());
const canSeeOrderNotify = computed(() => {
  if (!hasExplicit('views')) {
    return ['super_admin', 'admin'].includes(normalizedRole.value);
  }
  return hasAnyView(NOTIFICATION_AUDIO_VIEW_KEYS);
});
const notifyPopoverWidth = computed(() => {
  if (!appStore.mobileViewport) return 360;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
  return Math.max(260, Math.min(viewportWidth - 24, 320));
});
const pageTitle = computed(() => String(route.meta?.title || '管理后台'));
const volumeRange = computed(() => {
  const range = notificationStore.audioVolumeRange || {};
  return {
    min: Math.round(Number(range.min ?? 0.35) * 100),
    max: Math.round(Number(range.max ?? 1) * 100),
    step: Math.max(1, Math.round(Number(range.step ?? 0.05) * 100)),
  };
});
const notifyVolumePercent = computed({
  get: () => Math.round(Number(notificationStore.audioVolume || 0.62) * 100),
  set: (value) => {
    notificationStore.setAudioVolume(Number(value || 0) / 100);
  },
});
const desktopNotifyStatusText = computed(() => {
  if (!notificationStore.desktopNotificationSupported) return '不支持';
  if (notificationStore.desktopNotificationPermission === 'granted') return '已开启';
  if (notificationStore.desktopNotificationPermission === 'denied') return '已阻止';
  return '未授权';
});
const desktopNotifyTagType = computed(() => {
  if (!notificationStore.desktopNotificationSupported) return 'info';
  if (notificationStore.desktopNotificationPermission === 'granted') return 'success';
  if (notificationStore.desktopNotificationPermission === 'denied') return 'danger';
  return 'warning';
});
const canRequestDesktopNotify = computed(
  () =>
    notificationStore.desktopNotificationSupported &&
    notificationStore.desktopNotificationPermission === 'default',
);

async function goOrders(item) {
  await notificationStore.openNotification(item, router);
}

async function markRead(item) {
  await notificationStore.markRead(item);
}

function notifyTitle(item) {
  return String(item?.type || '').toLowerCase().includes('completed')
    ? `${item.store_name || '-'} 完单`
    : `${item.store_name || '-'} 来单`;
}

async function enableDesktopNotifications() {
  const permission = await notificationStore.requestDesktopPermissionAccess();
  if (permission === 'granted') {
    ElMessage.success('系统通知已开启');
    return;
  }
  if (permission === 'denied') {
    ElMessage.warning('浏览器已阻止系统通知，请在浏览器设置中手动开启');
    return;
  }
  if (permission === 'unsupported') {
    ElMessage.warning('当前浏览器环境不支持系统通知');
  }
}

function logout() {
  authStore.logout({ manual: true });
  notificationStore.clear();
  router.replace('/login');
}
</script>

<style scoped>
.header-wrap {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.left,
.right {
  display: flex;
  align-items: center;
}

.left {
  min-width: 0;
  gap: 12px;
}

.right {
  gap: 12px;
}

.collapse-btn,
.notify-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #434b59;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e3e7ef;
}

.brand-inline {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
  min-width: 0;
}

.brand-cn {
  font-size: 14px;
  font-weight: 650;
  color: #17181b;
}

.brand-en {
  margin-top: 3px;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: #9f6326;
}

.divider {
  width: 1px;
  height: 18px;
  background: #d7dce5;
}

.page-title {
  font-size: 15px;
  font-weight: 590;
  color: #3f4553;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  border: 1px solid #e4e8ef;
  background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
  box-shadow: 0 4px 12px rgba(18, 20, 25, 0.04);
}

.user-meta .name {
  font-size: 13px;
  font-weight: 610;
  color: #20232a;
}

.user-meta .role {
  font-size: 11px;
  color: var(--text-secondary);
}

.notify-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-weight: 610;
}

.notify-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.notify-empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 14px 0;
}

.notify-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.notify-system {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.notify-volume-label {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.notify-volume-slider {
  flex: 1;
  min-width: 0;
}

.notify-volume-value {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 38px;
  text-align: right;
}

.notify-item {
  padding: 10px 10px 9px;
  border-radius: 11px;
  border: 1px solid var(--border-soft);
  margin-bottom: 8px;
  cursor: pointer;
  background: #ffffff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.notify-item:hover {
  border-color: #ffd8b7;
  box-shadow: 0 8px 16px rgba(255, 122, 0, 0.08);
}

.notify-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notify-title {
  font-weight: 610;
  margin-bottom: 2px;
}

.notify-title.unread {
  color: #d15c00;
}

.notify-line,
.notify-time {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

@media (max-width: 880px) {
  .brand-inline,
  .divider {
    display: none;
  }

  .user-meta {
    display: none;
  }

  .user-chip {
    padding-right: 4px;
  }
}
</style>
