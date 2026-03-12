<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">问题队列</p>
        <h2 class="page-title">问题订单</h2>
        <p class="page-subtitle">修正金额、备注同步、状态回流集中处理</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>问题订单</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>待保存</span>
          <strong>{{ hasUnsavedDrafts ? '有' : '无' }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters" class="problem-filter-form">
        <el-form-item label="问题时间">
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item v-if="!isStoreOwner" label="网吧">
          <el-select v-model="filters.store_id" placeholder="全部网吧" clearable style="width: 200px">
            <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-alert
      v-if="hasUnsavedDrafts"
      class="draft-alert"
      type="warning"
      :closable="false"
      show-icon
      title="检测到未保存修改，已暂停自动刷新。点击“保存修改”后将恢复实时刷新。"
    />

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">问题订单列表</h3>
      </div>
      <el-table :data="orders" v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" min-width="170" />
        <el-table-column v-if="hasProblemField('orders:store_source')" prop="store_name" label="来源网吧" min-width="130" />
        <el-table-column v-if="hasProblemField('orders:contact')" label="联系方式" min-width="150">
          <template #default="{ row }">{{ contactText(row) }}</template>
        </el-table-column>

        <el-table-column label="修正金额" min-width="150">
          <template #default="{ row }">
            <template v-if="canEditProblem">
              <el-input-number
                :model-value="getDraftAmount(row)"
                :min="0"
                :step="10"
                controls-position="right"
                @focus="markRowEditing(row)"
                @update:model-value="(value) => updateDraftAmount(row, value)"
              />
            </template>
            <template v-else>
              <span class="money-cell">¥{{ money(resolveProblemAmount(row)) }}</span>
            </template>
          </template>
        </el-table-column>

        <el-table-column v-if="hasProblemField('orders:problem_remark')" label="问题订单备注" min-width="260">
          <template #default="{ row }">
            <el-input
              v-if="canEditProblem"
              :model-value="getDraftRemark(row)"
              placeholder="请输入问题订单备注"
              @focus="markRowEditing(row)"
              @update:model-value="(value) => updateDraftRemark(row, value)"
            />
            <span v-else>{{ resolveProblemRemark(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="下单时间" min-width="150">
          <template #default="{ row }">{{ formatMinute(row.created_at || row.order_time) }}</template>
        </el-table-column>

        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button v-if="canEditProblem" link type="primary" @click="saveProblem(row)">保存修改</el-button>
              <el-button v-if="canCompleteProblem" link type="success" @click="confirmComplete(row)">订单已完成</el-button>
              <el-button v-if="canRollbackProblem" link type="warning" @click="rollbackProblem(row)">撤回</el-button>
              <span v-if="isStoreOwner" class="readonly-tip">仅可查看备注</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        background
        layout="total, prev, pager, next"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :total="pagination.total"
        @current-change="fetchOrders"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  completeProblemOrderApi,
  getOrdersApi,
  revokeProblemOrderApi,
  updateOrderEffectiveApi,
  updateOrderStatusApi,
  updateProblemOrderApi,
} from '../../api/orders';
import { getStoresApi } from '../../api/stores';
import { useAuthStore } from '../../store/auth';
import { emitAdminSync, offAdminSync, onAdminSync } from '../../utils/adminSync';
import { usePermission } from '../../composables/usePermission';
import { getList, getTotal } from '../../utils/api';
import { filterRowsByOwnerScope, hasOwnerScope, resolveOwnerStoreScope, withOwnerStoreQuery } from '../../utils/storeScope';
import {
  canViewAnonymousCustomerInfo,
  isAnonymousOrder,
  isOwnerVisibleProblemOrder,
  resolveOrderContact,
  resolveProblemAmount,
  resolveProblemRemark,
} from '../../utils/orderRules';

const authStore = useAuthStore();
const { hasButton, hasField } = usePermission();

const loading = ref(false);
const stores = ref([]);
const orders = ref([]);
const refreshTimer = ref(null);
const editingRowId = ref('');
const fetchSeq = ref(0);
const REFRESH_INTERVAL = 6000;

const draftMap = reactive({});

const pagination = reactive({
  page: 1,
  page_size: 10,
  total: 0,
});

const filters = reactive({
  store_id: undefined,
  dateRange: [],
});

const isStoreOwner = computed(() => authStore.role === 'store_owner');
const canViewAnonymousInfo = computed(() => canViewAnonymousCustomerInfo(authStore.role));
const ownerStoreScope = computed(() => resolveOwnerStoreScope(authStore.userInfo));
const hasUnsavedDrafts = computed(() => Object.values(draftMap).some((item) => item?.dirty));

const canEditProblem = computed(
  () =>
    !isStoreOwner.value &&
    (hasButton('problem_orders:save') || hasButton('orders:problem_save') || hasButton('orders:change_status')),
);
const canCompleteProblem = computed(
  () =>
    !isStoreOwner.value &&
    (hasButton('problem_orders:complete') || hasButton('orders:problem_complete') || hasButton('orders:change_status')),
);
const canRollbackProblem = computed(
  () =>
    !isStoreOwner.value &&
    (hasButton('problem_orders:rollback') || hasButton('orders:problem_withdraw') || hasButton('orders:change_status')),
);
const rollbackStatusCandidates = ['pending_contact', 'processing', 'pending'];

function money(v) {
  return Number(v || 0).toFixed(2);
}

function orderStatusText(status) {
  const map = {
    pending: '待处理',
    pending_contact: '待处理',
    processing: '处理中',
    problem: '问题订单',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[String(status || '').toLowerCase()] || status || '-';
}

function contactText(row) {
  if (isAnonymousOrder(row) && !canViewAnonymousInfo.value) return '已隐藏';
  const text = String(resolveOrderContact(row) || '').trim();
  if (!text) return '匿名用户';
  if (['anonymous', 'anon', '匿名', '匿名用户'].includes(text.toLowerCase())) return '匿名用户';
  return text;
}

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hasProblemField(key) {
  const aliases = {
    'orders:store_source': ['orders:store_source', 'orders:source_store'],
    'orders:contact': ['orders:contact', 'orders:customer_contact'],
    'orders:problem_remark': ['orders:problem_remark', 'orders:problem_note', 'orders:issue_remark'],
  };
  const candidates = aliases[key] || [key];
  return candidates.some((item) => hasField(item));
}

function normalizeRemark(value) {
  return String(value || '');
}

function rowDraftKey(row) {
  if (!row) return '';
  const value = row.id ?? row.order_id ?? row.orderId ?? row.order_no;
  return value === null || value === undefined ? '' : String(value);
}

function baseRemarkByRow(row) {
  const resolved = resolveProblemRemark(row);
  return resolved === '-' ? '' : normalizeRemark(resolved);
}

function refreshDraftDirtyFlag(draft) {
  if (!draft) return;
  const nextAmount = Number(draft.revised_amount || 0);
  const serverAmount = Number(draft.server_amount || 0);
  draft.dirty = nextAmount !== serverAmount || normalizeRemark(draft.remark) !== normalizeRemark(draft.server_remark);
}

function ensureRowDraft(row) {
  const key = rowDraftKey(row);
  if (!key) return null;

  const latestAmount = Number(resolveProblemAmount(row) || 0);
  const latestRemark = baseRemarkByRow(row);
  const existing = draftMap[key];
  if (!existing) {
    draftMap[key] = {
      revised_amount: latestAmount,
      remark: latestRemark,
      server_amount: latestAmount,
      server_remark: latestRemark,
      dirty: false,
    };
    return draftMap[key];
  }

  if (!existing.dirty) {
    existing.revised_amount = latestAmount;
    existing.remark = latestRemark;
  }
  existing.server_amount = latestAmount;
  existing.server_remark = latestRemark;
  refreshDraftDirtyFlag(existing);
  return existing;
}

function cleanupDraftsByRows(rows) {
  const keys = new Set((rows || []).map((item) => rowDraftKey(item)).filter(Boolean));
  Object.keys(draftMap).forEach((key) => {
    if (!keys.has(key)) {
      delete draftMap[key];
      if (editingRowId.value === key) {
        editingRowId.value = '';
      }
    }
  });
}

function getDraftSnapshot(row) {
  const draft = ensureRowDraft(row);
  if (!draft) {
    return {
      revised_amount: Number(resolveProblemAmount(row) || 0),
      remark: baseRemarkByRow(row),
    };
  }
  return {
    revised_amount: Number(draft.revised_amount || 0),
    remark: normalizeRemark(draft.remark),
  };
}

function getDraftAmount(row) {
  const draft = ensureRowDraft(row);
  return draft ? draft.revised_amount : Number(resolveProblemAmount(row) || 0);
}

function getDraftRemark(row) {
  const draft = ensureRowDraft(row);
  return draft ? draft.remark : baseRemarkByRow(row);
}

function markRowEditing(row) {
  editingRowId.value = rowDraftKey(row);
}

function updateDraftAmount(row, value) {
  const draft = ensureRowDraft(row);
  if (!draft) return;
  draft.revised_amount = Number(value || 0);
  refreshDraftDirtyFlag(draft);
}

function updateDraftRemark(row, value) {
  const draft = ensureRowDraft(row);
  if (!draft) return;
  draft.remark = normalizeRemark(value);
  refreshDraftDirtyFlag(draft);
}

function clearRowDraft(row) {
  const key = rowDraftKey(row);
  if (!key) return;
  delete draftMap[key];
  if (editingRowId.value === key) {
    editingRowId.value = '';
  }
}

function buildProblemPayload(row, extra = {}, draftData = null) {
  const draft = draftData || getDraftSnapshot(row);
  const revisedAmount = Number(draft.revised_amount || 0);
  const remark = normalizeRemark(draft.remark);
  return {
    revised_amount: revisedAmount,
    revisedAmount: revisedAmount,
    problem_amount: revisedAmount,
    problemAmount: revisedAmount,
    adjusted_amount: revisedAmount,
    adjustedAmount: revisedAmount,
    problem_remark: remark,
    problemRemark: remark,
    problem_note: remark,
    problemNote: remark,
    order_amount: revisedAmount,
    orderAmount: revisedAmount,
    amount: revisedAmount,
    remark,
    note: remark,
    ...extra,
  };
}

function buildQuery() {
  const baseQuery = {
    page: pagination.page,
    page_size: pagination.page_size,
    status: 'problem',
    store_id: filters.store_id,
  };

  if (filters.dateRange?.length === 2) {
    baseQuery.start_time = filters.dateRange[0];
    baseQuery.end_time = filters.dateRange[1];
  }

  if (isStoreOwner.value) {
    baseQuery.owner_visible = 1;
    baseQuery.store_owner_visible = 1;
    baseQuery.visible_to_store_owner = 1;
  }

  return withOwnerStoreQuery(baseQuery, authStore.role, authStore.userInfo);
}

async function fetchStores() {
  if (isStoreOwner.value) return;
  const resp = await getStoresApi();
  stores.value = getList(resp);
}

async function fetchOrders() {
  const currentSeq = ++fetchSeq.value;
  loading.value = true;
  try {
    const resp = await getOrdersApi(buildQuery());
    if (currentSeq !== fetchSeq.value) return;
    const sourceRows = getList(resp);
    const ownerHasScope = hasOwnerScope(ownerStoreScope.value);
    const rows = isStoreOwner.value
      ? ownerHasScope
        ? filterRowsByOwnerScope(sourceRows, ownerStoreScope.value)
        : []
      : sourceRows;
    const visibleRows = isStoreOwner.value ? rows.filter((item) => isOwnerVisibleProblemOrder(item)) : rows;
    visibleRows.forEach((row) => {
      ensureRowDraft(row);
    });
    cleanupDraftsByRows(visibleRows);

    orders.value = visibleRows;
    pagination.total = isStoreOwner.value && !ownerHasScope ? 0 : getTotal(resp);
  } finally {
    if (currentSeq === fetchSeq.value) {
      loading.value = false;
    }
  }
}

function search() {
  pagination.page = 1;
  fetchOrders();
}

function reset() {
  filters.store_id = undefined;
  filters.dateRange = [];
  pagination.page = 1;
  fetchOrders();
}

async function saveProblem(row) {
  if (!canEditProblem.value) {
    ElMessage.error('权限不足');
    return;
  }

  const draftData = getDraftSnapshot(row);
  await updateProblemOrderApi(
    row.id,
    buildProblemPayload(
      row,
      {
        status: 'problem',
        is_effective: 0,
        isEffective: false,
        include_in_stats: 0,
        includeInStats: false,
        owner_visible: 1,
        store_owner_visible: 1,
        visible_to_store_owner: 1,
      },
      draftData,
    ),
  );

  if (row.status && row.status !== 'problem') {
    await updateOrderStatusApi(row.id, 'problem').catch(() => null);
  }
  await updateOrderEffectiveApi(row.id, false).catch(() => null);

  clearRowDraft(row);
  ElMessage.success('问题订单已更新并同步为老板可见（不计入统计）');
  await fetchOrders();
  emitAdminSync('problem-order-saved', {
    scopes: ['problem-orders', 'orders', 'dashboard', 'store-data', 'stats', 'online-user-orders'],
  });
}

async function confirmComplete(row) {
  if (!canCompleteProblem.value) {
    ElMessage.error('权限不足');
    return;
  }

  await ElMessageBox.confirm(`确认将问题订单 ${row.order_no} 标记为已完成并重新计入统计吗？`, '订单已完成', { type: 'warning' });
  const draftData = getDraftSnapshot(row);
  await completeProblemOrderApi(
    row.id,
    buildProblemPayload(
      row,
      {
        status: 'completed',
        is_effective: 1,
        isEffective: true,
        include_in_stats: 1,
        includeInStats: true,
        owner_visible: 1,
        store_owner_visible: 1,
        visible_to_store_owner: 1,
      },
      draftData,
    ),
  ).catch(async () => {
    await updateProblemOrderApi(
      row.id,
      buildProblemPayload(
        row,
        {
          status: 'completed',
          is_effective: 1,
          isEffective: true,
          include_in_stats: 1,
          includeInStats: true,
        },
        draftData,
      ),
    ).catch(() => null);
    await updateOrderStatusApi(row.id, 'completed');
  });
  await updateOrderEffectiveApi(row.id, true).catch(() => null);

  clearRowDraft(row);
  ElMessage.success('问题订单已完成，统计已刷新');
  await fetchOrders();
  emitAdminSync('problem-order-completed', {
    scopes: ['problem-orders', 'orders', 'dashboard', 'store-data', 'stats', 'online-user-orders'],
  });
}

function collectRollbackStatuses(row) {
  const historyBased = [
    row.before_problem_status,
    row.previous_status,
    row.prev_status,
    row.origin_status,
    row.normal_status,
    row.last_status,
  ];

  const normalized = historyBased
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => item !== 'problem');

  return [...new Set([...normalized, ...rollbackStatusCandidates])];
}

async function updateStatusWithFallback(orderId, statuses) {
  let lastError = null;
  for (const status of statuses) {
    try {
      await updateOrderStatusApi(orderId, status);
      return status;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function rollbackProblem(row) {
  if (!canRollbackProblem.value) {
    ElMessage.error('权限不足');
    return;
  }

  await ElMessageBox.confirm(`确认撤回问题订单 ${row.order_no} 吗？撤回后将恢复为普通订单。`, '撤回问题订单', {
    type: 'warning',
  });

  const targetStatusCandidates = collectRollbackStatuses(row);
  const fallbackStatus = targetStatusCandidates[0] || 'processing';
  let targetStatus = fallbackStatus;

  await revokeProblemOrderApi(row.id, {
    status: fallbackStatus,
    is_effective: 0,
    isEffective: false,
    include_in_stats: 0,
    includeInStats: false,
    owner_visible: 0,
    store_owner_visible: 0,
    visible_to_store_owner: 0,
  }).catch(async () => {
    targetStatus = await updateStatusWithFallback(row.id, targetStatusCandidates);
  });
  await updateOrderEffectiveApi(row.id, false).catch(() => null);

  clearRowDraft(row);
  ElMessage.success(`已撤回为「${orderStatusText(targetStatus)}」状态`);
  await fetchOrders();
  emitAdminSync('problem-order-rollback', {
    scopes: ['problem-orders', 'orders', 'dashboard', 'store-data', 'stats', 'online-user-orders'],
  });
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    if (hasUnsavedDrafts.value) return;
    fetchOrders();
  }, REFRESH_INTERVAL);
}

function onVisibleRefresh() {
  if (document.hidden || hasUnsavedDrafts.value) return;
  fetchOrders();
}

function onSyncEvent(event) {
  if (hasUnsavedDrafts.value) return;
  const reason = String(event?.detail?.reason || '');
  if (['store-created', 'store-updated', 'store-deleted'].includes(reason)) {
    fetchStores().catch(() => null);
  }
  fetchOrders();
}

onMounted(async () => {
  await fetchStores();
  await fetchOrders();
  setupAutoRefresh();
  onAdminSync(onSyncEvent);
  document.addEventListener('visibilitychange', onVisibleRefresh);
});

onUnmounted(() => {
  offAdminSync(onSyncEvent);
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
  document.removeEventListener('visibilitychange', onVisibleRefresh);
});
</script>

<style scoped>
.problem-filter-form {
  width: 100%;
}

.draft-alert {
  margin-bottom: 12px;
}

.money-cell {
  font-weight: 620;
  color: #1f2430;
}

.op-cell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}

.readonly-tip {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
