import { computed } from 'vue';
import { useAuthStore } from '../store/auth';
import {
  hasExplicitPermissionCollection,
  hasAnyPermissionByKeys,
  hasPermissionByKey,
  isSuperAdminRole,
} from '../utils/permissionAccess';

export function usePermission() {
  const authStore = useAuthStore();
  const isSuperAdmin = computed(() => isSuperAdminRole(authStore.role));

  function hasPermission(type, key) {
    return hasPermissionByKey(authStore.userInfo, authStore.role, type, key);
  }

  function hasAny(type, keys) {
    return hasAnyPermissionByKeys(authStore.userInfo, authStore.role, type, keys);
  }

  function hasExplicit(type) {
    if (isSuperAdmin.value) return true;
    return hasExplicitPermissionCollection(authStore.userInfo, type);
  }

  function hasPage(key) {
    return hasPermission('pages', key);
  }

  function hasMenu(key) {
    return hasPermission('menus', key);
  }

  function hasButton(key) {
    return hasPermission('buttons', key);
  }

  function hasField(key) {
    return hasPermission('fields', key);
  }

  function hasView(key) {
    return hasPermission('views', key);
  }

  function hasAnyView(keys) {
    return hasAny('views', keys);
  }

  return {
    isSuperAdmin,
    hasPermission,
    hasAny,
    hasExplicit,
    hasPage,
    hasMenu,
    hasButton,
    hasField,
    hasView,
    hasAnyView,
  };
}
