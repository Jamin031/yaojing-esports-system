<template>
  <div class="sidebar-wrap">
    <div class="brand">
      <div class="brand-mark">曜</div>
      <div v-if="!menuCollapsed" class="brand-copy">
        <span class="brand-cn">曜竞</span>
        <span class="brand-en">ESPORTS CLUB</span>
      </div>
    </div>

    <el-menu
      :collapse="menuCollapsed"
      :default-active="route.path"
      class="menu"
      router
      unique-opened
    >
      <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
        <el-icon><component :is="item.meta.icon" /></el-icon>
        <template #title>{{ item.meta.title }}</template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { featureRoutes } from '../router';
import { useAppStore } from '../store/app';
import { useAuthStore } from '../store/auth';
import { usePermission } from '../composables/usePermission';

const route = useRoute();
const appStore = useAppStore();
const authStore = useAuthStore();
const { hasPage, hasMenu } = usePermission();
const menuCollapsed = computed(() => !appStore.mobileViewport && appStore.sidebarCollapsed);

const menus = computed(() => {
  const role = authStore.role;
  return featureRoutes.filter((item) => {
    const roleOK = item.meta?.menu && item.meta?.roles?.includes(role);
    if (!roleOK) return false;
    const menuOK = hasMenu(item.meta?.menuKey || item.meta?.permissionKey);
    const pageOK = hasPage(item.meta?.permissionKey);
    return menuOK && pageOK;
  });
});
</script>

<style scoped>
.sidebar-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 14px 10px 16px;
  gap: 8px;
}

.brand {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 14px;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%),
    linear-gradient(165deg, #171a1f 0%, #111217 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(140deg, var(--accent) 0%, #f06d00 100%);
  box-shadow: 0 10px 22px rgba(255, 122, 0, 0.34);
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.brand-cn {
  color: #ffffff;
  font-size: 15px;
  font-weight: 620;
  letter-spacing: 0.02em;
}

.brand-en {
  margin-top: 4px;
  color: #ffc58f;
  font-size: 10px;
  letter-spacing: 0.18em;
}

.menu {
  border: none;
  background: transparent;
  padding: 2px;
}

:deep(.el-menu-item) {
  border-radius: 11px;
  margin: 4px 0;
  color: rgba(255, 255, 255, 0.8);
  height: 46px;
  transition: all 0.2s ease;
}

:deep(.el-menu-item .el-icon) {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.el-menu-item.is-active) {
  background:
    linear-gradient(90deg, rgba(255, 122, 0, 0.24) 0%, rgba(255, 122, 0, 0.1) 70%),
    rgba(255, 255, 255, 0.04);
  color: #ffffff;
  font-weight: 600;
  box-shadow:
    inset 2px 0 0 var(--accent),
    0 8px 18px rgba(0, 0, 0, 0.22);
}

:deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

:deep(.el-menu-item.is-active .el-icon),
:deep(.el-menu-item:hover .el-icon) {
  color: #ffd0a2;
}
</style>
