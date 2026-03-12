<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">Online Orders</p>
        <h2 class="page-title">线上用户订单</h2>
        <p class="page-subtitle">线上来源订单识别与收入统计视图</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>线上订单</span>
          <strong>{{ overview.online_order_count }}</strong>
        </div>
        <div class="metric-chip">
          <span>综合收入</span>
          <strong>¥{{ money(overview.combined_income) }}</strong>
        </div>
      </div>
    </div>

    <el-row :gutter="16" class="cards">
      <el-col :xs="24" :sm="12" :lg="8">
        <div class="card-surface metric">
          <div class="metric-label">线上订单数</div>
          <div class="metric-value">{{ overview.online_order_count }}</div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <div class="card-surface metric">
          <div class="metric-label">线上收入</div>
          <div class="metric-value">¥{{ money(overview.online_income) }}</div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <div class="card-surface metric">
          <div class="metric-label">综合收入</div>
          <div class="metric-value">¥{{ money(overview.combined_income) }}</div>
        </div>
      </el-col>
    </el-row>

    <el-alert
      class="source-hint"
      type="info"
      :closable="false"
      show-icon
      :title="`线上订单包含：线上来源订单 + 缺失/已删除网吧订单；线下网吧订单数：${overview.offline_order_count}`"
    />

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters" class="online-filter-form">
        <el-form-item label="下单时间">
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

        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 170px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="runSearch">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">线上订单明细</h3>
      </div>
      <el-table :data="pagedOrders" v-loading="loading" stripe>
        <el-table-column label="下单时间" min-width="150">
          <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="150">
          <template #default="{ row }">{{ contactText(row.contact) }}</template>
        </el-table-column>
        <el-table-column prop="order_info" label="订单信息" min-width="220" show-overflow-tooltip />
        <el-table-column label="订单金额" min-width="120">
          <template #default="{ row }"><span class="money-cell">¥{{ money(resolveOrderAmount(row)) }}</span></template>
        </el-table-column>
        <el-table-column label="当前状态" min-width="140">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="订单归属" min-width="120">
          <template #default="{ row }">
            <el-tag :type="row._order_type === 'online' ? 'success' : 'info'">
              {{ row._order_type === 'online' ? '线上订单' : '线下网吧订单' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="来源标识" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row._source_tag || resolveSourceTag(row) }}</template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        background
        layout="total, sizes, prev, pager, next"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        @current-change="updatePagedOrders"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { getOrdersApi } from '../../api/orders';
import { offAdminSync, onAdminSync } from '../../utils/adminSync';
import { getList } from '../../utils/api';
import { isCountableCompletedOrder, resolveProblemAmount } from '../../utils/orderRules';

const ONLINE_DOMAIN_HINTS = String(import.meta.env.VITE_ONLINE_DOMAIN_HINTS || '')
  .split(',')
  .map((item) => String(item || '').trim())
  .filter(Boolean);

const ONLINE_SOURCE_KEYWORDS = String(import.meta.env.VITE_ONLINE_SOURCE_KEYWORDS || 'online,online_yaojing,线上,线上订单,线上用户')
  .split(',')
  .map((item) => String(item || '').trim().toLowerCase())
  .filter(Boolean);

const OFFLINE_SOURCE_KEYWORDS = ['offline', 'store', 'netbar', '线下', '网吧'];
const FULL_SCAN_PAGE_SIZE = 200;
const FULL_SCAN_MAX_PAGES = 30;

const loading = ref(false);
const allOrders = ref([]);
const allOnlineOrders = ref([]);
const allOfflineOrders = ref([]);
const pagedOrders = ref([]);
const refreshTimer = ref(null);
const fetchSeq = ref(0);

const overview = reactive({
  online_order_count: 0,
  online_income: 0,
  combined_income: 0,
  offline_order_count: 0,
});

const pagination = reactive({
  page: 1,
  page_size: 12,
  total: 0,
});

const filters = reactive({
  dateRange: [],
  status: undefined,
});

const statusOptions = [
  { label: '待联系', value: 'pending' },
  { label: '订单进行中', value: 'processing' },
  { label: '待联系(兼容)', value: 'pending_contact' },
  { label: '问题订单', value: 'problem' },
  { label: '订单已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
];

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) continue;
      return text;
    }
    return value;
  }
  return undefined;
}

function normalizeLowerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizedHost(value) {
  return normalizeLowerText(value).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function toSafeNumber(v) {
  const num = Number(v || 0);
  return Number.isFinite(num) ? num : 0;
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const text = normalizeLowerText(value);
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function money(v) {
  return toSafeNumber(v).toFixed(2);
}

function contactText(contact) {
  if (!contact) return '匿名用户';
  const text = String(contact).trim();
  if (!text) return '匿名用户';
  if (['anonymous', '匿名', '匿名用户'].includes(text.toLowerCase())) return '匿名用户';
  return text;
}

function statusText(status) {
  const map = {
    pending: '待联系',
    pending_contact: '待联系',
    processing: '订单进行中',
    problem: '问题订单',
    completed: '订单已完成',
    cancelled: '已取消',
  };
  return map[status] || status || '-';
}

function statusType(status) {
  if (status === 'completed') return 'success';
  if (status === 'problem') return 'danger';
  if (status === 'cancelled') return 'info';
  if (status === 'processing') return '';
  return 'warning';
}

function resolveOrderAmount(row) {
  return toSafeNumber(resolveProblemAmount(row));
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

function parseTime(value) {
  if (!value) return 0;
  const stamp = new Date(value).getTime();
  return Number.isNaN(stamp) ? 0 : stamp;
}

function hasExplicitOnlineFlag(order) {
  const value = firstNonEmpty(
    order.is_online,
    order.isOnline,
    order.online,
    order.online_order,
    order.onlineOrder,
    order.is_online_order,
    order.isOnlineOrder,
  );
  if (value === undefined) return null;
  return toBoolean(value, false);
}

function resolveStoreIdentity(order) {
  const storeId = firstNonEmpty(order.store_id, order.storeId, order.netbar_id, order.netbarId, order.source_store_id, order.sourceStoreId, order.store?.id);
  const storeName = String(
    firstNonEmpty(
      order.store_name,
      order.storeName,
      order.netbar_name,
      order.netbarName,
      order.source_store_name,
      order.sourceStoreName,
      order.store?.name,
      order.store?.title,
      '',
    ) || '',
  ).trim();

  return {
    storeId: storeId === undefined ? '' : String(storeId),
    storeName,
  };
}

function isMissingOrDeletedStore(order, identity) {
  const explicitDeleted = toBoolean(
    firstNonEmpty(
      order.store_deleted,
      order.storeDeleted,
      order.is_store_deleted,
      order.isStoreDeleted,
      order.store_missing,
      order.storeMissing,
      order.missing_store,
      order.missingStore,
    ),
    false,
  );
  if (explicitDeleted) return true;

  const hasStoreId = Boolean(identity.storeId);
  const storeName = normalizeLowerText(identity.storeName);
  const hasStoreName = Boolean(storeName && storeName !== '-');
  if (!hasStoreId && !hasStoreName) return true;

  const deletedNameMarkers = ['已删除网吧', 'deleted store', 'unknown store', '未知网吧', 'null'];
  return deletedNameMarkers.some((marker) => storeName.includes(marker));
}

function resolveSourceTag(order) {
  const candidates = [
    order.domain,
    order.subdomain,
    order.domain_prefix,
    order.source,
    order.source_type,
    order.sourceType,
    order.channel,
    order.order_channel,
    order.orderChannel,
    order.store_name,
    order.storeName,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (candidates.length) return candidates[0];
  if (order._missing_store) return '缺失网吧(已归入线上)';
  return '未知来源';
}

function resolveOrderType(order, identity, missingStore) {
  const explicitOnline = hasExplicitOnlineFlag(order);
  if (explicitOnline !== null) {
    return explicitOnline ? 'online' : 'offline';
  }

  const sourceKind = normalizeLowerText(
    firstNonEmpty(
      order.source_type,
      order.sourceType,
      order.order_channel,
      order.orderChannel,
      order.channel,
      order.channel_type,
      order.channelType,
      order.category,
      order.order_type,
      order.orderType,
      order.biz_type,
      order.bizType,
    ),
  );

  if (sourceKind) {
    if (ONLINE_SOURCE_KEYWORDS.some((keyword) => sourceKind.includes(keyword))) {
      return 'online';
    }
    if (OFFLINE_SOURCE_KEYWORDS.some((keyword) => sourceKind.includes(keyword))) {
      return 'offline';
    }
  }

  if (missingStore) {
    return 'online';
  }

  const rawFields = [
    order.domain,
    order.subdomain,
    order.domain_prefix,
    order.source,
    order.source_type,
    order.channel,
    identity.storeName,
  ];
  const normalized = rawFields.map((item) => normalizedHost(item)).filter(Boolean);

  const normalizedHints = ONLINE_DOMAIN_HINTS.map((item) => normalizedHost(item)).filter(Boolean);
  if (normalizedHints.length && normalized.some((item) => normalizedHints.includes(item))) {
    return 'online';
  }

  if (normalized.some((item) => ONLINE_SOURCE_KEYWORDS.some((keyword) => item.includes(keyword)))) {
    return 'online';
  }

  if (normalized.some((item) => item.includes('online'))) {
    return 'online';
  }

  return 'offline';
}

function normalizeOrderRow(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const identity = resolveStoreIdentity(raw);
  const missingStore = isMissingOrDeletedStore(raw, identity);
  const orderType = resolveOrderType(raw, identity, missingStore);

  return {
    ...raw,
    store_name: identity.storeName || raw.store_name || '-',
    _store_id: identity.storeId,
    _missing_store: missingStore,
    _order_type: orderType,
    _source_tag: resolveSourceTag({ ...raw, _missing_store: missingStore }),
  };
}

function normalizeKey(order) {
  return String(
    firstNonEmpty(
      order.id,
      order.order_id,
      order.orderId,
      order.order_no,
      order.orderNo,
      `${order.created_at || order.createdAt || ''}-${order.contact || ''}-${order.order_info || ''}`,
    ),
  );
}

function dedupeOrders(rows) {
  const map = new Map();
  rows.forEach((item) => {
    const key = normalizeKey(item);
    if (!key || map.has(key)) return;
    map.set(key, item);
  });

  return Array.from(map.values()).sort((a, b) => parseTime(b.created_at) - parseTime(a.created_at));
}

function buildServerQuery(pageNo) {
  const query = {
    page: pageNo,
    page_size: FULL_SCAN_PAGE_SIZE,
    status: filters.status,
  };

  if (filters.dateRange?.length === 2) {
    query.start_time = filters.dateRange[0];
    query.end_time = filters.dateRange[1];
  }

  return query;
}

async function scanOrders() {
  const merged = [];

  for (let pageNo = 1; pageNo <= FULL_SCAN_MAX_PAGES; pageNo += 1) {
    const resp = await getOrdersApi(buildServerQuery(pageNo));
    const rows = getList(resp);

    if (!Array.isArray(rows) || !rows.length) {
      break;
    }

    rows.forEach((row) => {
      const normalized = normalizeOrderRow(row);
      if (normalized) {
        merged.push(normalized);
      }
    });

    if (rows.length < FULL_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return dedupeOrders(merged);
}

function computeOverview() {
  const onlineRows = allOnlineOrders.value;
  const offlineRows = allOfflineOrders.value;

  const onlineCompletedIncome = onlineRows
    .filter((item) => isCountableCompletedOrder(item))
    .reduce((sum, item) => sum + resolveOrderAmount(item), 0);

  const offlineCompletedIncome = offlineRows
    .filter((item) => isCountableCompletedOrder(item))
    .reduce((sum, item) => sum + resolveOrderAmount(item), 0);

  overview.online_order_count = onlineRows.length;
  overview.offline_order_count = offlineRows.length;
  overview.online_income = onlineCompletedIncome;
  overview.combined_income = onlineCompletedIncome + offlineCompletedIncome;
}

function updatePagedOrders() {
  pagination.total = allOnlineOrders.value.length;
  const start = (pagination.page - 1) * pagination.page_size;
  const end = start + pagination.page_size;
  pagedOrders.value = allOnlineOrders.value.slice(start, end);
}

async function fetchOrders() {
  const currentSeq = ++fetchSeq.value;
  loading.value = true;
  try {
    allOrders.value = await scanOrders();
    if (currentSeq !== fetchSeq.value) return;
    allOnlineOrders.value = allOrders.value.filter((item) => item._order_type === 'online');
    allOfflineOrders.value = allOrders.value.filter((item) => item._order_type === 'offline');
    computeOverview();
    updatePagedOrders();
  } finally {
    if (currentSeq === fetchSeq.value) {
      loading.value = false;
    }
  }
}

function runSearch() {
  pagination.page = 1;
  fetchOrders();
}

function resetFilters() {
  filters.dateRange = [];
  filters.status = undefined;
  pagination.page = 1;
  fetchOrders();
}

function handleSizeChange(size) {
  pagination.page_size = size;
  pagination.page = 1;
  updatePagedOrders();
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    fetchOrders();
  }, 20000);
}

function onVisibleRefresh() {
  if (!document.hidden) {
    fetchOrders();
  }
}

function onSyncEvent() {
  fetchOrders();
}

onMounted(async () => {
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
.cards {
  margin-bottom: 16px;
}

.metric {
  padding: 18px 16px;
  border-radius: 16px;
}

.metric-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.metric-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 630;
  color: #171b24;
  font-variant-numeric: tabular-nums;
}

.online-filter-form {
  width: 100%;
}

.money-cell {
  font-weight: 620;
  color: #1f2430;
  font-variant-numeric: tabular-nums;
}

.source-hint {
  margin-bottom: 12px;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
