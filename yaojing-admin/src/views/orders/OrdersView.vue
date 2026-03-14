<template>
  <div class="page-shell orders-page">
    <div class="page-header">
      <div>
        <p class="page-kicker">订单中心</p>
        <h2 class="page-title">订单管理</h2>
        <p class="page-subtitle">轻量主表展示核心信息，完整字段在详情抽屉查看。</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>订单总数</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>已选中</span>
          <strong>{{ selectedRows.length }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar orders-toolbar">
      <el-form :model="filters" class="toolbar-form">
        <div class="filter-layer core-layer">
          <el-form-item label="下单时间">
            <el-date-picker
              v-model="filters.dateRange"
              type="datetimerange"
              value-format="YYYY-MM-DD HH:mm"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="订单状态">
            <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 100%">
              <el-option v-for="item in filterStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="订单号">
            <el-input v-model="filters.order_no" clearable placeholder="精确匹配订单号" style="width: 100%" />
          </el-form-item>
        </div>

        <div class="filter-layer extra-layer">
          <el-form-item v-if="!isStoreOwner" label="来源网吧">
            <el-select v-model="filters.store_id" clearable placeholder="全部网吧" style="width: 100%">
              <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>

          <el-form-item v-if="!isStoreOwner" label="陪玩店">
            <el-select v-model="filters.play_store_id" clearable placeholder="全部陪玩店" style="width: 100%">
              <el-option v-for="item in playStores" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>

          <el-form-item v-if="isSuperAdmin" label="包含已删除">
            <el-switch v-model="filters.include_deleted" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </div>

        <div class="filter-layer action-layer">
          <el-button type="primary" @click="runSearch">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button @click="handleExport">导出</el-button>
          <el-button v-if="canCreateOrder" type="primary" plain @click="openCreateOrder">新建订单</el-button>
        </div>
      </el-form>
    </div>

    <div class="card-surface page-table orders-table-wrap">
      <div class="section-head">
        <h3 class="section-title">订单列表</h3>
        <span class="section-tip">每 15 秒自动刷新</span>
      </div>

      <div v-if="!isPhoneView" class="batch-bar">
        <div class="selected">已选 {{ selectedRows.length }}</div>
        <div v-if="showBatchBar" class="batch-actions">
          <el-select v-model="batchStatus" clearable placeholder="批量状态" style="width: 170px">
            <el-option v-for="item in batchStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button :disabled="!selectedRows.length || !batchStatus || !canBatchStatus" @click="batchUpdateStatus">批量改状态</el-button>
          <el-button type="danger" plain :disabled="!selectedRows.length || !canBatchDelete" @click="batchDelete">批量删除</el-button>
        </div>
      </div>
      <div v-else class="mobile-mode-tip">当前为移动端卡片模式，批量操作仅支持桌面端。</div>

      <div ref="ordersListRef" class="orders-list-container">
        <template v-if="isPhoneView">
          <div v-loading="loading" class="mobile-order-list">
            <el-empty v-if="!orders.length" description="暂无数据" />
            <article
              v-for="row in orders"
              :key="row.id"
              class="mobile-order-card"
              :class="{ 'order-focus-highlight': rowMatchesOrderId(row, highlightedOrderId) }"
            >
              <div class="mobile-card-head">
                <div>
                  <div class="mobile-order-no">{{ row.order_no || '-' }}</div>
                  <div class="mobile-order-id">编号 {{ row.id || '-' }}</div>
                </div>
                <el-tag v-if="hasOrderField('orders:status')" :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </div>

              <div class="mobile-card-grid">
                <div v-if="hasOrderField('orders:source_store')" class="mobile-card-item">
                  <span>来源网吧</span>
                  <strong>{{ row.store_name || '-' }}</strong>
                </div>
                <div v-if="canViewCustomerNickname" class="mobile-card-item">
                  <span>客户昵称</span>
                  <strong>{{ customerNicknameText(row) }}</strong>
                </div>
                <div v-if="canViewCustomerContact" class="mobile-card-item">
                  <span>联系方式</span>
                  <strong>{{ contactText(row) }}</strong>
                </div>
                <div v-if="hasOrderField('orders:created_at')" class="mobile-card-item">
                  <span>下单时间</span>
                  <strong>{{ formatMinute(row.created_at) }}</strong>
                </div>
                <div v-if="hasOrderField('orders:amount')" class="mobile-card-item">
                  <span>订单金额</span>
                  <strong class="money-cell">￥{{ money(resolveOrderAmount(row)) }}</strong>
                </div>
              </div>

              <div v-if="hasOrderField('orders:info')" class="mobile-order-info">{{ shortOrderInfo(row.order_info, 58) }}</div>
              <div v-if="canViewOrderRemark" class="mobile-order-remark">
                <span>客户备注：</span>{{ customerRemarkPreview(row, 30) }}
              </div>

              <div v-if="hasOrderField('orders:status') && canEditStatus" class="mobile-status-editor">
                <el-select :model-value="row.status" size="small" @change="(val) => handleStatusChange(row, val)">
                  <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>

              <div class="mobile-card-actions">
                <el-button v-if="canOpenDetail" link type="primary" @click="openDetail(row)">详情</el-button>
                <el-button v-if="canDeleteOrder && !row.is_deleted" link type="danger" @click="removeOrder(row)">删除</el-button>
                <el-button v-if="canDeleteOrder && row.is_deleted" link type="primary" @click="restoreOrder(row)">恢复</el-button>
              </div>
            </article>
          </div>
        </template>
        <template v-else>
          <el-table
            ref="ordersTableRef"
            :data="orders"
            v-loading="loading"
            stripe
            row-key="id"
            :row-class-name="resolveRowClassName"
            @selection-change="onSelectionChange"
          >
            <el-table-column type="selection" width="52" />
            <el-table-column prop="order_no" label="订单号" min-width="170">
              <template #default="{ row }">
                <div class="order-no-cell">
                  <span class="order-no">{{ row.order_no }}</span>
                  <span class="order-id">编号 {{ row.id || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column v-if="hasOrderField('orders:source_store')" prop="store_name" label="来源网吧" min-width="128" />
            <el-table-column v-if="canViewCustomerNickname" label="客户昵称" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ customerNicknameText(row) }}</template>
            </el-table-column>
            <el-table-column v-if="canViewCustomerContact" label="联系方式" min-width="136" show-overflow-tooltip>
              <template #default="{ row }">{{ contactText(row) }}</template>
            </el-table-column>
            <el-table-column v-if="hasOrderField('orders:info')" label="订单信息" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ shortOrderInfo(row.order_info, 36) }}</template>
            </el-table-column>
            <el-table-column v-if="canViewOrderRemark" label="客户备注" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ customerRemarkPreview(row) }}</template>
            </el-table-column>
            <el-table-column v-if="hasOrderField('orders:amount')" label="订单金额" min-width="112">
              <template #default="{ row }"><span class="money-cell">￥{{ money(resolveOrderAmount(row)) }}</span></template>
            </el-table-column>
            <el-table-column v-if="hasOrderField('orders:status')" label="订单状态" min-width="150">
              <template #default="{ row }">
                <el-select
                  v-if="canEditStatus"
                  :model-value="row.status"
                  style="width: 130px"
                  @change="(val) => handleStatusChange(row, val)"
                >
                  <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
                <el-tag v-else :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="hasOrderField('orders:created_at')" label="下单时间" min-width="150">
              <template #default="{ row }"><span class="time-cell">{{ formatMinute(row.created_at) }}</span></template>
            </el-table-column>
            <el-table-column v-if="canOperateOrder" label="操作" min-width="150" fixed="right">
              <template #default="{ row }">
                <div class="op-cell">
                  <el-button v-if="canOpenDetail" link type="primary" @click="openDetail(row)">详情</el-button>
                  <el-button v-if="canDeleteOrder && !row.is_deleted" link type="danger" @click="removeOrder(row)">删除</el-button>
                  <el-button v-if="canDeleteOrder && row.is_deleted" link type="primary" @click="restoreOrder(row)">恢复</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>

      <el-pagination
        class="pager"
        background
        layout="total, sizes, prev, pager, next"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        @current-change="fetchOrders"
        @size-change="handleSizeChange"
      />
    </div>

    <el-drawer
      v-model="detailDrawer.visible"
      title="订单详情"
      direction="rtl"
      :size="drawerSize"
      destroy-on-close
      class="order-detail-drawer"
    >
      <template #header>
        <div class="drawer-head">
          <div>
            <div class="drawer-order-no">{{ detailDrawer.row?.order_no || '-' }}</div>
            <div class="drawer-order-id">订单编号 {{ detailDrawer.row?.id || '-' }}</div>
          </div>
          <el-tag v-if="hasOrderField('orders:status')" :type="statusType(detailDrawer.row?.status)">{{ statusText(detailDrawer.row?.status) }}</el-tag>
        </div>
      </template>

      <div v-if="detailDrawer.row" class="drawer-content">
        <section class="detail-section">
          <h4 class="detail-title">核心信息</h4>
          <div class="detail-grid">
            <div v-if="hasOrderField('orders:source_store')" class="detail-item">
              <span>来源网吧</span>
              <strong>{{ detailDrawer.row.store_name || '-' }}</strong>
            </div>
            <div v-if="canViewCustomerNickname" class="detail-item">
              <span>客户昵称</span>
              <strong>{{ customerNicknameText(detailDrawer.row) }}</strong>
            </div>
            <div v-if="canViewCustomerContact" class="detail-item">
              <span>联系方式</span>
              <strong>{{ contactText(detailDrawer.row) }}</strong>
            </div>
            <div v-if="hasOrderField('orders:created_at')" class="detail-item">
              <span>下单时间</span>
              <strong>{{ formatMinute(detailDrawer.row.created_at) }}</strong>
            </div>
            <div v-if="hasOrderField('orders:info')" class="detail-item detail-item-wide">
              <span>订单信息</span>
              <strong>{{ detailDrawer.row.order_info || '-' }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-section" v-if="canViewOrderRemark || hasOrderField('orders:problem_remark')">
          <h4 class="detail-title">备注信息</h4>
          <div class="detail-block">
            <div class="detail-label-row">
              <span class="detail-label">客户订单备注</span>
              <span class="detail-muted">客户下单填写（只读）</span>
            </div>
            <p v-if="canViewOrderRemark" class="detail-text">{{ displayOrderRemark(detailDrawer.row) }}</p>
            <p v-else class="detail-text detail-text-muted">无权限查看</p>
          </div>

          <div v-if="hasOrderField('orders:problem_remark')" class="detail-block">
            <div class="detail-label-row">
              <span class="detail-label">问题订单备注</span>
              <span class="detail-muted">问题订单处理说明</span>
            </div>
            <p class="detail-text">{{ resolveProblemRemark(detailDrawer.row) }}</p>
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-title">结算与派单</h4>
          <div class="detail-grid">
            <div v-if="hasOrderField('orders:amount')" class="detail-item">
              <span>订单金额</span>
              <strong class="money-cell">￥{{ money(resolveOrderAmount(detailDrawer.row)) }}</strong>
            </div>
            <div v-if="canViewStoreShareField" class="detail-item">
              <span>网吧分成</span>
              <template v-if="isStoreOwner && !isCompletedOrder(detailDrawer.row)">
                <strong class="pending-share">未计入</strong>
              </template>
              <template v-else>
                <strong class="money-cell">￥{{ money(detailDrawer.row.store_share) }}</strong>
                <em class="rate">{{ pct(detailDrawer.row.store_rate) }}</em>
              </template>
            </div>
            <div v-if="canViewWestShare" class="detail-item">
              <span>曜竞分成</span>
              <strong class="money-cell">￥{{ money(detailDrawer.row.west_share) }}</strong>
            </div>
            <div v-if="canViewPlayStoreShare" class="detail-item">
              <span>陪玩店分成</span>
              <strong class="money-cell">￥{{ money(detailDrawer.row.play_store_share || detailDrawer.row.shop_share) }}</strong>
            </div>
            <div v-if="!isStoreOwner && hasOrderField('orders:assigned_play_shop')" class="detail-item detail-item-wide">
              <span>派单陪玩店</span>
              <template v-if="canAssignPlayStore">
                <el-select
                  v-model="detailDrawer.row._ui_play_store_id"
                  clearable
                  placeholder="请选择陪玩店"
                  style="width: 100%"
                  @change="(val) => handleAssignPlayStore(detailDrawer.row, val)"
                >
                  <el-option v-for="item in playStores" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </template>
              <template v-else>
                <strong>{{ getPlayStoreName(detailDrawer.row) }}</strong>
              </template>
            </div>
          </div>
        </section>

        <section v-if="isSuperAdmin && hasOrderField('orders:deleted_status')" class="detail-section">
          <h4 class="detail-title">删除状态</h4>
          <el-tag :type="detailDrawer.row.is_deleted ? 'danger' : 'success'">{{ detailDrawer.row.is_deleted ? '已删除' : '正常' }}</el-tag>
        </section>
      </div>
    </el-drawer>

    <el-dialog v-model="createDialog.visible" title="新建订单" width="520px">
      <el-form label-width="110px">
        <el-form-item label="来源网吧">
          <el-select v-model="createDialog.form.store_id" style="width: 100%" placeholder="请选择网吧">
            <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系方式">
          <el-input v-model="createDialog.form.contact" />
        </el-form-item>
        <el-form-item label="订单信息">
          <el-input v-model="createDialog.form.order_info" />
        </el-form-item>
        <el-form-item label="订单金额">
          <el-input-number v-model="createDialog.form.order_amount" :min="1" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="陪玩店">
          <el-select v-model="createDialog.form.play_store_id" style="width: 100%" clearable>
            <el-option v-for="item in playStores" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveOrder">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  assignOrderPlayStoreApi,
  batchDeleteOrdersApi,
  batchUpdateOrderStatusApi,
  createOrderApi,
  deleteOrderApi,
  getOrdersApi,
  restoreOrderApi,
  updateOrderStatusApi,
} from '../../api/orders';
import { getStoresApi } from '../../api/stores';
import { getPlayStoresApi } from '../../api/playStores';
import { emitAdminSync, isSelfAdminSyncEvent, offAdminSync, onAdminSync } from '../../utils/adminSync';
import { exportOrdersToExcel } from '../../utils/excel';
import { useAuthStore } from '../../store/auth';
import { usePermission } from '../../composables/usePermission';
import { getList, getTotal, isApiSuccess } from '../../utils/api';
import { filterRowsByOwnerScope, hasOwnerScope, resolveOwnerStoreScope, withOwnerStoreQuery } from '../../utils/storeScope';
import {
  canViewAnonymousCustomerInfo,
  isAnonymousOrder,
  isCompletedOrder,
  isOrderDeleted,
  isOwnerAllowedOrderRow,
  resolveCustomerNickname,
  resolveOrderContact,
  resolveOrderRemark,
  resolveProblemAmount,
  resolveProblemRemark,
} from '../../utils/orderRules';
import {
  CUSTOMER_CONTACT_VIEW_KEYS,
  CUSTOMER_NICKNAME_VIEW_KEYS,
  CUSTOMER_REMARK_VIEW_KEYS,
  ORDER_DETAIL_SENSITIVE_VIEW_KEYS,
  STORE_SHARE_FIELD_VIEW_KEYS,
} from '../../utils/viewPermissionKeys';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const { hasButton, hasField, hasAnyView, hasExplicit } = usePermission();

const loading = ref(false);
const orders = ref([]);
const ordersTableRef = ref(null);
const ordersListRef = ref(null);
const stores = ref([]);
const playStores = ref([]);
const selectedRows = ref([]);
const batchStatus = ref('');
const refreshTimer = ref(null);
const fetchSeq = ref(0);
const highlightedOrderId = ref('');
const highlightTimer = ref(null);
const pendingFocusOrderId = ref('');
const locatingOrderId = ref('');
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);

const pagination = reactive({
  page: 1,
  page_size: 12,
  total: 0,
});

const filters = reactive({
  dateRange: [],
  store_id: undefined,
  status: undefined,
  play_store_id: undefined,
  include_deleted: 0,
  order_no: '',
});
const MAX_FOCUS_SCAN_PAGES = 12;

const detailDrawer = reactive({
  visible: false,
  orderId: '',
  row: null,
});

const createDialog = reactive({
  visible: false,
  form: {
    store_id: undefined,
    contact: '',
    order_info: '',
    order_amount: 100,
    play_store_id: undefined,
  },
});

const isStoreOwner = computed(() => authStore.role === 'store_owner');
const isSuperAdmin = computed(() => authStore.role === 'super_admin');
const isPhoneView = computed(() => viewportWidth.value <= 860);
const hasViewLayer = computed(() => hasExplicit('views'));
const drawerSize = computed(() => {
  if (viewportWidth.value <= 640) return '100%';
  if (viewportWidth.value <= 1120) return '88%';
  return '620px';
});
const canEditStatus = computed(() => hasButton('orders:change_status') && !isStoreOwner.value);
const canAssignPlayStore = computed(() => hasButton('orders:assign_play_store') && !isStoreOwner.value);
const canCreateOrder = computed(() => hasButton('orders:create') && !isStoreOwner.value);
const canBatchStatus = computed(() => hasButton('orders:batch_status') && !isStoreOwner.value);
const canBatchDelete = computed(() => hasButton('orders:batch_delete') && !isStoreOwner.value);
const canDeleteOrder = computed(() => hasButton('orders:delete') && !isStoreOwner.value);
function resolveViewAllowed(keys, fallback = true) {
  if (!hasViewLayer.value) return fallback;
  return hasAnyView(keys);
}
const canViewCustomerNickname = computed(
  () => hasOrderField('orders:customer_nickname') && resolveViewAllowed(CUSTOMER_NICKNAME_VIEW_KEYS, true),
);
const canViewCustomerContact = computed(() => hasOrderField('orders:contact') && resolveViewAllowed(CUSTOMER_CONTACT_VIEW_KEYS, true));
const canViewCustomerRemark = computed(() =>
  resolveViewAllowed(CUSTOMER_REMARK_VIEW_KEYS, ['super_admin', 'admin', 'customer_service', 'finance'].includes(String(authStore.role || ''))),
);
const canViewOrderRemark = computed(() => {
  if (!hasOrderField('orders:order_remark')) return false;
  if (isStoreOwner.value) return false;
  return canViewCustomerRemark.value;
});
const canViewStoreShareField = computed(
  () => hasOrderField('orders:store_commission') && resolveViewAllowed(STORE_SHARE_FIELD_VIEW_KEYS, true),
);
const canViewOrderDetailSensitiveFields = computed(() => {
  if (!isStoreOwner.value) {
    return resolveViewAllowed(ORDER_DETAIL_SENSITIVE_VIEW_KEYS, true);
  }
  return resolveViewAllowed(ORDER_DETAIL_SENSITIVE_VIEW_KEYS, false);
});
const canViewWestShare = computed(
  () => !isStoreOwner.value && hasOrderField('orders:platform_commission') && canViewOrderDetailSensitiveFields.value,
);
const canViewPlayStoreShare = computed(
  () => !isStoreOwner.value && hasOrderField('orders:play_shop_commission') && canViewOrderDetailSensitiveFields.value,
);
const canOpenDetail = computed(
  () =>
    hasOrderField('orders:operations') ||
    canViewOrderRemark.value ||
    hasOrderField('orders:problem_remark') ||
    canViewStoreShareField.value ||
    canViewWestShare.value ||
    canViewPlayStoreShare.value,
);
const canOperateOrder = computed(() => canOpenDetail.value || canDeleteOrder.value);
const showBatchBar = computed(() => canBatchStatus.value || canBatchDelete.value);
const ownerStoreScope = computed(() => resolveOwnerStoreScope(authStore.userInfo));
const canViewAnonymousInfo = computed(() => canViewAnonymousCustomerInfo(authStore.role));

const statusOptions = [
  { label: '待处理', value: 'pending' },
  { label: '待处理（旧状态）', value: 'pending_contact' },
  { label: '处理中', value: 'processing' },
  { label: '问题订单', value: 'problem' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
];
const ownerFilterStatusOptions = [
  { label: '已完成', value: 'completed' },
  { label: '问题订单', value: 'problem' },
];
const filterStatusOptions = computed(() => (isStoreOwner.value ? ownerFilterStatusOptions : statusOptions));
const batchStatusOptions = [
  { label: '待处理', value: 'pending' },
  { label: '处理中', value: 'processing' },
  { label: '问题订单', value: 'problem' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
];

function money(v) {
  return Number(v || 0).toFixed(2);
}

function resolveOrderAmount(row) {
  return Number(resolveProblemAmount(row) || 0);
}

function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(0)}%`;
}

function hasOrderField(key) {
  const legacyMap = {
    'orders:platform_commission': ['orders:platform_commission', 'orders:west_share', 'orders:west'],
    'orders:play_shop_commission': ['orders:play_shop_commission', 'orders:play_store_share', 'orders:shop_share'],
    'orders:source_store': ['orders:source_store', 'orders:store_source'],
    'orders:customer_nickname': ['orders:customer_nickname', 'orders:nickname', 'orders:user_nickname'],
    'orders:order_remark': [
      'orders:order_remark',
      'orders:remark',
      'orders:customer_remark',
      'orders:customer_order_remark',
      'orders:customer_note',
      'orders:customer_message',
      'orders:order_note',
    ],
    'orders:problem_remark': ['orders:problem_remark', 'orders:problem_note', 'orders:issue_remark'],
    'orders:amount': ['orders:amount', 'orders:order_amount'],
    'orders:store_commission': ['orders:store_commission', 'orders:store_share'],
    'orders:assigned_play_shop': ['orders:assigned_play_shop', 'orders:dispatch_play_store', 'orders:dispatch_store', 'orders:assign_play_store'],
    'orders:created_at': ['orders:created_at', 'orders:create_time', 'orders:order_time'],
    'orders:status': ['orders:status', 'orders:order_status'],
    'orders:deleted_status': ['orders:deleted_status', 'orders:delete_status', 'orders:is_deleted'],
    'orders:operations': ['orders:operations', 'orders:actions', 'orders:operation', 'orders:operate'],
    'orders:contact': ['orders:contact'],
    'orders:info': ['orders:info'],
  };

  const candidates = legacyMap[key] || [key];
  return candidates.some((item) => hasField(item));
}

function normalizeOrderId(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim();
}

function rowIdCandidates(row) {
  return [
    row?.id,
    row?.order_id,
    row?.orderId,
    row?.biz_order_id,
    row?.bizOrderId,
    row?.online_order_id,
    row?.onlineOrderId,
    row?.order_no,
  ]
    .map((item) => normalizeOrderId(item))
    .filter(Boolean);
}

function resolvePrimaryOrderId(row) {
  return rowIdCandidates(row)[0] || '';
}

function rowMatchesOrderId(row, orderId) {
  const target = normalizeOrderId(orderId);
  if (!target) return false;
  return rowIdCandidates(row).includes(target);
}

function shouldMaskAnonymousIdentity(row) {
  return isAnonymousOrder(row) && !canViewAnonymousInfo.value;
}

function customerNicknameText(row) {
  if (shouldMaskAnonymousIdentity(row)) return '匿名用户';
  const text = String(resolveCustomerNickname(row) || '').trim();
  if (!text || text === '-') return '匿名用户';
  if (['anonymous', 'anon', '匿名', '匿名用户'].includes(text.toLowerCase())) return '匿名用户';
  return text;
}

function contactText(row) {
  if (shouldMaskAnonymousIdentity(row)) return '已隐藏';
  const text = String(resolveOrderContact(row) || '').trim();
  if (!text) return '匿名用户';
  if (['anonymous', 'anon', '匿名', '匿名用户'].includes(text.toLowerCase())) return '匿名用户';
  return text;
}

function shortOrderInfo(value, max = 40) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function rawOrderRemark(row) {
  const text = String(resolveOrderRemark(row) || '').trim();
  if (!text || text === '-') return '';
  return text;
}

function displayOrderRemark(row) {
  const text = rawOrderRemark(row);
  return text || '暂无备注';
}

function customerRemarkPreview(row, max = 16) {
  return shortOrderInfo(rawOrderRemark(row), max);
}

function statusText(status) {
  const map = {
    pending: '待处理',
    pending_contact: '待处理',
    processing: '处理中',
    problem: '问题订单',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[status] || status || '-';
}

function statusType(status) {
  if (status === 'completed') return 'success';
  if (status === 'problem') return 'danger';
  if (status === 'cancelled') return 'info';
  return 'warning';
}

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getPlayStoreId(row) {
  const rawId = row.play_store_id ?? row.play_shop_id ?? row.shop_id ?? row.playStoreId ?? row.play_store?.id;
  if (rawId !== null && rawId !== undefined && rawId !== '') return String(rawId);

  const rawName = getPlayStoreName(row);
  if (!rawName || rawName === '-') return undefined;
  const matched = playStores.value.find((item) => item.name === rawName);
  return matched?.id;
}

function getPlayStoreName(row) {
  return row.play_store_name || row.shop_name || row.play_store?.name || row.play_store?.title || '-';
}

function getPlayStoreOptionById(id) {
  if (id === null || id === undefined || id === '') return null;
  const target = String(id);
  return playStores.value.find((item) => String(item.id) === target) || null;
}

function normalizePlayStoreItem(item) {
  const id = item.id ?? item.play_store_id ?? item.shop_id ?? item.value;
  const name = item.name ?? item.play_store_name ?? item.shop_name ?? item.label;
  return {
    ...item,
    id: id === null || id === undefined ? '' : String(id),
    name: name || '-',
  };
}

function toPayloadId(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
}

function normalizeOrderRow(row) {
  const uiId = getPlayStoreId(row);
  return {
    ...row,
    _ui_play_store_id: uiId,
  };
}

function normalizeOwnerStatus(value) {
  const status = String(value || '')
    .trim()
    .toLowerCase();
  return ['completed', 'problem'].includes(status) ? status : '';
}

function filterOwnerRows(rows) {
  const ownerStatus = normalizeOwnerStatus(filters.status) || 'completed';
  return rows.filter((row) => {
    if (!isOwnerAllowedOrderRow(row)) return false;
    return String(row.status || '').toLowerCase() === ownerStatus;
  });
}

function buildQuery() {
  const ownerStatus = normalizeOwnerStatus(filters.status) || 'completed';
  const baseQuery = {
    page: pagination.page,
    page_size: pagination.page_size,
    status: isStoreOwner.value ? ownerStatus : filters.status,
    order_no: filters.order_no || undefined,
    store_id: filters.store_id,
    play_store_id: toPayloadId(filters.play_store_id),
  };

  if (filters.dateRange?.length === 2) {
    baseQuery.start_time = filters.dateRange[0];
    baseQuery.end_time = filters.dateRange[1];
  }

  if (isSuperAdmin.value) {
    baseQuery.include_deleted = filters.include_deleted;
  }

  if (isStoreOwner.value && ownerStatus === 'problem') {
    baseQuery.owner_visible = 1;
    baseQuery.store_owner_visible = 1;
    baseQuery.visible_to_store_owner = 1;
  }

  return withOwnerStoreQuery(baseQuery, authStore.role, authStore.userInfo);
}

function resolveVisibleRows(sourceRows) {
  const ownerHasScope = hasOwnerScope(ownerStoreScope.value);
  const scopedRows = isStoreOwner.value
    ? ownerHasScope
      ? filterRowsByOwnerScope(sourceRows, ownerStoreScope.value)
      : []
    : sourceRows;
  const shouldIncludeDeleted = isSuperAdmin.value && Number(filters.include_deleted) === 1;
  const nonDeletedRows = shouldIncludeDeleted ? scopedRows : scopedRows.filter((row) => !isOrderDeleted(row));
  const visibleRows = isStoreOwner.value ? filterOwnerRows(nonDeletedRows) : nonDeletedRows;
  return {
    rows: visibleRows.map(normalizeOrderRow),
    ownerHasScope,
  };
}

function syncDetailDrawerRow() {
  if (!detailDrawer.visible || !detailDrawer.orderId) return;
  const matched = orders.value.find((item) => rowMatchesOrderId(item, detailDrawer.orderId));
  if (!matched) return;
  detailDrawer.row = matched;
}

async function fetchBaseData() {
  if (!isStoreOwner.value) {
    const [storeResp, playResp] = await Promise.all([getStoresApi(), getPlayStoresApi()]);
    stores.value = getList(storeResp);
    playStores.value = getList(playResp).map(normalizePlayStoreItem).filter((item) => item.id);
    return;
  }

  const storeResp = await getStoresApi().catch(() => null);
  stores.value = getList(storeResp);
}

function resolveRowClassName({ row }) {
  if (!highlightedOrderId.value) return '';
  return rowMatchesOrderId(row, highlightedOrderId.value) ? 'order-focus-highlight' : '';
}

function clearHighlight() {
  if (highlightTimer.value) {
    clearTimeout(highlightTimer.value);
    highlightTimer.value = null;
  }
  highlightedOrderId.value = '';
}

async function scrollToHighlightedRow() {
  await nextTick();
  const host = ordersListRef.value;
  if (!host) return;
  const selector = isPhoneView.value ? '.mobile-order-card.order-focus-highlight' : '.el-table__body-wrapper tr.order-focus-highlight';
  const target = host.querySelector(selector);
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function highlightOrder(orderId) {
  const target = normalizeOrderId(orderId);
  if (!target) return;
  clearHighlight();
  highlightedOrderId.value = target;
  scrollToHighlightedRow();
  highlightTimer.value = setTimeout(() => {
    if (highlightedOrderId.value === target) {
      highlightedOrderId.value = '';
    }
  }, 8000);
}

function clearFocusRouteQuery() {
  if (!route.query.focus_order_id && !route.query.focus_at) return;
  const nextQuery = { ...route.query };
  delete nextQuery.focus_order_id;
  delete nextQuery.focus_at;
  router.replace({ path: route.path, query: nextQuery }).catch(() => null);
}

function clearPendingFocusOrder() {
  pendingFocusOrderId.value = '';
  clearFocusRouteQuery();
}

async function locateOrderByPages(orderId) {
  const target = normalizeOrderId(orderId);
  if (!target) return false;
  if (locatingOrderId.value === target) return false;

  locatingOrderId.value = target;
  let matchedPage = null;
  try {
    const pageSize = Number(pagination.page_size || 12);
    const total = Number(pagination.total || 0);
    const estimatedPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const maxPages = Math.min(Math.max(estimatedPages, 5), MAX_FOCUS_SCAN_PAGES);

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      if (pageNo === pagination.page) continue;
      const query = {
        ...buildQuery(),
        page: pageNo,
        page_size: pagination.page_size,
      };
      const resp = await getOrdersApi(query);
      const sourceRows = getList(resp);
      const { rows } = resolveVisibleRows(sourceRows);
      if (rows.some((row) => rowMatchesOrderId(row, target))) {
        matchedPage = pageNo;
        break;
      }
      if (!sourceRows.length && pageNo > estimatedPages) {
        break;
      }
    }
  } finally {
    locatingOrderId.value = '';
  }

  if (!matchedPage) return false;
  pagination.page = matchedPage;
  await fetchOrders();
  return true;
}

async function tryFocusOrder() {
  const target = normalizeOrderId(pendingFocusOrderId.value);
  if (!target) return;
  if (orders.value.some((row) => rowMatchesOrderId(row, target))) {
    highlightOrder(target);
    clearPendingFocusOrder();
    return;
  }
  let foundOnOtherPage = false;
  try {
    foundOnOtherPage = await locateOrderByPages(target);
  } catch {
    foundOnOtherPage = false;
  }
  if (foundOnOtherPage) return;
  ElMessage.warning('当前筛选条件下未找到目标订单。');
  clearPendingFocusOrder();
}

async function fetchOrders() {
  const currentSeq = ++fetchSeq.value;
  loading.value = true;
  try {
    const resp = await getOrdersApi(buildQuery());
    if (currentSeq !== fetchSeq.value) return;
    const sourceRows = getList(resp);
    const { rows, ownerHasScope } = resolveVisibleRows(sourceRows);
    orders.value = rows;
    pagination.total = isStoreOwner.value && !ownerHasScope ? 0 : getTotal(resp);
    syncDetailDrawerRow();
  } finally {
    if (currentSeq === fetchSeq.value) {
      loading.value = false;
    }
  }
  if (currentSeq === fetchSeq.value && pendingFocusOrderId.value) {
    await tryFocusOrder();
  }
}

function runSearch() {
  pagination.page = 1;
  fetchOrders();
}

function resetFilters() {
  filters.dateRange = [];
  filters.store_id = undefined;
  filters.status = undefined;
  filters.play_store_id = undefined;
  filters.include_deleted = 0;
  filters.order_no = '';
  pagination.page = 1;
  fetchOrders();
}

function openDetail(row) {
  detailDrawer.orderId = resolvePrimaryOrderId(row);
  detailDrawer.row = row;
  detailDrawer.visible = true;
}

function onSelectionChange(rows) {
  selectedRows.value = rows;
}

function selectedOrderIds() {
  return selectedRows.value.map((item) => item.id);
}

async function batchDelete() {
  if (!canBatchDelete.value) {
    ElMessage.error('权限不足');
    return;
  }
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择订单');
    return;
  }
  await ElMessageBox.confirm(`确认删除已选 ${selectedRows.value.length} 条订单吗？`, '批量删除', { type: 'warning' });
  await batchDeleteOrdersApi(selectedOrderIds());
  ElMessage.success('批量删除成功');
  selectedRows.value = [];
  await fetchOrders();
  emitAdminSync('orders-batch-delete');
}

async function batchUpdateStatus() {
  if (!canBatchStatus.value) {
    ElMessage.error('权限不足');
    return;
  }
  if (!selectedRows.value.length || !batchStatus.value) {
    ElMessage.warning('请选择订单和目标状态');
    return;
  }
  await batchUpdateOrderStatusApi(selectedOrderIds(), batchStatus.value);
  ElMessage.success('批量状态更新成功');
  selectedRows.value = [];
  emitAdminSync('orders-batch-status');
  if (batchStatus.value === 'problem') {
    router.push('/problem-orders');
    return;
  }
  await fetchOrders();
}

function handleSizeChange(size) {
  pagination.page_size = size;
  pagination.page = 1;
  fetchOrders();
}

async function handleStatusChange(row, status) {
  await updateOrderStatusApi(row.id, status);
  ElMessage.success('订单状态已更新');
  emitAdminSync('order-status-updated');
  if (status === 'problem') {
    router.push('/problem-orders');
    return;
  }
  await fetchOrders();
}

async function handleAssignPlayStore(row, playStoreId) {
  const previousUiId = row._ui_play_store_id;
  const currentUiId = playStoreId === null || playStoreId === undefined || playStoreId === '' ? undefined : String(playStoreId);
  row._ui_play_store_id = currentUiId;
  const payloadId = toPayloadId(playStoreId);
  const option = getPlayStoreOptionById(currentUiId);
  try {
    const resp = await assignOrderPlayStoreApi(row.id, payloadId);
    if (!isApiSuccess(resp)) {
      throw new Error(resp?.message || '保存失败');
    }
    row.play_store_id = payloadId;
    row.play_shop_id = payloadId;
    row.shop_id = payloadId;
    row.play_store_name = option?.name || '';
    row.shop_name = option?.name || '';
    ElMessage.success('陪玩店已保存');
    await fetchOrders();
    emitAdminSync('order-play-store-assigned');
  } catch (error) {
    row._ui_play_store_id = previousUiId;
    ElMessage.error(error?.message || '保存失败');
  }
}

async function removeOrder(row) {
  await ElMessageBox.confirm(`确认删除订单 ${row.order_no} 吗？`, '删除确认', { type: 'warning' });
  await deleteOrderApi(row.id);
  ElMessage.success('订单已删除');
  await fetchOrders();
  emitAdminSync('order-deleted');
}

async function restoreOrder(row) {
  await restoreOrderApi(row.id);
  ElMessage.success('订单已恢复');
  await fetchOrders();
  emitAdminSync('order-restored');
}

function handleExport() {
  const exportRows = orders.value.map((row) => ({
    ...row,
    contact: contactText(row),
  }));
  exportOrdersToExcel(exportRows, '订单结果', {
    includeStoreName: hasOrderField('orders:source_store'),
    includeContact: canViewCustomerContact.value,
    includeOrderInfo: hasOrderField('orders:info'),
    includeOrderAmount: hasOrderField('orders:amount'),
    includeStoreShare: canViewStoreShareField.value,
    includeWestShare: canViewWestShare.value,
    includePlayStoreShare: canViewPlayStoreShare.value,
    includeDispatchPlayStore: !isStoreOwner.value && hasOrderField('orders:assigned_play_shop'),
    includeStatus: hasOrderField('orders:status'),
    includeCreatedAt: hasOrderField('orders:created_at'),
  });
  ElMessage.success('导出成功');
}

function openCreateOrder() {
  createDialog.form = {
    store_id: stores.value[0]?.id,
    contact: '',
    order_info: '',
    order_amount: 100,
    play_store_id: undefined,
  };
  createDialog.visible = true;
}

async function saveOrder() {
  const form = createDialog.form;
  if (!form.store_id || !form.contact || !form.order_info || !form.order_amount) {
    ElMessage.warning('请完整填写订单信息');
    return;
  }
  await createOrderApi({
    ...form,
    play_store_id: toPayloadId(form.play_store_id),
  });
  ElMessage.success('订单创建成功');
  createDialog.visible = false;
  await fetchOrders();
  emitAdminSync('order-created');
}

const storeRefreshReasons = new Set(['store-created', 'store-updated', 'store-deleted']);
const orderRefreshReasons = new Set([
  'data-updated',
  'order-created',
  'order-alert-received',
  'order-deleted',
  'order-restored',
  'order-status-updated',
  'order-play-store-assigned',
  'orders-batch-delete',
  'orders-batch-status',
  'problem-order-saved',
  'problem-order-completed',
  'problem-order-rollback',
  'recycle-order-restored',
  'recycle-order-permanent-delete',
]);

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    if (loading.value) return;
    fetchOrders();
  }, 15000);
}

function onVisibleRefresh() {
  if (!document.hidden && !loading.value) {
    fetchOrders();
  }
}

function onViewportResize() {
  viewportWidth.value = typeof window !== 'undefined' ? window.innerWidth : 1280;
}

function onSyncEvent(event) {
  const allowSameTab = event?.detail?.allow_same_tab === true || String(event?.detail?.allow_same_tab || '') === '1';
  if (isSelfAdminSyncEvent(event) && !allowSameTab) return;
  const reason = String(event?.detail?.reason || '');
  if (storeRefreshReasons.has(reason)) {
    fetchBaseData().catch(() => null);
    if (!loading.value) {
      fetchOrders();
    }
    return;
  }
  if (!orderRefreshReasons.has(reason)) return;
  const focusOrderId = normalizeOrderId(event?.detail?.focus_order_id);
  if (focusOrderId) {
    pendingFocusOrderId.value = focusOrderId;
  }
  if (!loading.value) {
    fetchOrders();
  }
}

watch(
  () => [route.query.focus_order_id, route.query.focus_at],
  ([orderId]) => {
    const target = normalizeOrderId(orderId);
    if (!target) return;
    pendingFocusOrderId.value = target;
    if (loading.value) return;
    tryFocusOrder();
  },
);

watch(
  () => detailDrawer.visible,
  (visible) => {
    if (!visible) {
      detailDrawer.orderId = '';
      detailDrawer.row = null;
    }
  },
);

watch(
  () => [authStore.userInfo, authStore.role],
  () => {
    fetchBaseData().catch(() => null);
    fetchOrders();
  },
);

onMounted(async () => {
  pendingFocusOrderId.value = normalizeOrderId(route.query.focus_order_id);
  onViewportResize();
  await fetchBaseData();
  await fetchOrders();
  setupAutoRefresh();
  onAdminSync(onSyncEvent);
  document.addEventListener('visibilitychange', onVisibleRefresh);
  window.addEventListener('resize', onViewportResize);
});

onUnmounted(() => {
  offAdminSync(onSyncEvent);
  clearHighlight();
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
  document.removeEventListener('visibilitychange', onVisibleRefresh);
  window.removeEventListener('resize', onViewportResize);
});
</script>

<style scoped>
.orders-toolbar {
  position: relative;
}

.toolbar-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-layer {
  width: 100%;
  display: grid;
  gap: 10px 12px;
}

.core-layer {
  grid-template-columns: minmax(320px, 2fr) minmax(180px, 1fr) minmax(180px, 1fr);
}

.extra-layer {
  grid-template-columns: repeat(3, minmax(180px, 1fr));
}

.action-layer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-layer :deep(.el-form-item) {
  margin: 0;
}

.orders-table-wrap {
  overflow: hidden;
}

.orders-list-container {
  min-height: 260px;
}

.order-no-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.order-no {
  color: #1b1e25;
  font-weight: 610;
  letter-spacing: 0.01em;
}

.order-id {
  color: var(--text-tertiary);
  font-size: 11px;
}

.money-cell {
  color: #1e222c;
  font-weight: 620;
  font-variant-numeric: tabular-nums;
}

.rate {
  margin-left: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-style: normal;
}

.pending-share {
  color: var(--text-secondary);
}

.time-cell {
  color: #414857;
  font-variant-numeric: tabular-nums;
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}

.mobile-mode-tip {
  margin-bottom: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px dashed #d8dee9;
  color: var(--text-secondary);
  font-size: 12px;
  background: #f9fbfd;
}

.selected {
  color: #586070;
  font-size: 13px;
  font-weight: 540;
}

.batch-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.op-cell {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}

.pager {
  margin-top: 18px;
  justify-content: flex-end;
}

.mobile-order-list {
  display: grid;
  gap: 10px;
}

.mobile-order-card {
  border: 1px solid #e5e9f0;
  border-radius: 14px;
  background: #ffffff;
  padding: 12px;
}

.mobile-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.mobile-order-no {
  font-size: 14px;
  font-weight: 620;
  color: #1a1f2a;
}

.mobile-order-id {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.mobile-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
}

.mobile-card-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mobile-card-item > span {
  font-size: 11px;
  color: var(--text-secondary);
}

.mobile-card-item > strong {
  font-size: 12px;
  font-weight: 580;
  color: #1f2430;
}

.mobile-order-info {
  margin-top: 10px;
  padding: 8px 9px;
  border-radius: 9px;
  background: #f8fafc;
  color: #455063;
  font-size: 12px;
  line-height: 1.45;
}

.mobile-order-remark {
  margin-top: 8px;
  color: #566074;
  font-size: 12px;
  line-height: 1.45;
}

.mobile-order-remark > span {
  color: var(--text-secondary);
}

.mobile-status-editor {
  margin-top: 10px;
}

.mobile-card-actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.drawer-order-no {
  font-size: 16px;
  font-weight: 620;
  color: #1a1d25;
}

.drawer-order-id {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.drawer-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-section {
  border: 1px solid #e7ebf1;
  border-radius: 14px;
  background: #fcfdff;
  padding: 13px;
}

.detail-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 610;
  color: #1f2736;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item > span {
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-item > strong {
  color: #1e2430;
  font-weight: 590;
  line-height: 1.45;
  word-break: break-word;
}

.detail-item-wide {
  grid-column: 1 / -1;
}

.detail-block + .detail-block {
  margin-top: 12px;
}

.detail-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.detail-label {
  color: #253044;
  font-size: 12px;
  font-weight: 590;
}

.detail-text {
  margin: 0;
  color: #263143;
  line-height: 1.6;
  word-break: break-word;
}

.detail-text-muted {
  color: var(--text-secondary);
}

.detail-muted {
  color: var(--text-secondary);
  font-size: 12px;
}

:deep(.el-table__body tr.order-focus-highlight > td),
.mobile-order-card.order-focus-highlight {
  background: #fff4e8 !important;
  transition: background 0.2s ease;
  animation: focus-row-pulse 1.1s ease-in-out 2;
}

@keyframes focus-row-pulse {
  0% {
    background: #ffe7cf;
  }
  100% {
    background: #fff4e8;
  }
}

@media (max-width: 1180px) {
  .core-layer {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .extra-layer {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .core-layer,
  .extra-layer {
    grid-template-columns: 1fr;
  }

  .action-layer {
    justify-content: flex-start;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-item-wide {
    grid-column: auto;
  }
}
</style>

