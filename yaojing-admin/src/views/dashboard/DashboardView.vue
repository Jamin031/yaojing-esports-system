<template>
  <div class="page-shell">
    <div class="dash-head">
      <h2 class="page-title">仪表盘</h2>
      <el-button type="primary" :loading="loading" @click="handleManualRefresh">手动刷新</el-button>
    </div>
    <div class="refresh-time">最近刷新：{{ lastRefreshText }}</div>
    <el-alert v-if="isStoreOwner" type="info" :closable="false" show-icon class="owner-scope-tip" :title="ownerScopeTip" />

    <el-row :gutter="16" class="cards">
      <el-col :xs="24" :sm="12" :lg="6">
        <DataCard label="今日订单数" :value="stats.today_order_count" hint="自动同步" />
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
          :hint="isStoreOwner ? `网吧排名：第${stats.store_rank || '-'}名` : '平台累计'"
        />
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <div class="card-surface chart-box">
          <div class="chart-title">{{ rankingTitle }}</div>
          <div ref="rankRef" class="chart" />

          <el-table :data="rankingRows" stripe size="small" class="rank-table">
            <el-table-column prop="store_name" label="网吧名称" min-width="140" />
            <el-table-column prop="rank" label="排名" width="90" />
            <el-table-column v-if="canViewAllStoreSensitiveAmount" label="收入" min-width="120">
              <template #default="{ row }">¥{{ money(row.income) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :xs="24" :lg="12">
        <div class="card-surface chart-box">
          <div class="chart-title">{{ isStoreOwner ? '我的高峰时段' : '高峰时间段' }}</div>
          <div ref="peakRef" class="chart" />
        </div>
      </el-col>
    </el-row>

    <el-row v-if="!isStoreOwner" :gutter="16" class="compare-cards">
      <el-col :xs="12" :sm="8" :lg="4">
        <DataCard label="线上收益" :value="`¥${money(stats.income_compare.online_income)}`" />
      </el-col>
      <el-col :xs="12" :sm="8" :lg="4">
        <DataCard label="线下收益" :value="`¥${money(stats.income_compare.offline_income)}`" />
      </el-col>
      <el-col :xs="12" :sm="8" :lg="4">
        <DataCard label="综合收益" :value="`¥${money(stats.income_compare.total_income)}`" />
      </el-col>
      <el-col :xs="12" :sm="8" :lg="4">
        <DataCard label="线上订单数" :value="stats.income_compare.online_order_count" />
      </el-col>
      <el-col :xs="12" :sm="8" :lg="4">
        <DataCard label="线下订单数" :value="stats.income_compare.offline_order_count" />
      </el-col>
      <el-col :xs="12" :sm="8" :lg="4">
        <DataCard label="综合订单数" :value="stats.income_compare.total_order_count" />
      </el-col>
    </el-row>

    <el-row v-if="!isStoreOwner" :gutter="16" class="second-row">
      <el-col :xs="24" :lg="12">
        <div class="card-surface chart-box">
          <div class="chart-title">陪玩店利用率</div>
          <div v-if="utilHasData" ref="utilRef" class="chart" />
          <el-empty v-else description="暂无陪玩店利用率数据" :image-size="88" />
        </div>
      </el-col>
      <el-col :xs="24" :lg="12">
        <div class="card-surface chart-box">
          <div class="chart-title">线上 / 线下 / 综合收益与订单数对比</div>
          <div v-if="compareHasData" ref="compareRef" class="chart" />
          <el-empty v-else description="暂无线上/线下对比数据" :image-size="88" />
        </div>
      </el-col>
    </el-row>

    <el-row v-if="!isStoreOwner" :gutter="16" class="third-row">
      <el-col :xs="24">
        <div class="card-surface chart-box">
          <div class="chart-title">线上 / 线下高峰时段对比</div>
          <div v-if="peakCompareHasData" ref="peakCompareRef" class="chart peak-compare-chart" />
          <el-empty v-else description="暂无高峰时段对比数据" :image-size="88" />
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
import { offAdminSync, onAdminSync } from '../../utils/adminSync';
import { getList, getPayloadObject } from '../../utils/api';
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

const canLoadOwnerScopedStats = computed(() => {
  if (!isStoreOwner.value) return true;
  return canViewOwnStoreStats.value && hasOwnerScope(ownerStoreScope.value);
});

const ownerScopeTip = computed(() => {
  if (!canViewOwnStoreStats.value) {
    return '当前账号未开通“查看自己网吧统计数据”权限。';
  }
  if (!hasOwnerScope(ownerStoreScope.value)) {
    return '当前账号未绑定可查看的网吧范围。';
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
  if (!isStoreOwner.value) return '各网吧排名';
  if (canViewAllStoreSensitiveAmount.value) return '全网网吧排名（含金额）';
  return '全网网吧排名（仅名次）';
});

const refreshTimer = ref(null);
const rankingRows = ref([]);
const loading = ref(false);
const lastRefreshAt = ref(0);
const pendingReload = ref(false);
const fetchSeq = ref(0);

const stats = reactive({
  today_order_count: 0,
  today_income: 0,
  month_income: 0,
  total_commission: 0,
  own_total_share: 0,
  store_rank: null,
  peak_hours: [],
  own_peak_hours: [],
  play_store_utilization: [],
  income_compare: {
    online_income: 0,
    offline_income: 0,
    total_income: 0,
    online_order_count: 0,
    offline_order_count: 0,
    total_order_count: 0,
  },
  peak_compare: [],
});

const utilHasData = computed(() => stats.play_store_utilization.some((item) => toNumber(item.count ?? item.value ?? item.usage ?? item.utilization) > 0));
const compareHasData = computed(
  () =>
    toNumber(stats.income_compare.online_income) > 0 ||
    toNumber(stats.income_compare.offline_income) > 0 ||
    toNumber(stats.income_compare.total_income) > 0 ||
    toNumber(stats.income_compare.online_order_count) > 0 ||
    toNumber(stats.income_compare.offline_order_count) > 0,
);
const peakCompareHasData = computed(() => stats.peak_compare.length > 0);

const lastRefreshText = computed(() => {
  if (!lastRefreshAt.value) return '尚未刷新';
  const date = new Date(lastRefreshAt.value);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
});

const rankRef = ref();
const peakRef = ref();
const utilRef = ref();
const compareRef = ref();
const peakCompareRef = ref();

let rankChart;
let peakChart;
let utilChart;
let compareChart;
let peakCompareChart;

function money(v) {
  return Number(v || 0).toFixed(2);
}

function toNumber(v) {
  const num = Number(v || 0);
  return Number.isFinite(num) ? num : 0;
}

function pickNumber(payload, keys, fallback = 0) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(payload || {}, key)) continue;
    return toNumber(payload[key]);
  }
  return fallback;
}

function firstArray(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value) && value.length) {
      return value;
    }
  }
  return [];
}

function resetStatsState() {
  Object.assign(stats, {
    today_order_count: 0,
    today_income: 0,
    month_income: 0,
    total_commission: 0,
    own_total_share: 0,
    store_rank: null,
    peak_hours: [],
    own_peak_hours: [],
    play_store_utilization: [],
    income_compare: {
      online_income: 0,
      offline_income: 0,
      total_income: 0,
      online_order_count: 0,
      offline_order_count: 0,
      total_order_count: 0,
    },
    peak_compare: [],
  });
}

function normalizeRankingRows(rows) {
  const normalized = rows.map((item) => ({
    store_name: item.store_name || item.storeName || item.name || item.store || item.netbar_name || '-',
    income: toNumber(item.income ?? item.total_income ?? item.revenue ?? item.amount ?? item.month_income ?? item.today_income),
    rank: toNumber(item.rank ?? item.ranking ?? item.position ?? item.index),
  }));

  const sorted = normalized.sort((a, b) => b.income - a.income);
  return sorted.map((item, index) => ({
    ...item,
    rank: item.rank > 0 ? item.rank : index + 1,
  }));
}

function applyOwnerRankingScope(rows) {
  if (!isStoreOwner.value) return rows;
  if (canViewAllStoreRanking.value) return rows;
  if (!hasOwnerScope(ownerStoreScope.value)) return [];
  return filterRowsByOwnerScope(rows, ownerStoreScope.value);
}

function maskSensitiveRankingIncome(rows) {
  return rows.map((item) => ({
    ...item,
    income: 0,
  }));
}

async function resolveRanking(payload) {
  const fromStats = firstArray(payload, ['store_ranking', 'storeRanking', 'store_rankings', 'rankings', 'rank_list', 'ranking']);
  if (fromStats.length) {
    const normalizedFromStats = applyOwnerRankingScope(normalizeRankingRows(fromStats));
    if (!isStoreOwner.value || !canViewAllStoreRanking.value || normalizedFromStats.length > 1) {
      return normalizedFromStats;
    }
  }

  const storeRows = firstArray(payload, ['store_data', 'storeData', 'stores']);
  if (storeRows.length) {
    const normalizedStoreRows = applyOwnerRankingScope(normalizeRankingRows(storeRows));
    if (!isStoreOwner.value || !canViewAllStoreRanking.value || normalizedStoreRows.length > 1) {
      return normalizedStoreRows;
    }
  }

  const fallbackQuery = isStoreOwner.value && !canViewAllStoreRanking.value ? withOwnerStoreQuery({}, authStore.role, authStore.userInfo) : {};
  const storeDataResp = await getStoreDataApi(fallbackQuery).catch(() => null);
  const fallbackRows = getList(storeDataResp);
  return applyOwnerRankingScope(normalizeRankingRows(fallbackRows));
}

function resolvePeakRows(payload) {
  return firstArray(payload, ['peak_hours', 'peakHours', 'hourly_peak', 'peak_time_list']);
}

function resolveOwnPeakRows(payload) {
  const rows = firstArray(payload, ['own_peak_hours', 'store_peak_hours', 'my_peak_hours']);
  return rows.length ? rows : resolvePeakRows(payload);
}

function resolveUtilRows(payload) {
  return firstArray(payload, ['play_store_utilization', 'playStoreUtilization', 'play_store_usage', 'playStoreUsage']);
}

function resolveIncomeCompare(payload) {
  const compare = payload.income_compare || payload.incomeCompare || payload.revenue_compare || payload.revenueCompare || {};
  const onlineOrderCount = toNumber(compare.online_order_count ?? compare.onlineOrderCount ?? compare.online_orders ?? compare.onlineOrders);
  const offlineOrderCount = toNumber(compare.offline_order_count ?? compare.offlineOrderCount ?? compare.offline_orders ?? compare.offlineOrders);
  const totalOrderCount = toNumber(compare.total_order_count ?? compare.totalOrderCount) || onlineOrderCount + offlineOrderCount;
  return {
    online_income: toNumber(compare.online_income ?? compare.onlineIncome ?? compare.online),
    offline_income: toNumber(compare.offline_income ?? compare.offlineIncome ?? compare.offline),
    total_income: toNumber(compare.total_income ?? compare.totalIncome ?? compare.total),
    online_order_count: onlineOrderCount,
    offline_order_count: offlineOrderCount,
    total_order_count: totalOrderCount,
  };
}

function mergePeakCompareFromDualSeries(onlineRows, offlineRows) {
  const map = new Map();
  onlineRows.forEach((item) => {
    const hour = item.hour || item.label || item.time || '-';
    map.set(hour, {
      hour,
      online_count: toNumber(item.count ?? item.value ?? item.orders ?? item.order_count),
      offline_count: 0,
    });
  });
  offlineRows.forEach((item) => {
    const hour = item.hour || item.label || item.time || '-';
    const current = map.get(hour) || { hour, online_count: 0, offline_count: 0 };
    current.offline_count = toNumber(item.count ?? item.value ?? item.orders ?? item.order_count);
    map.set(hour, current);
  });
  return Array.from(map.values()).sort((a, b) => String(a.hour).localeCompare(String(b.hour)));
}

function resolvePeakCompareRows(payload) {
  const direct = firstArray(payload, [
    'peak_compare',
    'peakCompare',
    'online_offline_peak_compare',
    'onlineOfflinePeakCompare',
    'online_offline_peak_hours',
    'onlineOfflinePeakHours',
  ]);
  if (direct.length) {
    return direct.map((item) => ({
      hour: item.hour || item.time || item.label || '-',
      online_count: toNumber(item.online_count ?? item.onlineCount ?? item.online_orders ?? item.onlineOrders ?? item.online),
      offline_count: toNumber(item.offline_count ?? item.offlineCount ?? item.offline_orders ?? item.offlineOrders ?? item.offline),
    }));
  }

  const onlineRows = firstArray(payload, ['online_peak_hours', 'onlinePeakHours', 'online_hourly_peak']);
  const offlineRows = firstArray(payload, ['offline_peak_hours', 'offlinePeakHours', 'offline_hourly_peak']);
  if (onlineRows.length || offlineRows.length) {
    return mergePeakCompareFromDualSeries(onlineRows, offlineRows);
  }
  return [];
}

function buildRankSeries() {
  const labels = rankingRows.value.map((item) => item.store_name || '-');

  const useRankSeries = isStoreOwner.value && !canViewAllStoreSensitiveAmount.value;
  if (useRankSeries) {
    return {
      labels,
      values: rankingRows.value.map((item) => toNumber(item.rank)),
      axisLabel: '名次',
      color: '#4a90e2',
      inverse: true,
    };
  }

  return {
    labels,
    values: rankingRows.value.map((item) => toNumber(item.income)),
    axisLabel: '收入',
    color: '#ff7a00',
    inverse: false,
  };
}

function renderRankChart() {
  if (!rankRef.value) return;
  rankChart?.dispose();
  rankChart = echarts.init(rankRef.value);

  const source = buildRankSeries();
  rankChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 20, left: 32, right: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: source.labels,
      axisLine: { lineStyle: { color: '#d8dce4' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: {
      type: 'value',
      name: source.axisLabel,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf1f5' } },
      axisLabel: { color: '#6b7280' },
      inverse: source.inverse,
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        barWidth: 20,
        data: source.values,
        itemStyle: {
          color: source.color,
          borderRadius: [8, 8, 0, 0],
        },
      },
    ],
  });
}

function renderPeakChart() {
  if (!peakRef.value) return;
  peakChart?.dispose();
  peakChart = echarts.init(peakRef.value);

  const source = isStoreOwner.value ? stats.own_peak_hours : stats.peak_hours;
  const labels = source.map((item) => item.hour || item.label || item.time || '-');
  const values = source.map((item) => toNumber(item.count ?? item.value));

  peakChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 20, left: 32, right: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#d8dce4' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf1f5' } },
      axisLabel: { color: '#6b7280' },
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        barWidth: 20,
        data: values,
        itemStyle: {
          color: '#ff7a00',
          borderRadius: [8, 8, 0, 0],
        },
      },
    ],
  });
}

function renderUtilChart() {
  if (!utilRef.value || isStoreOwner.value || !utilHasData.value) {
    utilChart?.dispose();
    utilChart = null;
    return;
  }
  utilChart?.dispose();
  utilChart = echarts.init(utilRef.value);

  const source = stats.play_store_utilization.map((item) => ({
    name: item.name || item.play_store_name || '-',
    value: toNumber(item.count ?? item.value ?? item.usage ?? item.utilization),
  }));

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
          formatter: '{b}\\n{d}% ',
        },
        data: source,
      },
    ],
    color: ['#ff7a00', '#ff9e47', '#ffbb78', '#ffd8b3', '#ffeddd'],
  });
}

function renderCompareChart() {
  if (!compareRef.value || isStoreOwner.value || !compareHasData.value) {
    compareChart?.dispose();
    compareChart = null;
    return;
  }
  compareChart?.dispose();
  compareChart = echarts.init(compareRef.value);

  const compare = stats.income_compare;
  const labels = ['线上', '线下', '综合'];
  const incomeData = [compare.online_income, compare.offline_income, compare.total_income].map((item) => toNumber(item));
  const orderData = [compare.online_order_count, compare.offline_order_count, compare.total_order_count].map((item) => toNumber(item));

  compareChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: '#6b7280' },
      data: ['收益', '订单数'],
    },
    grid: { top: 36, left: 32, right: 32, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#d8dce4' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: [
      {
        type: 'value',
        name: '收益(¥)',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#edf1f5' } },
        axisLabel: { color: '#6b7280' },
      },
      {
        type: 'value',
        name: '订单数',
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#6b7280' },
        minInterval: 1,
      },
    ],
    series: [
      {
        name: '收益',
        type: 'bar',
        barWidth: 24,
        data: incomeData,
        itemStyle: {
          color: '#111218',
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: '订单数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        data: orderData,
        lineStyle: { color: '#ff7a00', width: 2.5 },
        itemStyle: { color: '#ff7a00' },
      },
    ],
  });
}

function renderPeakCompareChart() {
  if (!peakCompareRef.value || isStoreOwner.value || !peakCompareHasData.value) {
    peakCompareChart?.dispose();
    peakCompareChart = null;
    return;
  }
  peakCompareChart?.dispose();
  peakCompareChart = echarts.init(peakCompareRef.value);

  const labels = stats.peak_compare.map((item) => item.hour || '-');
  const onlineValues = stats.peak_compare.map((item) => toNumber(item.online_count));
  const offlineValues = stats.peak_compare.map((item) => toNumber(item.offline_count));

  peakCompareChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: '#6b7280' },
      data: ['线上订单', '线下订单'],
    },
    grid: { top: 38, left: 30, right: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#d8dce4' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf1f5' } },
      axisLabel: { color: '#6b7280' },
      minInterval: 1,
    },
    series: [
      {
        name: '线上订单',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: onlineValues,
        lineStyle: { color: '#5b8def', width: 2.5 },
        itemStyle: { color: '#5b8def' },
      },
      {
        name: '线下订单',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: offlineValues,
        lineStyle: { color: '#ff7a00', width: 2.5 },
        itemStyle: { color: '#ff7a00' },
      },
    ],
  });
}

function renderAllCharts() {
  renderRankChart();
  renderPeakChart();
  renderUtilChart();
  renderCompareChart();
  renderPeakCompareChart();
}

async function loadDashboard(silent = true) {
  if (loading.value) {
    pendingReload.value = true;
    return;
  }
  const currentSeq = ++fetchSeq.value;
  loading.value = true;
  try {
    const statsQuery = canLoadOwnerScopedStats.value ? withOwnerStoreQuery({}, authStore.role, authStore.userInfo) : {};
    const resp = await getStatsApi(statsQuery);
    if (currentSeq !== fetchSeq.value) return;
    const payload = getPayloadObject(resp);
    const shouldHydrateScopedStats = !isStoreOwner.value || canLoadOwnerScopedStats.value;

    if (shouldHydrateScopedStats) {
      stats.today_order_count = pickNumber(payload, ['today_order_count', 'todayOrderCount', 'today_orders', 'todayOrders']);
      stats.today_income = pickNumber(payload, ['today_income', 'todayIncome', 'today_revenue', 'todayRevenue']);
      stats.month_income = pickNumber(payload, ['month_income', 'monthIncome', 'month_revenue', 'monthRevenue']);
      stats.total_commission = toNumber(payload.total_commission ?? payload.totalCommission);
      stats.own_total_share = toNumber(payload.own_total_share ?? payload.ownTotalShare);
      stats.store_rank = toNumber(payload.store_rank ?? payload.storeRank) || null;
      stats.peak_hours = resolvePeakRows(payload);
      stats.own_peak_hours = resolveOwnPeakRows(payload);
      stats.play_store_utilization = resolveUtilRows(payload);
      stats.income_compare = resolveIncomeCompare(payload);
      stats.peak_compare = resolvePeakCompareRows(payload);
    } else {
      stats.today_order_count = 0;
      stats.today_income = 0;
      stats.month_income = 0;
      stats.total_commission = 0;
      stats.own_total_share = 0;
      stats.store_rank = null;
      stats.peak_hours = [];
      stats.own_peak_hours = [];
      stats.play_store_utilization = [];
      stats.income_compare = {
        online_income: 0,
        offline_income: 0,
        total_income: 0,
        online_order_count: 0,
        offline_order_count: 0,
        total_order_count: 0,
      };
      stats.peak_compare = [];
    }

    const rankingCandidates = await resolveRanking(payload);
    rankingRows.value = isStoreOwner.value && !canViewAllStoreSensitiveAmount.value ? maskSensitiveRankingIncome(rankingCandidates) : rankingCandidates;
    lastRefreshAt.value = Date.now();
  } catch (error) {
    resetStatsState();
    rankingRows.value = [];
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
  renderAllCharts();

  if (pendingReload.value) {
    pendingReload.value = false;
    loadDashboard(true);
  }
}

function handleManualRefresh() {
  loadDashboard(false);
}

function onResize() {
  rankChart?.resize();
  peakChart?.resize();
  utilChart?.resize();
  compareChart?.resize();
  peakCompareChart?.resize();
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    loadDashboard(true);
  }, 20000);
}

function onVisibleRefresh() {
  if (document.hidden) return;
  loadDashboard(true);
}

function onSyncEvent() {
  loadDashboard(true);
}

onMounted(() => {
  loadDashboard(true);
  setupAutoRefresh();
  onAdminSync(onSyncEvent);
  document.addEventListener('visibilitychange', onVisibleRefresh);
  window.addEventListener('resize', onResize);
});

watch(
  () => [authStore.userInfo, authStore.role],
  () => {
    loadDashboard(true);
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

  rankChart?.dispose();
  peakChart?.dispose();
  utilChart?.dispose();
  compareChart?.dispose();
  peakCompareChart?.dispose();
});
</script>

<style scoped>
.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(218, 223, 232, 0.75);
  position: relative;
}

.dash-head .page-title {
  margin: 0;
}

.dash-head::after {
  content: '为竞技而生';
  position: absolute;
  right: 120px;
  top: 2px;
  color: rgba(255, 122, 0, 0.9);
  font-size: 11px;
  letter-spacing: 0.14em;
  font-weight: 600;
}

.refresh-time {
  margin-top: -1px;
  margin-bottom: 18px;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.owner-scope-tip {
  margin-bottom: 16px;
}

.cards {
  margin-bottom: 20px;
}

.compare-cards {
  margin-top: 18px;
}

.second-row {
  margin-top: 18px;
}

.third-row {
  margin-top: 18px;
}

.chart-box {
  padding: 18px 18px 16px;
  min-height: 100%;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
}

.chart-title {
  font-size: 16px;
  font-weight: 620;
  margin-bottom: 12px;
  letter-spacing: -0.01em;
  color: #1a1d23;
}

.chart {
  height: 310px;
}

.peak-compare-chart {
  height: 348px;
}

.rank-table {
  margin-top: 14px;
}

@media (max-width: 900px) {
  .dash-head::after {
    position: static;
    display: inline-block;
    margin-left: auto;
  }
}
</style>
