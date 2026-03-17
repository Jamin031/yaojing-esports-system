<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">设备风控中心</p>
        <h2 class="page-title">设备管理</h2>
        <p class="page-subtitle">按设备维度查看封禁状态、风险画像和最近关联订单，不再与订单主视图混在一起。</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>设备总数</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>已封禁</span>
          <strong>{{ blockedCount }}</strong>
        </div>
        <div class="metric-chip">
          <span>永久拉黑</span>
          <strong>{{ permanentCount }}</strong>
        </div>
        <div class="metric-chip">
          <span>高风险设备</span>
          <strong>{{ highRiskCount }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters" class="device-filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 160px">
            <el-option label="正常" value="normal" />
            <el-option label="已封禁" value="blocked" />
            <el-option label="永久拉黑" value="permanent" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="filters.source" clearable filterable placeholder="全部来源" style="width: 220px">
            <el-option v-for="item in sourceOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" clearable placeholder="device_id / 指纹 / 来源" style="width: 280px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">设备列表</h3>
        <span class="section-tip">手动封禁优先于自动封禁，垃圾订单联动和风控事件会实时刷新到这里。</span>
      </div>

      <el-table :data="list" v-loading="loading" stripe empty-text="暂无设备数据">
        <el-table-column prop="device_id" label="设备标识" min-width="220" show-overflow-tooltip />
        <el-table-column label="指纹摘要" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ maskFingerprint(row.fingerprint_hash) }}</template>
        </el-table-column>
        <el-table-column label="来源" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.source || '-' }}</template>
        </el-table-column>
        <el-table-column label="当前状态" min-width="108">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row)">{{ statusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="封禁类型" min-width="126">
          <template #default="{ row }">{{ blockTypeText(row) }}</template>
        </el-table-column>
        <el-table-column label="封禁开始" min-width="150">
          <template #default="{ row }">{{ formatMinute(row.blocked_at) }}</template>
        </el-table-column>
        <el-table-column label="封禁结束" min-width="160">
          <template #default="{ row }">{{ row.is_permanent ? '永久拉黑' : formatMinute(row.blocked_until) }}</template>
        </el-table-column>
        <el-table-column label="剩余时间" min-width="120">
          <template #default="{ row }">{{ remainingTimeText(row) }}</template>
        </el-table-column>
        <el-table-column label="最近关联订单" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div>{{ row.last_order_no || '-' }}</div>
              <div class="subtle">{{ formatMinute(row.last_order_at) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近风险等级" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div class="risk-row">
                <el-tag :type="riskLevelTagType(row.last_risk_level)" effect="light">{{ riskLevelText(row.last_risk_level) }}</el-tag>
                <strong class="risk-score">{{ row.last_risk_score || 0 }}</strong>
              </div>
              <div class="subtle">{{ riskFlagsSummary(row.last_risk_flags) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近风险原因" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ latestReasonText(row) }}</template>
        </el-table-column>
        <el-table-column label="最近操作人" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ operatorText(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="190" fixed="right">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button v-if="canBlock" link type="danger" @click="openBlockDialog(row)">拉黑</el-button>
              <el-button v-if="canUnblock && row.is_blocked" link type="primary" @click="openUnblockDialog(row)">解封</el-button>
              <el-button link type="info" @click="openDetailsDrawer(row)">详情</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        background
        layout="total, sizes, prev, pager, next"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        @size-change="handlePageSizeChange"
        @current-change="fetchDevices"
      />
    </div>

    <el-dialog v-model="blockDialog.visible" title="拉黑设备" width="520px">
      <el-form :model="blockDialog.form" label-width="96px">
        <el-form-item label="设备标识">
          <div class="device-id-box">{{ blockDialog.form.device_id }}</div>
        </el-form-item>
        <el-form-item label="拉黑时长">
          <el-select v-model="blockDialog.form.duration" style="width: 100%">
            <el-option v-for="item in durationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="blockDialog.form.reason" maxlength="255" placeholder="可选原因，例如垃圾订单、恶意刷单" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="blockDialog.form.remark" type="textarea" :rows="4" maxlength="500" placeholder="可选备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="blockDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitBlock">确认拉黑</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unblockDialog.visible" title="解封设备" width="520px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="此操作会解除当前设备的手动封禁、自动封禁或永久拉黑状态。"
      />
      <el-form :model="unblockDialog.form" label-width="96px" class="unblock-form">
        <el-form-item label="设备标识">
          <div class="device-id-box">{{ unblockDialog.form.device_id }}</div>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="unblockDialog.form.reason" maxlength="255" placeholder="可选原因" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="unblockDialog.form.remark" type="textarea" :rows="4" maxlength="500" placeholder="可选备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="unblockDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitUnblock">确认解封</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawer.visible" size="960px" :title="`设备详情 - ${detailDrawer.deviceId || ''}`">
      <div class="drawer-shell">
        <section class="detail-summary" v-if="detailDrawer.device">
          <div class="summary-item">
            <span>指纹摘要</span>
            <strong>{{ maskFingerprint(detailDrawer.device.fingerprint_hash) }}</strong>
          </div>
          <div class="summary-item">
            <span>最近风险等级</span>
            <strong>{{ riskLevelText(detailDrawer.device.last_risk_level) }} / {{ detailDrawer.device.last_risk_score || 0 }}</strong>
          </div>
          <div class="summary-item">
            <span>最近关联订单</span>
            <strong>{{ detailDrawer.device.last_order_no || '-' }}</strong>
          </div>
          <div class="summary-item">
            <span>最近操作人</span>
            <strong>{{ operatorText(detailDrawer.device) }}</strong>
          </div>
        </section>

        <el-tabs v-model="detailDrawer.activeTab">
          <el-tab-pane label="操作日志" name="logs">
            <el-table :data="detailDrawer.logs" v-loading="detailDrawer.logsLoading" stripe empty-text="暂无操作日志">
              <el-table-column label="时间" min-width="150">
                <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="操作类型" min-width="140">
                <template #default="{ row }">{{ logActionText(row.action_type) }}</template>
              </el-table-column>
              <el-table-column label="关联订单" min-width="160">
                <template #default="{ row }">{{ row.order_no || (row.order_id ? `#${row.order_id}` : '-') }}</template>
              </el-table-column>
              <el-table-column label="风险信息" min-width="170">
                <template #default="{ row }">
                  <div class="compact-cell">
                    <div>{{ row.risk_score || 0 }}</div>
                    <div class="subtle">{{ riskFlagsSummary(row.risk_flags) }}</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="处理时长" min-width="110">
                <template #default="{ row }">{{ logDurationText(row) }}</template>
              </el-table-column>
              <el-table-column label="操作人" min-width="120">
                <template #default="{ row }">{{ row.operator_name || row.operator_username || '系统' }}</template>
              </el-table-column>
              <el-table-column label="原因 / 备注" min-width="240" show-overflow-tooltip>
                <template #default="{ row }">{{ [row.reason, row.remark].filter(Boolean).join(' / ') || '-' }}</template>
              </el-table-column>
            </el-table>

            <el-pagination
              class="pager drawer-pager"
              background
              layout="total, prev, pager, next"
              v-model:current-page="detailDrawer.logsPagination.page"
              :page-size="detailDrawer.logsPagination.pageSize"
              :total="detailDrawer.logsPagination.total"
              @current-change="fetchDeviceLogs"
            />
          </el-tab-pane>

          <el-tab-pane label="风险事件" name="events">
            <el-table :data="detailDrawer.events" v-loading="detailDrawer.eventsLoading" stripe empty-text="暂无风险事件">
              <el-table-column label="时间" min-width="150">
                <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="事件类型" min-width="170" show-overflow-tooltip>
                <template #default="{ row }">{{ riskEventText(row.event_type) }}</template>
              </el-table-column>
              <el-table-column label="关联订单" min-width="160">
                <template #default="{ row }">{{ row.order_no || (row.order_id ? `#${row.order_id}` : '-') }}</template>
              </el-table-column>
              <el-table-column label="风险等级" min-width="180">
                <template #default="{ row }">
                  <div class="compact-cell">
                    <div class="risk-row">
                      <el-tag :type="riskLevelTagType(row.risk_level)" effect="light">{{ riskLevelText(row.risk_level) }}</el-tag>
                      <strong class="risk-score">{{ row.risk_score || 0 }}</strong>
                    </div>
                    <div class="subtle">{{ riskFlagsSummary(row.risk_flags) }}</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="联系方式" min-width="130" show-overflow-tooltip>
                <template #default="{ row }">{{ row.contact_value || '-' }}</template>
              </el-table-column>
              <el-table-column label="附加信息" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">{{ metaSummary(row.meta) }}</template>
              </el-table-column>
            </el-table>

            <el-pagination
              class="pager drawer-pager"
              background
              layout="total, prev, pager, next"
              v-model:current-page="detailDrawer.eventsPagination.page"
              :page-size="detailDrawer.eventsPagination.pageSize"
              :total="detailDrawer.eventsPagination.total"
              @current-change="fetchDeviceRiskEvents"
            />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  blockDeviceApi,
  getDeviceLogsApi,
  getDeviceRiskEventsApi,
  getDevicesApi,
  getDeviceSourcesApi,
  unblockDeviceApi,
} from '../../api/devices';
import { emitAdminSync, isSelfAdminSyncEvent, offAdminSync, onAdminSync } from '../../utils/adminSync';
import { getList, getTotal } from '../../utils/api';
import { usePermission } from '../../composables/usePermission';

const route = useRoute();
const { hasButton } = usePermission();

const durationOptions = [
  { label: '3分钟', value: '3' },
  { label: '5分钟', value: '5' },
  { label: '10分钟', value: '10' },
  { label: '30分钟', value: '30' },
  { label: '1小时', value: '60' },
  { label: '24小时', value: '1440' },
  { label: '永久拉黑', value: 'permanent' },
];

const ACTION_TEXT_MAP = {
  auto_block: '自动封禁',
  manual_block: '手动拉黑',
  manual_permanent_block: '永久拉黑',
  manual_unblock: '手动解封',
  manual_revoke_permanent_block: '撤回永久拉黑',
  garbage_order_marked: '垃圾订单联动',
};

const RISK_EVENT_TEXT_MAP = {
  suspicious_contact: '联系方式异常',
  fingerprint_high_risk_match: '新设备命中旧高风险指纹',
  fingerprint_repeat_1m: '1分钟内重复提交过多',
  fingerprint_abnormal_5m: '5分钟内连续异常提交',
  contact_repeat_5m: '联系方式短时重复提交',
  garbage_order: '垃圾订单',
  garbage_order_reason_updated: '垃圾订单原因更新',
  garbage_order_restored: '垃圾订单恢复正常',
  invalid_contact_attempt: '无效联系方式提交',
  device_auto_block: '自动封禁设备',
  device_block_hit: '封禁设备再次提交',
  missing_device_id: '缺少设备标识',
  fingerprint_manual_block_match: '命中手动拉黑设备指纹',
};

const loading = ref(false);
const submitting = ref(false);
const list = ref([]);
const sourceOptions = ref([]);
const refreshTimer = ref(null);

const filters = reactive({
  keyword: '',
  status: '',
  source: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const blockDialog = reactive({
  visible: false,
  form: {
    device_id: '',
    source: '',
    duration: '5',
    reason: '',
    remark: '',
  },
});

const unblockDialog = reactive({
  visible: false,
  form: {
    device_id: '',
    source: '',
    reason: '',
    remark: '',
  },
});

const detailDrawer = reactive({
  visible: false,
  activeTab: 'logs',
  deviceId: '',
  device: null,
  logsLoading: false,
  eventsLoading: false,
  logs: [],
  events: [],
  logsPagination: {
    page: 1,
    pageSize: 10,
    total: 0,
  },
  eventsPagination: {
    page: 1,
    pageSize: 10,
    total: 0,
  },
});

const canBlock = computed(() => hasButton('api.device_management.block'));
const canUnblock = computed(() => hasButton('api.device_management.unblock'));
const blockedCount = computed(() => list.value.filter((item) => item.is_blocked).length);
const permanentCount = computed(() => list.value.filter((item) => item.is_permanent).length);
const highRiskCount = computed(() =>
  list.value.filter((item) => ['high', 'critical'].includes(String(item.last_risk_level || '').toLowerCase())).length,
);

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRemainingSeconds(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return '已到期';
  if (total < 60) return `${total}秒`;
  if (total < 3600) return `${Math.ceil(total / 60)}分钟`;
  if (total < 86400) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.ceil((total % 3600) / 60);
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }
  const days = Math.floor(total / 86400);
  const hours = Math.ceil((total % 86400) / 3600);
  return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
}

function maskFingerprint(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function normalizeRiskFlags(flags) {
  if (Array.isArray(flags)) {
    return flags.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (!flags) return [];
  if (typeof flags === 'string') {
    try {
      return normalizeRiskFlags(JSON.parse(flags));
    } catch {
      return flags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function riskFlagsSummary(flags) {
  const listValue = normalizeRiskFlags(flags);
  return listValue.length ? listValue.join('、') : '-';
}

function riskLevelText(level) {
  const value = String(level || 'low').trim().toLowerCase();
  const map = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '极高风险',
  };
  return map[value] || value || '低风险';
}

function riskLevelTagType(level) {
  const value = String(level || 'low').trim().toLowerCase();
  if (value === 'critical') return 'danger';
  if (value === 'high') return 'warning';
  if (value === 'medium') return 'info';
  return 'success';
}

function statusText(row) {
  if (row.is_permanent) return '永久拉黑';
  if (row.is_blocked) return '已封禁';
  return '正常';
}

function statusTagType(row) {
  if (row.is_permanent) return 'danger';
  if (row.is_blocked) return 'warning';
  return 'success';
}

function blockTypeText(row) {
  if (!row.is_blocked) return '未封禁';
  if (row.is_permanent) return '手动永久拉黑';
  return row.block_type === 'automatic' ? '自动封禁' : '手动拉黑';
}

function remainingTimeText(row) {
  if (!row.is_blocked) return '-';
  if (row.is_permanent) return '永久拉黑';
  return formatRemainingSeconds(row.remaining_seconds);
}

function operatorText(row) {
  return row.last_operator_name || row.last_operator_username || '-';
}

function latestReasonText(row) {
  return row.reason || row.remark || row.last_abnormal_reason || '-';
}

function logActionText(actionType) {
  return ACTION_TEXT_MAP[actionType] || actionType || '-';
}

function riskEventText(eventType) {
  return RISK_EVENT_TEXT_MAP[eventType] || eventType || '-';
}

function logDurationText(row) {
  if (row.is_permanent) return '永久拉黑';
  if (row.duration_minutes == null || row.duration_minutes === 0) return '-';
  if (row.duration_minutes < 60) return `${row.duration_minutes}分钟`;
  if (row.duration_minutes % 60 === 0) return `${row.duration_minutes / 60}小时`;
  return `${row.duration_minutes}分钟`;
}

function metaSummary(meta) {
  if (!meta || typeof meta !== 'object') return '-';
  const parts = Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? parts.join(' / ') : '-';
}

function buildQuery() {
  return {
    page: pagination.page,
    page_size: pagination.pageSize,
    keyword: filters.keyword || undefined,
    status: filters.status || undefined,
    source: filters.source || undefined,
  };
}

async function fetchSources() {
  try {
    const resp = await getDeviceSourcesApi();
    sourceOptions.value = getList(resp);
  } catch {
    sourceOptions.value = [];
  }
}

async function fetchDevices() {
  loading.value = true;
  try {
    const resp = await getDevicesApi(buildQuery());
    list.value = getList(resp);
    pagination.total = Number(getTotal(resp));
    if (detailDrawer.visible && detailDrawer.deviceId) {
      detailDrawer.device = list.value.find((item) => item.device_id === detailDrawer.deviceId) || detailDrawer.device;
    }
  } finally {
    loading.value = false;
  }
}

function search() {
  pagination.page = 1;
  fetchDevices();
}

function resetFilters() {
  filters.keyword = String(route.query.keyword || '').trim();
  filters.status = '';
  filters.source = '';
  pagination.page = 1;
  fetchDevices();
}

function handlePageSizeChange(size) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchDevices();
}

function openBlockDialog(row) {
  blockDialog.form.device_id = row.device_id;
  blockDialog.form.source = row.source || '';
  blockDialog.form.duration = row.is_permanent ? 'permanent' : '5';
  blockDialog.form.reason = '';
  blockDialog.form.remark = '';
  blockDialog.visible = true;
}

function openUnblockDialog(row) {
  unblockDialog.form.device_id = row.device_id;
  unblockDialog.form.source = row.source || '';
  unblockDialog.form.reason = '';
  unblockDialog.form.remark = '';
  unblockDialog.visible = true;
}

async function submitBlock() {
  if (!blockDialog.form.device_id) return;
  submitting.value = true;
  try {
    const isPermanent = blockDialog.form.duration === 'permanent';
    await blockDeviceApi(blockDialog.form.device_id, {
      duration_minutes: isPermanent ? 'permanent' : Number(blockDialog.form.duration),
      is_permanent: isPermanent,
      source: blockDialog.form.source || undefined,
      reason: blockDialog.form.reason || undefined,
      remark: blockDialog.form.remark || undefined,
    });
    ElMessage.success(isPermanent ? '设备已永久拉黑' : '设备已拉黑');
    blockDialog.visible = false;
    await fetchDevices();
    if (detailDrawer.visible && detailDrawer.deviceId === blockDialog.form.device_id) {
      await Promise.all([fetchDeviceLogs(), fetchDeviceRiskEvents()]);
    }
    emitAdminSync('device-risk-updated', {
      allow_same_tab: true,
      device_id: blockDialog.form.device_id,
    });
  } finally {
    submitting.value = false;
  }
}

async function submitUnblock() {
  if (!unblockDialog.form.device_id) return;
  submitting.value = true;
  try {
    await unblockDeviceApi(unblockDialog.form.device_id, {
      source: unblockDialog.form.source || undefined,
      reason: unblockDialog.form.reason || undefined,
      remark: unblockDialog.form.remark || undefined,
    });
    ElMessage.success('设备已解封');
    unblockDialog.visible = false;
    await fetchDevices();
    if (detailDrawer.visible && detailDrawer.deviceId === unblockDialog.form.device_id) {
      await Promise.all([fetchDeviceLogs(), fetchDeviceRiskEvents()]);
    }
    emitAdminSync('device-risk-updated', {
      allow_same_tab: true,
      device_id: unblockDialog.form.device_id,
    });
  } finally {
    submitting.value = false;
  }
}

async function fetchDeviceLogs() {
  if (!detailDrawer.deviceId) return;
  detailDrawer.logsLoading = true;
  try {
    const resp = await getDeviceLogsApi(detailDrawer.deviceId, {
      page: detailDrawer.logsPagination.page,
      page_size: detailDrawer.logsPagination.pageSize,
    });
    detailDrawer.logs = getList(resp);
    detailDrawer.logsPagination.total = Number(getTotal(resp));
  } finally {
    detailDrawer.logsLoading = false;
  }
}

async function fetchDeviceRiskEvents() {
  if (!detailDrawer.deviceId) return;
  detailDrawer.eventsLoading = true;
  try {
    const resp = await getDeviceRiskEventsApi(detailDrawer.deviceId, {
      page: detailDrawer.eventsPagination.page,
      page_size: detailDrawer.eventsPagination.pageSize,
    });
    detailDrawer.events = getList(resp);
    detailDrawer.eventsPagination.total = Number(getTotal(resp));
  } finally {
    detailDrawer.eventsLoading = false;
  }
}

async function openDetailsDrawer(row) {
  detailDrawer.visible = true;
  detailDrawer.activeTab = 'logs';
  detailDrawer.deviceId = row.device_id;
  detailDrawer.device = row;
  detailDrawer.logs = [];
  detailDrawer.events = [];
  detailDrawer.logsPagination.page = 1;
  detailDrawer.eventsPagination.page = 1;
  detailDrawer.logsPagination.total = 0;
  detailDrawer.eventsPagination.total = 0;
  await Promise.all([fetchDeviceLogs(), fetchDeviceRiskEvents()]);
}

function setupAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = setInterval(() => {
    if (!loading.value) {
      fetchDevices();
    }
  }, 20000);
}

const deviceRefreshReasons = new Set([
  'order-created',
  'order-risk-updated',
  'device-risk-updated',
  'order-status-updated',
]);

function onSyncEvent(event) {
  const allowSameTab = event?.detail?.allow_same_tab === true || String(event?.detail?.allow_same_tab || '') === '1';
  if (isSelfAdminSyncEvent(event) && !allowSameTab) return;
  const reason = String(event?.detail?.reason || '');
  if (!deviceRefreshReasons.has(reason)) return;
  if (!loading.value) {
    fetchDevices();
  }
  const targetDeviceId = String(event?.detail?.device_id || '');
  if (detailDrawer.visible && detailDrawer.deviceId && (!targetDeviceId || targetDeviceId === detailDrawer.deviceId)) {
    fetchDeviceLogs();
    fetchDeviceRiskEvents();
  }
}

watch(
  () => route.query.keyword,
  (value) => {
    const keyword = String(value || '').trim();
    if (keyword === String(filters.keyword || '').trim()) return;
    filters.keyword = keyword;
    pagination.page = 1;
    fetchDevices();
  },
);

onMounted(async () => {
  filters.keyword = String(route.query.keyword || '').trim();
  await Promise.all([fetchSources(), fetchDevices()]);
  setupAutoRefresh();
  onAdminSync(onSyncEvent);
});

onUnmounted(() => {
  offAdminSync(onSyncEvent);
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
});
</script>

<style scoped>
.device-filter-form {
  width: 100%;
}

.compact-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.risk-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.risk-score {
  color: #1f2430;
  font-weight: 620;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.subtle {
  color: var(--text-tertiary);
  font-size: 12px;
}

.device-id-box {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-muted);
  color: var(--text-primary);
  word-break: break-all;
}

.unblock-form {
  margin-top: 16px;
}

.drawer-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  border: 1px solid #e6ebf2;
  border-radius: 14px;
  background: #fbfcfe;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item span {
  color: var(--text-secondary);
  font-size: 12px;
}

.summary-item strong {
  color: #1f2430;
  font-weight: 600;
  word-break: break-all;
}

.drawer-pager {
  justify-content: flex-end;
  margin-top: 14px;
}

@media (max-width: 900px) {
  .detail-summary {
    grid-template-columns: 1fr;
  }
}
</style>
