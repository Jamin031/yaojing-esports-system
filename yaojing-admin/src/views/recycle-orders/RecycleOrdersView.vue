<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">回收站</p>
        <h2 class="page-title">回收订单</h2>
        <p class="page-subtitle">已删除订单恢复与彻底删除控制台</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>回收订单</span>
          <strong>{{ pagination.total }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
      <el-alert type="info" :closable="false" show-icon title="回收订单不会计入统计，恢复后需重新确认完成才会重新计入。" />
      <el-form :inline="true" :model="filters" class="recycle-filter-form">
        <el-form-item label="删除时间">
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
        <el-form-item label="网吧">
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

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">回收订单列表</h3>
      </div>
      <el-table :data="orders" v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" min-width="170" />
        <el-table-column prop="store_name" label="来源网吧" min-width="130" />
        <el-table-column label="金额" min-width="110">
          <template #default="{ row }"><span class="money-cell">¥{{ money(row.order_amount) }}</span></template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="140">
          <template #default="{ row }">{{ contactText(row.contact) }}</template>
        </el-table-column>
        <el-table-column label="删除时间" min-width="150">
          <template #default="{ row }">{{ formatMinute(row.deleted_at || row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button v-if="canManageRecycle" link type="primary" @click="restore(row)">恢复</el-button>
              <el-button v-if="canPermanentDelete" link type="danger" @click="removePermanent(row)">彻底删除</el-button>
              <span v-if="!canManageRecycle" class="readonly-tip">当前账号无删除/恢复权限</span>
              <span v-else-if="!isSuperAdmin" class="readonly-tip">仅超级管理员可彻底删除</span>
              <span v-else-if="!canPermanentDelete" class="readonly-tip">当前账号无彻底删除权限</span>
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
import { getOrdersApi, permanentDeleteOrderApi, restoreOrderApi } from '../../api/orders';
import { getStoresApi } from '../../api/stores';
import { useAuthStore } from '../../store/auth';
import { usePermission } from '../../composables/usePermission';
import { emitAdminSync, offAdminSync, onAdminSync } from '../../utils/adminSync';
import { getList, getTotal } from '../../utils/api';
import { isOrderDeleted } from '../../utils/orderRules';

const authStore = useAuthStore();
const { hasButton } = usePermission();
const loading = ref(false);
const stores = ref([]);
const orders = ref([]);
const refreshTimer = ref(null);

const pagination = reactive({
  page: 1,
  page_size: 10,
  total: 0,
});

const filters = reactive({
  store_id: undefined,
  dateRange: [],
});

const isSuperAdmin = computed(() => authStore.role === 'super_admin');
const canManageRecycle = computed(() => hasButton('orders:delete') && authStore.role !== 'store_owner');
const canPermanentDelete = computed(() => isSuperAdmin.value && canManageRecycle.value && hasButton('orders:permanent_delete'));

function money(v) {
  return Number(v || 0).toFixed(2);
}

function contactText(contact) {
  if (!contact) return '匿名用户';
  const text = String(contact).trim();
  if (!text) return '匿名用户';
  if (['anonymous', '匿名', '匿名用户'].includes(text.toLowerCase())) return '匿名用户';
  return text;
}

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildQuery() {
  const query = {
    page: pagination.page,
    page_size: pagination.page_size,
    include_deleted: 1,
    is_deleted: 1,
    deleted: 1,
    only_deleted: 1,
    store_id: filters.store_id,
  };

  if (filters.dateRange?.length === 2) {
    query.deleted_start = filters.dateRange[0];
    query.deleted_end = filters.dateRange[1];
  }

  return query;
}

async function fetchStores() {
  const resp = await getStoresApi();
  stores.value = getList(resp);
}

async function fetchOrders() {
  loading.value = true;
  try {
    const resp = await getOrdersApi(buildQuery());
    const sourceRows = getList(resp);
    orders.value = sourceRows.filter((row) => isOrderDeleted(row));
    const total = Number(getTotal(resp));
    if (Number.isFinite(total)) {
      const shouldUseFilteredTotal =
        sourceRows.length > 0 && total === sourceRows.length && orders.value.length !== sourceRows.length;
      pagination.total = shouldUseFilteredTotal ? orders.value.length : total;
    } else {
      pagination.total = orders.value.length;
    }
  } finally {
    loading.value = false;
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

async function restore(row) {
  if (!canManageRecycle.value) {
    ElMessage.error('权限不足');
    return;
  }
  await restoreOrderApi(row.id);
  ElMessage.success('订单已恢复，请重新确认完成后再计入统计');
  await fetchOrders();
  emitAdminSync('recycle-order-restored');
}

async function removePermanent(row) {
  if (!canPermanentDelete.value) {
    ElMessage.error('权限不足');
    return;
  }

  await ElMessageBox.confirm(`确认彻底删除订单 ${row.order_no} 吗？此操作不可恢复。`, '彻底删除', { type: 'warning' });
  await permanentDeleteOrderApi(row.id);
  ElMessage.success('订单已彻底删除');
  await fetchOrders();
  emitAdminSync('recycle-order-permanent-delete');
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    fetchOrders();
  }, 15000);
}

function onVisibleRefresh() {
  if (!document.hidden) {
    fetchOrders();
  }
}

function onSyncEvent(event) {
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
.recycle-filter-form {
  margin-top: 12px;
  width: 100%;
}

.money-cell {
  font-weight: 620;
  color: #1f2430;
}

.op-cell {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
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
