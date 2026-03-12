<template>
  <div class="page-shell">
    <div class="stats-head">
      <h2 class="page-title">统计分析</h2>
      <el-button type="primary" :loading="loading" @click="handleManualRefresh">手动刷新</el-button>
    </div>
    <div class="refresh-time">最近刷新：{{ lastRefreshText }}</div>

    <el-alert
      v-if="isStoreOwner"
      type="info"
      :closable="false"
      show-icon
      class="owner-scope-tip"
      :title="ownerScopeTip"
    />

    <el-row :gutter="16" class="cards">
      <el-col :xs="24" :sm="12" :lg="6">
        <DataCard label="今日订单数" :value="stats.today_order_count" />
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <DataCard label="今日收入" :value="`¥${money(stats.today_income)}`" />
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <DataCard label="本月收入" :value="`¥${money(stats.month_income)}`" />
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <DataCard
          :label="isStoreOwner ? '我的总抽成' : '总抽成'"
          :value="`¥${money(isStoreOwner ? stats.own_total_share : stats.total_commission)}`"
        />
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="14">
        <div class="card-surface chart-box">
          <div class="chart-title">{{ rankingTitle }}</div>
          <div ref="storeRankRef" class="chart" />

          <el-table :data="rankingRows" stripe size="small" class="rank-table">
            <el-table-column prop="store_name" label="网吧" min-width="150" />
            <el-table-column prop="rank" label="排名" width="90" />
            <el-table-column v-if="canViewAllStoreSensitiveAmount" label="收入" min-width="130">
              <template #default="{ row }">¥{{ money(row.income) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>

      <el-col v-if="!isStoreOwner" :xs="24" :lg="10">
        <div class="card-surface chart-box">
          <div class="chart-title">陪玩店利用率</div>
          <div v-if="utilHasData" ref="playUtilRef" class="chart" />
          <el-empty v-else description="暂无陪玩店利用率数据" :image-size="88" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import DataCard from '../../components/DataCard.vue';
import { getStatsApi } from '../../api/stats';
import { getStoreDataApi } from '../../api/storeData';
import { useAuthStore } from '../../store/auth';
import { usePermission } from '../../composables/usePermission';
import { getList, getPayloadObject } from '../../utils/api';
import { offAdminSync, onAdminSync } from '../../utils/adminSync';
import { filterRowsByOwnerScope, hasOwnerScope, resolveOwnerStoreScope, withOwnerStoreQuery } from '../../utils/storeScope';
import {
  ALL_STORE_RANKING_VIEW_KEYS,
  ALL_STORE_SENSITIVE_AMOUNT_VIEW_KEYS,
  STATS_SELF_VIEW_KEYS,
} from '../../utils/viewPermissionKeys';

const authStore = useAuthStore();
const { hasAnyView, hasExplicit } = usePermission();

const isStoreOwner = computed(() => authStore.role === 'store_owner');
const ownerStoreScope = computed(() => resolveOwnerStoreScope(authStore.userInfo));
const hasViewLayer = computed(() => hasExplicit('views'));

const canViewOwnStoreStats = computed(() => {
  if (!isStoreOwner.value) return true;
  if (!hasViewLayer.value) return true;
  return hasAnyView(STATS_SELF_VIEW_KEYS);
});

const canViewAllStoreRanking = computed(() => {
  if (!isStoreOwner.value) return true;
  if (!hasViewLayer.value) return true;
  return hasAnyView(ALL_STORE_RANKING_VIEW_KEYS);
});

const canViewAllStoreSensitiveAmount = computed(() => {
  if (!isStoreOwner.value) return true;
  if (!hasViewLayer.value) return false;
  return hasAnyView(ALL_STORE_SENSITIVE_AMOUNT_VIEW_KEYS);
});

const ownerScopeTip = computed(() => {
  if (!canViewOwnStoreStats.value) {
    return '当前账号未开通“查看自己网吧统计数据”权限。';
  }
  if (!canViewAllStoreRanking.value) {
    return '当前账号仅可查看自己网吧排名。';
  }
  if (!canViewAllStoreSensitiveAmount.value) {
    return '当前账号可查看全网网吧排名，但不可查看全网敏感金额。';
  }
  return '当前账号可查看全网网吧排名与敏感金额。';
});

const rankingTitle = computed(() => {
  if (!isStoreOwner.value) return '各网吧收入排名';
  if (canViewAllStoreSensitiveAmount.value) return '全网网吧排名（含金额）';
  return '全网网吧排名（仅名次）';
});

const refreshTimer = ref(null);
const loading = ref(false);
const lastRefreshAt = ref(0);
const pendingReload = ref(false);
const fetchSeq = ref(0);

const rankingRows = ref([]);

const stats = reactive({
  today_order_count: 0,
  today_income: 0,
  month_income: 0,
  total_commission: 0,
  own_total_share: 0,
  store_ranking: [],
  play_store_utilization: [],
});

const utilHasData = computed(() =>
  stats.play_store_utilization.some((item) => toNumber(item.count ?? item.value ?? item.usage ?? item.utilization) > 0),
);

const lastRefreshText = computed(() => {
  if (!lastRefreshAt.value) return '尚未刷新';
  const date = new Date(lastRefreshAt.value);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
});

const storeRankRef = ref();
const playUtilRef = ref();
let storeChart;
let utilChart;

function money(v) {
  return Number(v || 0).toFixed(2);
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function firstArray(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function normalizeRankingRows(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map((item) => ({
    store_name: item.store_name || item.storeName || item.name || item.netbar_name || '-',
    income: toNumber(item.income ?? item.total_income ?? item.revenue ?? item.month_income ?? item.today_income),
    rank: toNumber(item.rank ?? item.ranking ?? item.position ?? item.index),
  }));

  const sorted = normalized.sort((a, b) => b.income - a.income);
  return sorted.map((item, index) => ({
    ...item,
    rank: item.rank > 0 ? item.rank : index + 1,
  }));
}

function maskSensitiveRankingIncome(rows) {
  return rows.map((item) => ({
    ...item,
    income: 0,
  }));
}

async function resolveOwnerRankingRows(payload) {
  if (!canViewAllStoreRanking.value) {
    const scoped = normalizeRankingRows(firstArray(payload, ['store_ranking', 'storeRanking']));
    return hasOwnerScope(ownerStoreScope.value) ? filterRowsByOwnerScope(scoped, ownerStoreScope.value) : [];
  }

  const directRows = normalizeRankingRows(firstArray(payload, ['store_ranking', 'storeRanking']));
  if (directRows.length > 1) {
    return directRows;
  }

  const storeDataResp = await getStoreDataApi({}).catch(() => null);
  const fallbackRows = normalizeRankingRows(getList(storeDataResp));
  return fallbackRows;
}

function resetStats() {
  Object.assign(stats, {
    today_order_count: 0,
    today_income: 0,
    month_income: 0,
    total_commission: 0,
    own_total_share: 0,
    store_ranking: [],
    play_store_utilization: [],
  });
  rankingRows.value = [];
}

function renderCharts() {
  if (!storeRankRef.value) return;

  storeChart?.dispose();
  storeChart = echarts.init(storeRankRef.value);

  const useIncomeSeries = canViewAllStoreSensitiveAmount.value;
  storeChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 20, left: 30, right: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: rankingRows.value.map((i) => i.store_name || '-'),
      axisLine: { lineStyle: { color: '#d9dde3' } },
      axisLabel: { color: '#666d7a' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eef1f4' } },
      axisLabel: { color: '#666d7a' },
      minInterval: 1,
      inverse: !useIncomeSeries,
    },
    series: [
      {
        type: 'bar',
        barWidth: 26,
        data: rankingRows.value.map((i) => Number(useIncomeSeries ? i.income : i.rank || 0)),
        itemStyle: {
          color: '#ff7a00',
          borderRadius: [8, 8, 0, 0],
        },
      },
    ],
  });

  if (!isStoreOwner.value && utilHasData.value && playUtilRef.value) {
    utilChart?.dispose();
    utilChart = echarts.init(playUtilRef.value);
    utilChart.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '52%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 3,
          },
          label: {
            color: '#5a616e',
            formatter: '{b}\n{d}% ',
          },
          data: stats.play_store_utilization.map((item) => ({
            name: item.name || item.play_store_name || '-',
            value: toNumber(item.count ?? item.value ?? item.usage ?? item.utilization),
          })),
        },
      ],
      color: ['#ff7a00', '#ff9e47', '#ffbb78', '#ffd8b3', '#ffeddd'],
    });
  } else {
    utilChart?.dispose();
    utilChart = null;
  }
}

async function fetchStats(silent = true) {
  if (loading.value) {
    pendingReload.value = true;
    return;
  }
  const currentSeq = ++fetchSeq.value;
  loading.value = true;
  try {
    const useOwnerScopedStatsQuery =
      !isStoreOwner.value || (canViewOwnStoreStats.value && hasOwnerScope(ownerStoreScope.value));
    const scopedQuery = useOwnerScopedStatsQuery ? withOwnerStoreQuery({}, authStore.role, authStore.userInfo) : {};
    const resp = await getStatsApi(scopedQuery);
    if (currentSeq !== fetchSeq.value) return;
    const payload = getPayloadObject(resp);

    if (isStoreOwner.value && (!canViewOwnStoreStats.value || !hasOwnerScope(ownerStoreScope.value))) {
      stats.today_order_count = 0;
      stats.today_income = 0;
      stats.month_income = 0;
      stats.total_commission = 0;
      stats.own_total_share = 0;
      stats.play_store_utilization = [];
    } else {
      stats.today_order_count = toNumber(payload.today_order_count ?? payload.todayOrderCount);
      stats.today_income = toNumber(payload.today_income ?? payload.todayIncome);
      stats.month_income = toNumber(payload.month_income ?? payload.monthIncome);
      stats.total_commission = toNumber(payload.total_commission ?? payload.totalCommission);
      stats.own_total_share = toNumber(payload.own_total_share ?? payload.ownTotalShare);
      stats.play_store_utilization = firstArray(payload, ['play_store_utilization', 'playStoreUtilization', 'play_store_usage', 'playStoreUsage']);
    }

    let resolvedRanking = [];
    if (isStoreOwner.value) {
      resolvedRanking = await resolveOwnerRankingRows(payload);
    } else {
      resolvedRanking = normalizeRankingRows(firstArray(payload, ['store_ranking', 'storeRanking']));
    }

    stats.store_ranking = canViewAllStoreSensitiveAmount.value ? resolvedRanking : maskSensitiveRankingIncome(resolvedRanking);
    rankingRows.value = stats.store_ranking;
    lastRefreshAt.value = Date.now();
  } catch (error) {
    resetStats();
    if (!silent) {
      ElMessage.error('刷新失败，请稍后重试');
    }
  } finally {
    if (currentSeq === fetchSeq.value) {
      loading.value = false;
    }
  }

  if (currentSeq !== fetchSeq.value) return;
  await nextTick();
  renderCharts();

  if (pendingReload.value) {
    pendingReload.value = false;
    fetchStats(true);
  }
}

function handleManualRefresh() {
  fetchStats(false);
}

function onResize() {
  storeChart?.resize();
  utilChart?.resize();
}

function onVisibleRefresh() {
  if (!document.hidden) {
    fetchStats(true);
  }
}

function onSyncEvent() {
  fetchStats(true);
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    fetchStats(true);
  }, 20000);
}

onMounted(() => {
  fetchStats(true);
  setupAutoRefresh();
  onAdminSync(onSyncEvent);
  document.addEventListener('visibilitychange', onVisibleRefresh);
  window.addEventListener('resize', onResize);
});

watch(
  () => [authStore.userInfo, authStore.role],
  () => {
    fetchStats(true);
  },
);

onUnmounted(() => {
  offAdminSync(onSyncEvent);
  document.removeEventListener('visibilitychange', onVisibleRefresh);
  window.removeEventListener('resize', onResize);
  pendingReload.value = false;
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
  storeChart?.dispose();
  utilChart?.dispose();
});
</script>

<style scoped>
.stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 4px;
}

.owner-scope-tip {
  margin-bottom: 14px;
}

.refresh-time {
  margin-top: -2px;
  margin-bottom: 18px;
  font-size: 12px;
  color: var(--text-secondary);
}

.cards {
  margin-bottom: 20px;
}

.chart-box {
  padding: 18px;
}

.chart-title {
  font-size: 17px;
  font-weight: 620;
  margin-bottom: 12px;
}

.chart {
  height: 320px;
}

.rank-table {
  margin-top: 14px;
}
</style>
