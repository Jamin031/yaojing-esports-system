<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">Risk Control</p>
        <h2 class="page-title">设备管理</h2>
        <p class="page-subtitle">统一查看设备状态、封禁状态、剩余时间与人工操作记录。</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>设备总数</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>当前页封禁</span>
          <strong>{{ blockedCount }}</strong>
        </div>
        <div class="metric-chip">
          <span>当前页永久</span>
          <strong>{{ permanentCount }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters" class="device-filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 160px">
            <el-option label="正常" value="normal" />
            <el-option label="封禁中" value="blocked" />
            <el-option label="永久拉黑" value="permanent" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="filters.source" clearable filterable placeholder="全部来源" style="width: 180px">
            <el-option v-for="item in sourceOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="设备">
          <el-input v-model="filters.keyword" clearable placeholder="device_id / source" style="width: 260px" />
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
        <span class="section-tip">自动封禁与手动封禁共存，列表始终以当前生效状态为准。</span>
      </div>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="device_id" label="device_id" min-width="240" show-overflow-tooltip />
        <el-table-column label="来源" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.source || '-' }}</template>
        </el-table-column>
        <el-table-column label="当前状态" min-width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row)">{{ statusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="封禁类型" min-width="120">
          <template #default="{ row }">{{ blockTypeText(row) }}</template>
        </el-table-column>
        <el-table-column label="封禁开始" min-width="155">
          <template #default="{ row }">{{ formatMinute(row.blocked_at) }}</template>
        </el-table-column>
        <el-table-column label="封禁结束" min-width="155">
          <template #default="{ row }">{{ row.is_permanent ? '永久' : formatMinute(row.blocked_until) }}</template>
        </el-table-column>
        <el-table-column label="剩余时间" min-width="120">
          <template #default="{ row }">{{ remainingTimeText(row) }}</template>
        </el-table-column>
        <el-table-column label="最近下单" min-width="155">
          <template #default="{ row }">{{ formatMinute(row.last_order_at) }}</template>
        </el-table-column>
        <el-table-column label="最近异常" min-width="180">
          <template #default="{ row }">
            <div class="compact-cell">
              <div>{{ formatMinute(row.last_abnormal_at) }}</div>
              <div class="subtle">次数：{{ row.last_abnormal_count || 0 }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近操作人" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ operatorText(row) }}</template>
        </el-table-column>
        <el-table-column label="原因 / 备注" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ reasonText(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="190" fixed="right">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button v-if="canBlock" link type="danger" @click="openBlockDialog(row)">拉黑</el-button>
              <el-button v-if="canUnblock && row.is_blocked" link type="primary" @click="openUnblockDialog(row)">解封</el-button>
              <el-button link type="info" @click="openLogsDrawer(row)">记录</el-button>
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

    <el-dialog v-model="blockDialog.visible" title="手动拉黑设备" width="520px">
      <el-form :model="blockDialog.form" label-width="92px">
        <el-form-item label="设备">
          <div class="device-id-box">{{ blockDialog.form.device_id }}</div>
        </el-form-item>
        <el-form-item label="封禁时长">
          <el-select v-model="blockDialog.form.duration" style="width: 100%">
            <el-option v-for="item in durationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="blockDialog.form.reason" maxlength="255" placeholder="可选，建议填写风控原因" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="blockDialog.form.remark"
            type="textarea"
            :rows="4"
            maxlength="500"
            placeholder="可选，记录操作说明"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="blockDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitBlock">确认拉黑</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unblockDialog.visible" title="解除设备封禁" width="520px">
      <el-alert type="warning" :closable="false" show-icon title="当前操作会立即解除该设备现有封禁状态，包括自动封禁和手动封禁。" />
      <el-form :model="unblockDialog.form" label-width="92px" class="unblock-form">
        <el-form-item label="设备">
          <div class="device-id-box">{{ unblockDialog.form.device_id }}</div>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="unblockDialog.form.reason" maxlength="255" placeholder="可选，建议填写解封原因" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="unblockDialog.form.remark"
            type="textarea"
            :rows="4"
            maxlength="500"
            placeholder="可选，记录解封说明"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="unblockDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitUnblock">确认解封</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="logsDrawer.visible" size="760px" :title="`设备操作记录 - ${logsDrawer.deviceId || ''}`">
      <div class="drawer-shell">
        <el-table :data="logsDrawer.list" v-loading="logsDrawer.loading" stripe>
          <el-table-column label="时间" min-width="150">
            <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="动作" min-width="140">
            <template #default="{ row }">{{ logActionText(row.action_type) }}</template>
          </el-table-column>
          <el-table-column label="时长" min-width="100">
            <template #default="{ row }">{{ logDurationText(row) }}</template>
          </el-table-column>
          <el-table-column label="操作人" min-width="120">
            <template #default="{ row }">{{ row.operator_name || row.operator_username || 'System' }}</template>
          </el-table-column>
          <el-table-column label="原因 / 备注" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ [row.reason, row.remark].filter(Boolean).join(' / ') || '-' }}</template>
          </el-table-column>
        </el-table>

        <el-pagination
          class="pager drawer-pager"
          background
          layout="total, prev, pager, next"
          v-model:current-page="logsDrawer.pagination.page"
          :page-size="logsDrawer.pagination.pageSize"
          :total="logsDrawer.pagination.total"
          @current-change="fetchDeviceLogs"
        />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  blockDeviceApi,
  getDeviceLogsApi,
  getDevicesApi,
  getDeviceSourcesApi,
  unblockDeviceApi,
} from '../../api/devices';
import { getList, getTotal } from '../../utils/api';
import { usePermission } from '../../composables/usePermission';

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
  manual_unblock: '解除封禁',
  manual_revoke_permanent_block: '撤回永久拉黑',
};

const loading = ref(false);
const submitting = ref(false);
const list = ref([]);
const sourceOptions = ref([]);

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

const logsDrawer = reactive({
  visible: false,
  loading: false,
  deviceId: '',
  list: [],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
  },
});

const canBlock = computed(() => hasButton('api.device_management.block'));
const canUnblock = computed(() => hasButton('api.device_management.unblock'));
const blockedCount = computed(() => list.value.filter((item) => item.is_blocked).length);
const permanentCount = computed(() => list.value.filter((item) => item.is_permanent).length);

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
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  }
  const days = Math.floor(total / 86400);
  const hours = Math.ceil((total % 86400) / 3600);
  return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
}

function statusText(row) {
  if (row.is_permanent) return '永久拉黑';
  if (row.is_blocked) return '封禁中';
  return '正常';
}

function statusTagType(row) {
  if (row.is_permanent) return 'danger';
  if (row.is_blocked) return 'warning';
  return 'success';
}

function blockTypeText(row) {
  if (!row.is_blocked) return '-';
  if (row.is_permanent) return '手动永久';
  return row.block_type === 'automatic' ? '自动封禁' : '手动封禁';
}

function remainingTimeText(row) {
  if (!row.is_blocked) return '-';
  if (row.is_permanent) return '永久';
  return formatRemainingSeconds(row.remaining_seconds);
}

function operatorText(row) {
  return row.last_operator_name || row.last_operator_username || '-';
}

function reasonText(row) {
  return [row.reason, row.remark].filter(Boolean).join(' / ') || '-';
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
    ElMessage.success(isPermanent ? '设备已永久拉黑' : '设备拉黑成功');
    blockDialog.visible = false;
    await fetchDevices();
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
    ElMessage.success('设备已解除封禁');
    unblockDialog.visible = false;
    await fetchDevices();
  } finally {
    submitting.value = false;
  }
}

function logActionText(actionType) {
  return ACTION_TEXT_MAP[actionType] || actionType || '-';
}

function logDurationText(row) {
  if (row.is_permanent) return '永久';
  if (row.duration_minutes == null || row.duration_minutes === 0) return '-';
  if (row.duration_minutes < 60) return `${row.duration_minutes}分钟`;
  if (row.duration_minutes % 60 === 0) return `${row.duration_minutes / 60}小时`;
  return `${row.duration_minutes}分钟`;
}

async function fetchDeviceLogs() {
  if (!logsDrawer.deviceId) return;
  logsDrawer.loading = true;
  try {
    const resp = await getDeviceLogsApi(logsDrawer.deviceId, {
      page: logsDrawer.pagination.page,
      page_size: logsDrawer.pagination.pageSize,
    });
    logsDrawer.list = getList(resp);
    logsDrawer.pagination.total = Number(getTotal(resp));
  } finally {
    logsDrawer.loading = false;
  }
}

async function openLogsDrawer(row) {
  logsDrawer.visible = true;
  logsDrawer.deviceId = row.device_id;
  logsDrawer.pagination.page = 1;
  logsDrawer.list = [];
  logsDrawer.pagination.total = 0;
  await fetchDeviceLogs();
}

onMounted(async () => {
  await fetchSources();
  await fetchDevices();
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
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: var(--surface-soft);
  color: var(--text-main);
  font-family: "SFMono-Regular", "Consolas", monospace;
  word-break: break-all;
}

.unblock-form {
  margin-top: 16px;
}

.drawer-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.drawer-pager {
  align-self: flex-end;
}
</style>
