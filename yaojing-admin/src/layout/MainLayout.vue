<template>
  <el-container class="layout-shell" :class="{ 'is-mobile': mobileViewport }">
    <div v-if="mobileViewport && mobileSidebarOpen" class="layout-mobile-mask" @click="closeMobileSidebar"></div>

    <el-aside
      :width="asideWidth"
      class="layout-aside"
      :class="{ compact: compactViewport, mobile: mobileViewport, open: mobileSidebarOpen }"
    >
      <AppSidebar />
    </el-aside>

    <el-container>
      <el-header class="layout-header">
        <AppHeader />
      </el-header>

      <el-main class="layout-main">
        <div class="main-content">
          <transition name="fade-slide" mode="out-in">
            <router-view />
          </transition>
        </div>

        <footer class="layout-footer">
          <div class="footer-brand">
            <span class="cn">曜竞</span>
            <span class="en">ESPORTS CLUB</span>
            <span class="domain">yaojingclub.com</span>
          </div>
          <span class="footer-meta">ADMIN CONSOLE</span>
        </footer>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppSidebar from './AppSidebar.vue';
import AppHeader from './AppHeader.vue';
import { useAppStore } from '../store/app';
import { useAuthStore } from '../store/auth';
import { useNotificationStore } from '../store/notifications';
import { featureRoutes } from '../router';
import { usePermission } from '../composables/usePermission';
import { offAdminSync, onAdminSync } from '../utils/adminSync';
import { isManualLogoutInProgress } from '../utils/authFlow';

const appStore = useAppStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const router = useRouter();
const route = useRoute();
const { hasPage } = usePermission();
const compactViewport = ref(false);
const profileSyncTimer = ref(null);
const PROFILE_SYNC_INTERVAL = 2 * 60 * 1000;
const mobileViewport = computed(() => appStore.mobileViewport);
const mobileSidebarOpen = computed(() => appStore.mobileSidebarOpen);
const asideWidth = computed(() => {
  if (mobileViewport.value) return '0px';
  if (compactViewport.value) return '64px';
  return appStore.sidebarCollapsed ? '72px' : '240px';
});

function closeMobileSidebar() {
  appStore.closeMobileSidebar();
}

function resolveUserId(value) {
  if (!value || typeof value !== 'object') return '';
  const id = value.id ?? value.user_id ?? value.userId ?? value.uid ?? value.account_id ?? value.accountId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function normalizeRole(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text) return '';
  if (['super_admin', 'super-admin', 'superadmin'].includes(text)) return 'super_admin';
  if (['store_owner', 'store-owner', 'owner'].includes(text)) return 'store_owner';
  if (['customer_service', 'customer-service', 'customer', 'service'].includes(text)) return 'customer_service';
  if (['finance', 'financial'].includes(text)) return 'finance';
  return text;
}

function resolveHomePath() {
  const role = String(authStore.role || '');
  const firstAllowedRoute = featureRoutes.find((item) => {
    const roleOK = Array.isArray(item.meta?.roles) && item.meta.roles.includes(role);
    if (!roleOK) return false;
    const permissionKey = item.meta?.permissionKey;
    return permissionKey ? hasPage(permissionKey) : true;
  });
  if (firstAllowedRoute?.path) return firstAllowedRoute.path;
  return role === 'store_owner' ? '/orders' : '/dashboard';
}

function hasRoutePermission() {
  const permissionKeys = route.matched.map((item) => item.meta?.permissionKey).filter(Boolean);
  if (!permissionKeys.length) return true;
  return permissionKeys.every((key) => hasPage(key));
}

function ensureRoutePermission() {
  if (hasRoutePermission()) return;
  router.replace(resolveHomePath()).catch(() => null);
}

async function refreshProfilePermissionState() {
  if (!authStore.token) return;
  await authStore.fetchProfile().catch((error) => {
    const status = Number(error?.response?.status || 0);
    if (status === 401 && !isManualLogoutInProgress()) {
      authStore.logout({ manual: false });
      router.replace('/login').catch(() => null);
    }
    return null;
  });
  ensureRoutePermission();
}

function stopProfileSyncTimer() {
  if (!profileSyncTimer.value) return;
  clearInterval(profileSyncTimer.value);
  profileSyncTimer.value = null;
}

function startProfileSyncTimer() {
  stopProfileSyncTimer();
  if (!authStore.token) return;
  profileSyncTimer.value = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    refreshProfilePermissionState();
  }, PROFILE_SYNC_INTERVAL);
}

function syncViewportState() {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const compact = width <= 980;
  const mobile = width <= 900;
  compactViewport.value = compact;
  appStore.setMobileViewport(mobile);
  if (compact && !appStore.sidebarCollapsed) {
    appStore.sidebarCollapsed = true;
  }
  if (!mobile) {
    appStore.closeMobileSidebar();
  }
}

async function handleSyncEvent(event) {
  const reason = String(event?.detail?.reason || '');
  if (reason === 'permission-template-updated') {
    const targetRole = normalizeRole(event?.detail?.role);
    const currentRole = normalizeRole(authStore.role);
    if (!targetRole || !currentRole || targetRole !== currentRole) return;

    await refreshProfilePermissionState();
    return;
  }
  if (reason !== 'permissions-updated') return;

  const currentUserId = resolveUserId(authStore.userInfo);
  const targetUserId = String(event?.detail?.user_id || '');
  if (!currentUserId || !targetUserId || currentUserId !== targetUserId) return;

  await refreshProfilePermissionState();
}

onMounted(() => {
  syncViewportState();
  if (authStore.token) {
    notificationStore.init(authStore.token, router, authStore.role, authStore.userInfo);
  }
  startProfileSyncTimer();
  onAdminSync(handleSyncEvent);
  window.addEventListener('resize', syncViewportState);
});

onUnmounted(() => {
  offAdminSync(handleSyncEvent);
  stopProfileSyncTimer();
  window.removeEventListener('resize', syncViewportState);
});

watch(
  () => [authStore.token, authStore.role, authStore.userInfo],
  ([token, role, userInfo]) => {
    if (token && role) {
      notificationStore.init(token, router, role, userInfo);
      startProfileSyncTimer();
    } else {
      notificationStore.clear();
      stopProfileSyncTimer();
      appStore.closeMobileSidebar();
    }
  },
);

watch(
  () => [authStore.userInfo, route.fullPath, mobileViewport.value],
  () => {
    ensureRoutePermission();
    if (mobileViewport.value) {
      appStore.closeMobileSidebar();
    }
  },
);
</script>

<style scoped>
.layout-shell {
  min-height: 100vh;
  background: transparent;
  position: relative;
}

.layout-mobile-mask {
  position: fixed;
  inset: 0;
  z-index: 11;
  background: rgba(12, 13, 16, 0.48);
  backdrop-filter: blur(2px);
}

.layout-aside {
  background:
    radial-gradient(300px 240px at 0% -8%, rgba(255, 122, 0, 0.18) 0%, rgba(255, 122, 0, 0) 74%),
    linear-gradient(180deg, #101114 0%, #17191d 100%);
  border-right: 1px solid #24272d;
  box-shadow: 12px 0 28px rgba(8, 8, 10, 0.22);
  transition: width 0.2s ease;
  position: relative;
  z-index: 2;
}

.layout-aside.compact {
  border-right-color: #2a2d33;
}

.layout-header {
  height: 72px;
  background: rgba(249, 250, 252, 0.85);
  border-bottom: 1px solid rgba(220, 224, 232, 0.95);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  padding: 0 22px;
  position: sticky;
  top: 0;
  z-index: 3;
}

.layout-main {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: transparent;
  min-height: calc(100vh - 72px);
  padding: 0;
}

.main-content {
  flex: 1;
  min-height: 0;
}

.layout-footer {
  min-height: 52px;
  margin: 4px 20px 14px;
  border-radius: 14px;
  background: rgba(15, 15, 16, 0.94);
  color: rgba(255, 255, 255, 0.78);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #23252b;
}

.footer-brand {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.footer-brand .cn {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.footer-brand .en {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: #ffb26d;
}

.footer-brand .domain {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.6);
}

.footer-meta {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.62);
}

@media (max-width: 900px) {
  .layout-shell.is-mobile {
    overflow: hidden;
  }

  .layout-aside.mobile {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 240px !important;
    max-width: 82vw;
    transform: translateX(-102%);
    transition: transform 0.24s ease;
    z-index: 12;
    box-shadow: 20px 0 36px rgba(8, 8, 10, 0.36);
  }

  .layout-aside.mobile.open {
    transform: translateX(0);
  }

}

@media (max-width: 768px) {
  .layout-footer {
    margin: 0 12px 10px;
    padding: 10px 12px;
    row-gap: 6px;
    flex-wrap: wrap;
  }
}
</style>
