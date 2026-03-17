import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../store/user';
import { isApiSuccess } from '../utils/api';
import { hasPermissionByKey } from '../utils/permissionAccess';
import { isManualLogoutInProgress } from '../utils/authFlow';

const MainLayout = () => import('../layout/MainLayout.vue');
const LoginView = () => import('../views/login/LoginView.vue');
const DashboardView = () => import('../views/dashboard/DashboardView.vue');
const OrdersView = () => import('../views/orders/OrdersView.vue');
const GarbageOrdersView = () => import('../views/garbage-orders/GarbageOrdersView.vue');
const ProblemOrdersView = () => import('../views/problem-orders/ProblemOrdersView.vue');
const RecycleOrdersView = () => import('../views/recycle-orders/RecycleOrdersView.vue');
const OnlineUserOrdersView = () => import('../views/online-user-orders/OnlineUserOrdersView.vue');
const StoreDataView = () => import('../views/store-data/StoreDataView.vue');
const StoresView = () => import('../views/stores/StoresView.vue');
const PlayStoresView = () => import('../views/play-stores/PlayStoresView.vue');
const DevicesView = () => import('../views/devices/DevicesView.vue');
const UsersView = () => import('../views/users/UsersView.vue');
const PermissionsView = () => import('../views/permissions/PermissionsView.vue');
const OperationLogsView = () => import('../views/operation-logs/OperationLogsView.vue');
const StatsView = () => import('../views/stats/StatsView.vue');

export const featureRoutes = [
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      title: '仪表盘',
      icon: 'HomeFilled',
      roles: ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner'],
      menu: true,
      menuKey: 'menu:dashboard',
      permissionKey: 'dashboard:view',
    },
  },
  {
    path: '/orders',
    name: 'orders',
    component: OrdersView,
    meta: {
      title: '订单管理',
      icon: 'Tickets',
      roles: ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner'],
      menu: true,
      menuKey: 'menu:orders',
      permissionKey: 'orders:view',
    },
  },
  {
    path: '/garbage-orders',
    name: 'garbage-orders',
    component: GarbageOrdersView,
    meta: {
      title: '垃圾订单',
      icon: 'Delete',
      roles: ['super_admin', 'admin', 'customer_service'],
      menu: true,
      menuKey: 'orders:view',
      menuPermissionType: 'pages',
      permissionKey: 'orders:view',
    },
  },
  {
    path: '/problem-orders',
    name: 'problem-orders',
    component: ProblemOrdersView,
    meta: {
      title: '问题订单',
      icon: 'WarningFilled',
      roles: ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner'],
      menu: true,
      menuKey: 'menu:problem_orders',
      permissionKey: 'problem_orders:view',
    },
  },
  {
    path: '/recycle-orders',
    name: 'recycle-orders',
    component: RecycleOrdersView,
    meta: {
      title: '回收订单',
      icon: 'DeleteFilled',
      roles: ['super_admin', 'admin', 'customer_service', 'finance'],
      menu: true,
      menuKey: 'menu:recycle_orders',
      permissionKey: 'recycle_orders:view',
    },
  },
  {
    path: '/online-user-orders',
    name: 'online-user-orders',
    component: OnlineUserOrdersView,
    meta: {
      title: '线上用户订单',
      icon: 'Monitor',
      roles: ['super_admin', 'admin', 'customer_service', 'finance'],
      menu: true,
      menuKey: 'menu:online_user_orders',
      permissionKey: 'online_user_orders:view',
    },
  },
  {
    path: '/store-data',
    name: 'store-data',
    component: StoreDataView,
    meta: {
      title: '网吧数据',
      icon: 'DataLine',
      roles: ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner'],
      menu: true,
      menuKey: 'menu:store_data',
      permissionKey: 'store_data:view',
    },
  },
  {
    path: '/stores',
    name: 'stores',
    component: StoresView,
    meta: {
      title: '网吧管理',
      icon: 'OfficeBuilding',
      roles: ['super_admin'],
      menu: true,
      menuKey: 'menu:stores',
      permissionKey: 'stores:view',
    },
  },
  {
    path: '/play-stores',
    name: 'play-stores',
    component: PlayStoresView,
    meta: {
      title: '陪玩店维护',
      icon: 'Shop',
      roles: ['super_admin', 'admin', 'customer_service', 'finance'],
      menu: true,
      menuKey: 'menu:play_stores',
      permissionKey: 'play_stores:view',
    },
  },
  {
    path: '/devices',
    name: 'devices',
    component: DevicesView,
    meta: {
      title: '设备管理',
      icon: 'Iphone',
      roles: ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner'],
      menu: true,
      menuKey: 'page.device_management.view',
      menuPermissionType: 'pages',
      permissionKey: 'page.device_management.view',
    },
  },
  {
    path: '/users',
    name: 'users',
    component: UsersView,
    meta: {
      title: '用户管理',
      icon: 'UserFilled',
      roles: ['super_admin'],
      menu: true,
      menuKey: 'menu:users',
      permissionKey: 'users:view',
    },
  },
  {
    path: '/permissions',
    name: 'permissions',
    component: PermissionsView,
    meta: {
      title: '权限管理',
      icon: 'Lock',
      roles: ['super_admin'],
      menu: true,
      menuKey: 'menu:permissions',
      permissionKey: 'permissions:view',
    },
  },
  {
    path: '/operation-logs',
    name: 'operation-logs',
    component: OperationLogsView,
    meta: {
      title: '操作日志',
      icon: 'Document',
      roles: ['super_admin', 'admin', 'customer_service', 'finance'],
      menu: true,
      menuKey: 'menu:operation_logs',
      permissionKey: 'operation_logs:view',
    },
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView,
    meta: {
      title: '统计分析',
      icon: 'DataAnalysis',
      roles: ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner'],
      menu: false,
      permissionKey: 'stats:view',
    },
  },
];

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true },
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard',
    children: featureRoutes,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
];

const PROFILE_SYNC_INTERVAL = 3 * 60 * 1000;

function homePathByRole(role) {
  return role === 'store_owner' ? '/orders' : '/dashboard';
}

function hasPagePermission(role, userInfo, permissionKey) {
  return hasPermissionByKey(userInfo, role, 'pages', permissionKey);
}

function hasRoutePermission(role, userInfo, to) {
  const matchedRoles = to.matched
    .filter((record) => Array.isArray(record.meta?.roles))
    .flatMap((record) => record.meta.roles);
  if (matchedRoles.length && !matchedRoles.includes(role)) return false;

  const permissionKeys = to.matched.map((record) => record.meta?.permissionKey).filter(Boolean);
  if (!permissionKeys.length) return true;

  return permissionKeys.every((key) => hasPagePermission(role, userInfo, key));
}

function requiresSuperAdmin(to) {
  return to.matched.some((record) => {
    const roles = record.meta?.roles;
    return Array.isArray(roles) && roles.length === 1 && roles[0] === 'super_admin';
  });
}

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore();
  const hasToken = Boolean(userStore.token);
  const role = userStore.role;

  if (to.meta.public) {
    if (!hasToken) {
      next();
      return;
    }

    next(homePathByRole(role));
    return;
  }

  if (!hasToken) {
    next('/login');
    return;
  }

  if (userStore.isExpired()) {
    if (!isManualLogoutInProgress()) {
      ElMessage.error('登录态已过期，请重新登录');
    }
    userStore.logout({ manual: false });
    next('/login');
    return;
  }

  if (!userStore.profileLoaded || Date.now() - userStore.profileSyncedAt > PROFILE_SYNC_INTERVAL) {
    let profileResp = null;
    try {
      profileResp = await userStore.fetchProfile();
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status === 401) {
        if (!isManualLogoutInProgress()) {
          ElMessage.error('登录态已失效，请重新登录');
        }
        userStore.logout({ manual: false });
        next('/login');
        return;
      }
      // Non-auth errors should not force logout.
      profileResp = null;
    }

    if (profileResp && !isApiSuccess(profileResp)) {
      const message = String(profileResp?.message || '').toLowerCase();
      const unauthorized = Number(profileResp?.code || 0) === 401 || message.includes('unauthorized');
      if (unauthorized) {
        if (!isManualLogoutInProgress()) {
          ElMessage.error('登录态已失效，请重新登录');
        }
        userStore.logout({ manual: false });
        next('/login');
        return;
      }
    }
  }

  const currentRole = userStore.role;

  if (requiresSuperAdmin(to) && currentRole !== 'super_admin') {
    ElMessage.error('权限不足');
    next('/dashboard');
    return;
  }

  if (!hasRoutePermission(currentRole, userStore.userInfo, to)) {
    ElMessage.error('权限不足');
    next(homePathByRole(currentRole));
    return;
  }

  next();
});

export default router;
