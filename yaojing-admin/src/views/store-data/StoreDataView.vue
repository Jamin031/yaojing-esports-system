<template>
  <div class="page-shell">
    <h2 class="page-title">网吧数据</h2>

    <div class="card-surface page-toolbar">
      <el-alert
        v-if="isStoreOwner && !canViewOwnStoreData"
        type="info"
        :closable="false"
        show-icon
        title="当前账号未开通“查看自己网吧数据”权限，可联系超级管理员发放。"
        class="page-alert"
      />
      <el-form :inline="true" :model="filters">
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

    <el-row :gutter="16" class="cards">
      <el-col :xs="24" :lg="15">
        <div class="card-surface page-table">
          <el-table :data="rows" v-loading="loading" stripe>
            <el-table-column prop="store_name" label="网吧" min-width="170" />
            <el-table-column prop="today_order_count" label="今日订单" min-width="110" />
            <el-table-column label="今日收入" min-width="130">
              <template #default="{ row }">¥{{ money(row.today_income) }}</template>
            </el-table-column>
            <el-table-column label="本月收入" min-width="130">
              <template #default="{ row }">¥{{ money(row.month_income) }}</template>
            </el-table-column>
            <el-table-column prop="peak_time" label="高峰时间" min-width="120" />
          </el-table>
        </div>
      </el-col>
      <el-col :xs="24" :lg="9">
        <div class="card-surface chart-box">
          <div class="chart-title">网吧今日订单柱状图</div>
          <div v-if="rows.length" ref="chartRef" class="chart" />
          <el-empty v-else description="暂无网吧数据" :image-size="88" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { getStoreDataApi } from '../../api/storeData';
import { getStoresApi } from '../../api/stores';
import { useAuthStore } from '../../store/auth';
import { usePermission } from '../../composables/usePermission';
import { offAdminSync, onAdminSync } from '../../utils/adminSync';
import { getList } from '../../utils/api';
import { filterRowsByOwnerScope, hasOwnerScope, resolveOwnerStoreScope, withOwnerStoreQuery } from '../../utils/storeScope';
import { STORE_DATA_SELF_VIEW_KEYS } from '../../utils/viewPermissionKeys';

const authStore = useAuthStore();
const { hasAnyView, hasExplicit } = usePermission();
const isStoreOwner = computed(() => authStore.role === 'store_owner');
const ownerStoreScope = computed(() => resolveOwnerStoreScope(authStore.userInfo));
const canViewOwnStoreData = computed(() => {
  if (!isStoreOwner.value) return true;
  if (!hasExplicit('views')) return true;
  return hasAnyView(STORE_DATA_SELF_VIEW_KEYS);
});

const loading = ref(false);
const rows = ref([]);
const stores = ref([]);
const chartRef = ref();
const refreshTimer = ref(null);
const fetchSeq = ref(0);
const REFRESH_INTERVAL = 20000;
let chart;

const filters = reactive({
  store_id: undefined,
});

function money(v) {
  return Number(v || 0).toFixed(2);
}

async function fetchStores() {
  if (isStoreOwner.value) return;
  const resp = await getStoresApi();
  stores.value = getList(resp);
}

async function fetchStoreData() {
  const currentSeq = ++fetchSeq.value;
  loading.value = true;
  try {
    if (isStoreOwner.value && !canViewOwnStoreData.value) {
      rows.value = [];
      return;
    }

    const query = withOwnerStoreQuery({ store_id: filters.store_id }, authStore.role, authStore.userInfo);
    const sourceRows = getList(await getStoreDataApi(query));
    if (currentSeq !== fetchSeq.value) return;
    rows.value = isStoreOwner.value
      ? hasOwnerScope(ownerStoreScope.value)
        ? filterRowsByOwnerScope(sourceRows, ownerStoreScope.value)
        : []
      : sourceRows;
  } finally {
    if (currentSeq === fetchSeq.value) {
      loading.value = false;
    }
  }

  if (currentSeq !== fetchSeq.value) return;
  await nextTick();
  renderChart();
}

function renderChart() {
  if (!chartRef.value || !rows.value.length) {
    chart?.dispose();
    chart = null;
    return;
  }
  chart?.dispose();
  chart = echarts.init(chartRef.value);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 20, left: 30, right: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.value.map((item) => item.store_name),
      axisLine: { lineStyle: { color: '#d8dce4' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf1f5' } },
      axisLabel: { color: '#6b7280' },
    },
    series: [
      {
        type: 'bar',
        barWidth: 18,
        data: rows.value.map((item) => Number(item.today_order_count || 0)),
        itemStyle: {
          color: '#f68b1f',
          borderRadius: [8, 8, 0, 0],
        },
      },
    ],
  });
}

function search() {
  fetchStoreData();
}

function reset() {
  filters.store_id = undefined;
  fetchStoreData();
}

function onResize() {
  chart?.resize();
}

function onSyncEvent() {
  fetchStoreData();
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    fetchStoreData();
  }, REFRESH_INTERVAL);
}

function onVisibleRefresh() {
  if (!document.hidden) {
    fetchStoreData();
  }
}

onMounted(async () => {
  await fetchStores();
  await fetchStoreData();
  setupAutoRefresh();
  onAdminSync(onSyncEvent);
  document.addEventListener('visibilitychange', onVisibleRefresh);
  window.addEventListener('resize', onResize);
});

watch(
  () => [authStore.userInfo, authStore.role],
  () => {
    fetchStoreData();
  },
);

onUnmounted(() => {
  offAdminSync(onSyncEvent);
  document.removeEventListener('visibilitychange', onVisibleRefresh);
  window.removeEventListener('resize', onResize);
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
  chart?.dispose();
});
</script>

<style scoped>
.cards {
  margin-top: 2px;
}

.chart-box {
  padding: 16px;
}

.page-alert {
  margin-bottom: 12px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 10px;
}

.chart {
  height: 420px;
}
</style>
