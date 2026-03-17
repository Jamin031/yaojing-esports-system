<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">Risk Control</p>
        <h2 class="page-title">Device Management</h2>
        <p class="page-subtitle">Track fingerprint, risk score, recent abnormal activity, and block lifecycle in one place.</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>Total Devices</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>Blocked</span>
          <strong>{{ blockedCount }}</strong>
        </div>
        <div class="metric-chip">
          <span>Permanent</span>
          <strong>{{ permanentCount }}</strong>
        </div>
        <div class="metric-chip">
          <span>High Risk</span>
          <strong>{{ highRiskCount }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters" class="device-filter-form">
        <el-form-item label="Status">
          <el-select v-model="filters.status" clearable placeholder="All statuses" style="width: 160px">
            <el-option label="Normal" value="normal" />
            <el-option label="Blocked" value="blocked" />
            <el-option label="Permanent" value="permanent" />
          </el-select>
        </el-form-item>
        <el-form-item label="Source">
          <el-select v-model="filters.source" clearable filterable placeholder="All sources" style="width: 220px">
            <el-option v-for="item in sourceOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="Keyword">
          <el-input v-model="filters.keyword" clearable placeholder="device_id / source / fingerprint" style="width: 280px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">Search</el-button>
          <el-button @click="resetFilters">Reset</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">Device List</h3>
        <span class="section-tip">Manual block wins over automatic block. Risk data refreshes from live order and device events.</span>
      </div>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="device_id" label="device_id" min-width="220" show-overflow-tooltip />
        <el-table-column label="Fingerprint" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ maskFingerprint(row.fingerprint_hash) }}</template>
        </el-table-column>
        <el-table-column label="Source" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.source || '-' }}</template>
        </el-table-column>
        <el-table-column label="Status" min-width="108">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row)">{{ statusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Block Type" min-width="126">
          <template #default="{ row }">{{ blockTypeText(row) }}</template>
        </el-table-column>
        <el-table-column label="Blocked Until" min-width="160">
          <template #default="{ row }">{{ row.is_permanent ? 'Permanent' : formatMinute(row.blocked_until) }}</template>
        </el-table-column>
        <el-table-column label="Time Left" min-width="120">
          <template #default="{ row }">{{ remainingTimeText(row) }}</template>
        </el-table-column>
        <el-table-column label="Latest Order" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div>{{ row.last_order_no || '-' }}</div>
              <div class="subtle">{{ formatMinute(row.last_order_at) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Latest Risk" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div class="risk-row">
                <el-tag :type="riskLevelTagType(row.last_risk_level)" effect="light">{{ riskLevelText(row.last_risk_level) }}</el-tag>
                <strong class="risk-score">{{ row.last_risk_score || 0 }}</strong>
              </div>
              <div class="subtle">{{ riskFlagsSummary(row.last_risk_flags) }}</div>
              <div class="subtle">Contact: {{ row.last_contact_value || '-' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Latest Abnormal" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div>{{ formatMinute(row.last_abnormal_at) }}</div>
              <div class="subtle">Count: {{ row.last_abnormal_count || 0 }}</div>
              <div class="subtle">{{ row.last_abnormal_reason || '-' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Last Operator" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ operatorText(row) }}</template>
        </el-table-column>
        <el-table-column label="Reason / Remark" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ reasonText(row) }}</template>
        </el-table-column>
        <el-table-column label="Actions" min-width="190" fixed="right">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button v-if="canBlock" link type="danger" @click="openBlockDialog(row)">Block</el-button>
              <el-button v-if="canUnblock && row.is_blocked" link type="primary" @click="openUnblockDialog(row)">Unblock</el-button>
              <el-button link type="info" @click="openDetailsDrawer(row)">Details</el-button>
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

    <el-dialog v-model="blockDialog.visible" title="Block Device" width="520px">
      <el-form :model="blockDialog.form" label-width="96px">
        <el-form-item label="Device">
          <div class="device-id-box">{{ blockDialog.form.device_id }}</div>
        </el-form-item>
        <el-form-item label="Duration">
          <el-select v-model="blockDialog.form.duration" style="width: 100%">
            <el-option v-for="item in durationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Reason">
          <el-input v-model="blockDialog.form.reason" maxlength="255" placeholder="Optional reason" />
        </el-form-item>
        <el-form-item label="Remark">
          <el-input v-model="blockDialog.form.remark" type="textarea" :rows="4" maxlength="500" placeholder="Optional note" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="blockDialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="submitBlock">Confirm</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unblockDialog.visible" title="Unblock Device" width="520px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="This clears the active manual, automatic, or permanent block."
      />
      <el-form :model="unblockDialog.form" label-width="96px" class="unblock-form">
        <el-form-item label="Device">
          <div class="device-id-box">{{ unblockDialog.form.device_id }}</div>
        </el-form-item>
        <el-form-item label="Reason">
          <el-input v-model="unblockDialog.form.reason" maxlength="255" placeholder="Optional reason" />
        </el-form-item>
        <el-form-item label="Remark">
          <el-input v-model="unblockDialog.form.remark" type="textarea" :rows="4" maxlength="500" placeholder="Optional note" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="unblockDialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="submitUnblock">Confirm</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawer.visible" size="960px" :title="`Device Details - ${detailDrawer.deviceId || ''}`">
      <div class="drawer-shell">
        <section class="detail-summary" v-if="detailDrawer.device">
          <div class="summary-item">
            <span>Fingerprint</span>
            <strong>{{ maskFingerprint(detailDrawer.device.fingerprint_hash) }}</strong>
          </div>
          <div class="summary-item">
            <span>Latest Risk</span>
            <strong>{{ riskLevelText(detailDrawer.device.last_risk_level) }} / {{ detailDrawer.device.last_risk_score || 0 }}</strong>
          </div>
          <div class="summary-item">
            <span>Latest Order</span>
            <strong>{{ detailDrawer.device.last_order_no || '-' }}</strong>
          </div>
          <div class="summary-item">
            <span>Risk Flags</span>
            <strong>{{ riskFlagsSummary(detailDrawer.device.last_risk_flags) }}</strong>
          </div>
        </section>

        <el-tabs v-model="detailDrawer.activeTab">
          <el-tab-pane label="Operation Logs" name="logs">
            <el-table :data="detailDrawer.logs" v-loading="detailDrawer.logsLoading" stripe>
              <el-table-column label="Time" min-width="150">
                <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="Action" min-width="140">
                <template #default="{ row }">{{ logActionText(row.action_type) }}</template>
              </el-table-column>
              <el-table-column label="Order" min-width="160">
                <template #default="{ row }">{{ row.order_no || (row.order_id ? `#${row.order_id}` : '-') }}</template>
              </el-table-column>
              <el-table-column label="Fingerprint" min-width="150">
                <template #default="{ row }">{{ maskFingerprint(row.fingerprint_hash) }}</template>
              </el-table-column>
              <el-table-column label="Risk" min-width="160">
                <template #default="{ row }">
                  <div class="compact-cell">
                    <div>{{ row.risk_score || 0 }}</div>
                    <div class="subtle">{{ riskFlagsSummary(row.risk_flags) }}</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="Duration" min-width="100">
                <template #default="{ row }">{{ logDurationText(row) }}</template>
              </el-table-column>
              <el-table-column label="Operator" min-width="120">
                <template #default="{ row }">{{ row.operator_name || row.operator_username || 'System' }}</template>
              </el-table-column>
              <el-table-column label="Reason / Remark" min-width="240" show-overflow-tooltip>
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

          <el-tab-pane label="Risk Events" name="events">
            <el-table :data="detailDrawer.events" v-loading="detailDrawer.eventsLoading" stripe>
              <el-table-column label="Time" min-width="150">
                <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="Event" min-width="170" show-overflow-tooltip>
                <template #default="{ row }">{{ riskEventText(row.event_type) }}</template>
              </el-table-column>
              <el-table-column label="Order" min-width="160">
                <template #default="{ row }">{{ row.order_no || (row.order_id ? `#${row.order_id}` : '-') }}</template>
              </el-table-column>
              <el-table-column label="Risk" min-width="180">
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
              <el-table-column label="Contact" min-width="130" show-overflow-tooltip>
                <template #default="{ row }">{{ row.contact_value || '-' }}</template>
              </el-table-column>
              <el-table-column label="Customer" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">{{ row.customer_name || '-' }}</template>
              </el-table-column>
              <el-table-column label="Meta" min-width="220" show-overflow-tooltip>
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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
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

const { hasButton } = usePermission();

const durationOptions = [
  { label: '3 min', value: '3' },
  { label: '5 min', value: '5' },
  { label: '10 min', value: '10' },
  { label: '30 min', value: '30' },
  { label: '1 hour', value: '60' },
  { label: '24 hours', value: '1440' },
  { label: 'Permanent', value: 'permanent' },
];

const ACTION_TEXT_MAP = {
  auto_block: 'Auto block',
  manual_block: 'Manual block',
  manual_permanent_block: 'Permanent block',
  manual_unblock: 'Manual unblock',
  manual_revoke_permanent_block: 'Revoke permanent block',
  garbage_order_marked: 'Garbage order linked',
};

const RISK_EVENT_TEXT_MAP = {
  suspicious_contact: 'Suspicious contact',
  fingerprint_high_risk_match: 'New device with known risky fingerprint',
  fingerprint_repeat_1m: 'Fingerprint repeated too often in 1 minute',
  fingerprint_abnormal_5m: 'Fingerprint abnormal in 5 minutes',
  contact_repeat_5m: 'Contact repeated too often',
  garbage_order: 'Garbage order',
  invalid_contact_attempt: 'Invalid contact attempt',
  device_auto_block: 'Automatic device block',
  device_block_hit: 'Blocked device retried',
  missing_device_id: 'Missing device id',
  fingerprint_manual_block_match: 'Fingerprint matched a manually blocked device',
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
  if (!Number.isFinite(total) || total <= 0) return 'Expired';
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.ceil(total / 60)}m`;
  if (total < 86400) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.ceil((total % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(total / 86400);
  const hours = Math.ceil((total % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
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
      return flags.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function riskFlagsSummary(flags) {
  const listValue = normalizeRiskFlags(flags);
  return listValue.length ? listValue.join(', ') : '-';
}

function riskLevelText(level) {
  const value = String(level || 'low').trim().toLowerCase();
  return value || 'low';
}

function riskLevelTagType(level) {
  const value = String(level || 'low').trim().toLowerCase();
  if (value === 'critical') return 'danger';
  if (value === 'high') return 'warning';
  if (value === 'medium') return 'info';
  return 'success';
}

function statusText(row) {
  if (row.is_permanent) return 'Permanent';
  if (row.is_blocked) return 'Blocked';
  return 'Normal';
}

function statusTagType(row) {
  if (row.is_permanent) return 'danger';
  if (row.is_blocked) return 'warning';
  return 'success';
}

function blockTypeText(row) {
  if (!row.is_blocked) return '-';
  if (row.is_permanent) return 'Manual permanent';
  return row.block_type === 'automatic' ? 'Automatic' : 'Manual';
}

function remainingTimeText(row) {
  if (!row.is_blocked) return '-';
  if (row.is_permanent) return 'Permanent';
  return formatRemainingSeconds(row.remaining_seconds);
}

function operatorText(row) {
  return row.last_operator_name || row.last_operator_username || '-';
}

function reasonText(row) {
  return [row.reason, row.remark, row.last_abnormal_reason].filter(Boolean).join(' / ') || '-';
}

function logActionText(actionType) {
  return ACTION_TEXT_MAP[actionType] || actionType || '-';
}

function riskEventText(eventType) {
  return RISK_EVENT_TEXT_MAP[eventType] || eventType || '-';
}

function logDurationText(row) {
  if (row.is_permanent) return 'Permanent';
  if (row.duration_minutes == null || row.duration_minutes === 0) return '-';
  if (row.duration_minutes < 60) return `${row.duration_minutes} min`;
  if (row.duration_minutes % 60 === 0) return `${row.duration_minutes / 60} hour`;
  return `${row.duration_minutes} min`;
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
  filters.keyword = '';
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
    ElMessage.success(isPermanent ? 'Device permanently blocked' : 'Device blocked');
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
    ElMessage.success('Device unblocked');
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

onMounted(async () => {
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
