<template>
  <div class="page-shell garbage-orders-page">
    <div class="page-header">
      <div>
        <p class="page-kicker">风控处理中心</p>
        <h2 class="page-title">垃圾订单</h2>
        <p class="page-subtitle">集中处理刷单、恶意订单和关联设备动作，避免干扰正常订单主视图。</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>垃圾订单总数</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>已联动封禁</span>
          <strong>{{ blockedCount }}</strong>
        </div>
        <div class="metric-chip">
          <span>无设备标识</span>
          <strong>{{ noDeviceCount }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
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

          <el-form-item label="订单号">
            <el-input v-model="filters.order_no" clearable placeholder="精确匹配订单号" style="width: 100%" />
          </el-form-item>

          <el-form-item label="风险等级">
            <el-select v-model="filters.risk_level" clearable placeholder="全部风险等级" style="width: 100%">
              <el-option v-for="item in riskLevelOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>

        <div class="filter-layer extra-layer">
          <el-form-item label="关键词">
            <el-input v-model="filters.keyword" clearable placeholder="联系方式 / 订单信息 / 设备标识" style="width: 100%" />
          </el-form-item>
        </div>

        <div class="filter-layer action-layer">
          <el-button type="primary" @click="runSearch">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
      </el-form>
    </div>

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">垃圾订单列表</h3>
        <span class="section-tip">订单管理只保留业务主视图，完整风控字段在这里集中处理。</span>
      </div>

      <el-table :data="rows" v-loading="loading" stripe empty-text="暂无垃圾订单">
        <el-table-column prop="order_no" label="订单号" min-width="170" />
        <el-table-column label="来源网吧" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.store_name || row.source || '-' }}</template>
        </el-table-column>
        <el-table-column label="客户昵称" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customer_nickname || '-' }}</template>
        </el-table-column>
        <el-table-column label="联系方式" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contact || '-' }}</template>
        </el-table-column>
        <el-table-column label="订单信息" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ row.order_info || '-' }}</template>
        </el-table-column>
        <el-table-column label="垃圾原因" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.junk_reason || '垃圾订单' }}</template>
        </el-table-column>
        <el-table-column label="风险情况" min-width="220" show-overflow-tooltip>
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
        <el-table-column label="设备信息" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div>{{ row.device_id || '-' }}</div>
              <div class="subtle">指纹：{{ maskFingerprint(row.fingerprint_hash) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="封禁状态" min-width="170">
          <template #default="{ row }">
            <div class="compact-cell">
              <el-tag :type="deviceStatusTagType(resolveDeviceProfile(row))">
                {{ deviceStatusText(resolveDeviceProfile(row), row.device_id) }}
              </el-tag>
              <span class="subtle">{{ deviceBlockTypeText(resolveDeviceProfile(row)) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="处理记录" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="compact-cell">
              <div>{{ resolveOperatorText(resolveDeviceProfile(row)) }}</div>
              <div class="subtle">{{ formatMinute(resolveDeviceProfile(row)?.last_operation_at) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="当前状态" min-width="120">
          <template #default="{ row }">
            <el-tag type="warning">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="280" fixed="right">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button link type="primary" @click="openRiskDetail(row)">风险详情</el-button>
              <el-button v-if="row.device_id" link type="info" @click="viewLinkedDevice(row)">关联设备</el-button>
              <el-button v-if="row.device_id && canBlockDevice" link type="danger" @click="openBlockDialog(row)">拉黑设备</el-button>
              <el-button
                v-if="row.device_id && canUnblockDevice && resolveDeviceProfile(row)?.is_blocked"
                link
                type="primary"
                @click="unblockLinkedDevice(row)"
              >
                解封设备
              </el-button>
              <el-button link type="warning" @click="openReasonDialog(row)">修改原因</el-button>
              <el-button v-if="canChangeStatus" link type="success" @click="restoreOrder(row)">恢复正常</el-button>
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
        @current-change="fetchRows"
        @size-change="handleSizeChange"
      />
    </div>

    <el-dialog v-model="reasonDialog.visible" title="修改垃圾原因" width="520px">
      <el-form :model="reasonDialog.form" label-width="96px">
        <el-form-item label="订单号">
          <div class="dialog-static-text">{{ reasonDialog.row?.order_no || '-' }}</div>
        </el-form-item>
        <el-form-item label="预设原因">
          <el-select v-model="reasonDialog.form.preset" clearable placeholder="请选择预设原因" style="width: 100%">
            <el-option v-for="item in reasonPresetOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="垃圾原因">
          <el-input v-model="reasonDialog.form.reason" maxlength="255" placeholder="可手动补充垃圾原因" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="reasonDialog.form.remark" type="textarea" :rows="4" maxlength="500" placeholder="可选备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="reasonDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="reasonDialog.submitting" @click="submitReason">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="blockDialog.visible" title="拉黑关联设备" width="520px">
      <el-form :model="blockDialog.form" label-width="96px">
        <el-form-item label="订单号">
          <div class="dialog-static-text">{{ blockDialog.row?.order_no || '-' }}</div>
        </el-form-item>
        <el-form-item label="设备标识">
          <div class="dialog-static-text dialog-break">{{ blockDialog.row?.device_id || '该订单无设备标识' }}</div>
        </el-form-item>
        <el-form-item label="拉黑时长">
          <el-select v-model="blockDialog.form.duration" style="width: 100%">
            <el-option v-for="item in durationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="blockDialog.form.reason" maxlength="255" placeholder="默认沿用垃圾原因" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="blockDialog.form.remark" type="textarea" :rows="4" maxlength="500" placeholder="可选备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="blockDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="blockDialog.submitting" @click="submitBlock">确认拉黑</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawer.visible" title="风险详情" size="900px">
      <div v-if="detailDrawer.row" class="drawer-content">
        <section class="detail-section">
          <h4 class="detail-title">订单风险概览</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span>订单号</span>
              <strong>{{ detailDrawer.row.order_no || '-' }}</strong>
            </div>
            <div class="detail-item">
              <span>来源网吧</span>
              <strong>{{ detailDrawer.row.store_name || detailDrawer.row.source || '-' }}</strong>
            </div>
            <div class="detail-item">
              <span>客户昵称</span>
              <strong>{{ detailDrawer.row.customer_nickname || '-' }}</strong>
            </div>
            <div class="detail-item">
              <span>联系方式</span>
              <strong>{{ detailDrawer.row.contact || '-' }}</strong>
            </div>
            <div class="detail-item detail-item-wide">
              <span>订单信息</span>
              <strong>{{ detailDrawer.row.order_info || '-' }}</strong>
            </div>
            <div class="detail-item">
              <span>垃圾原因</span>
              <strong>{{ detailDrawer.row.junk_reason || '垃圾订单' }}</strong>
            </div>
            <div class="detail-item">
              <span>风险等级</span>
              <strong>{{ riskLevelText(detailDrawer.row.risk_level) }} / {{ detailDrawer.row.risk_score || 0 }}</strong>
            </div>
            <div class="detail-item detail-item-wide">
              <span>风险标记</span>
              <strong>{{ riskFlagsSummary(detailDrawer.row.risk_flags) }}</strong>
            </div>
            <div class="detail-item detail-item-wide">
              <span>设备标识</span>
              <strong>{{ detailDrawer.row.device_id || '-' }}</strong>
            </div>
            <div class="detail-item detail-item-wide">
              <span>指纹摘要</span>
              <strong>{{ maskFingerprint(detailDrawer.row.fingerprint_hash) }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-title">关联设备状态</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span>当前状态</span>
              <strong>{{ deviceStatusText(detailDrawer.deviceProfile, detailDrawer.row.device_id) }}</strong>
            </div>
            <div class="detail-item">
              <span>封禁类型</span>
              <strong>{{ deviceBlockTypeText(detailDrawer.deviceProfile) }}</strong>
            </div>
            <div class="detail-item">
              <span>最近关联订单</span>
              <strong>{{ detailDrawer.deviceProfile?.last_order_no || '-' }}</strong>
            </div>
            <div class="detail-item">
              <span>最近风险等级</span>
              <strong>{{ riskLevelText(detailDrawer.deviceProfile?.last_risk_level) }}</strong>
            </div>
            <div class="detail-item detail-item-wide">
              <span>最近处理原因</span>
              <strong>{{ resolveLatestReason(detailDrawer.deviceProfile) }}</strong>
            </div>
            <div class="detail-item">
              <span>最近操作人</span>
              <strong>{{ resolveOperatorText(detailDrawer.deviceProfile) }}</strong>
            </div>
            <div class="detail-item">
              <span>最近处理时间</span>
              <strong>{{ formatMinute(detailDrawer.deviceProfile?.last_operation_at) }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-title">相关事件记录</h4>
          <el-table :data="detailDrawer.events" v-loading="detailDrawer.eventsLoading" stripe empty-text="暂无风险事件">
            <el-table-column label="时间" min-width="150">
              <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="事件类型" min-width="170" show-overflow-tooltip>
              <template #default="{ row }">{{ riskEventText(row.event_type) }}</template>
            </el-table-column>
            <el-table-column label="风险等级" min-width="170">
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
            <el-table-column label="订单号" min-width="150">
              <template #default="{ row }">{{ row.order_no || (row.order_id ? `#${row.order_id}` : '-') }}</template>
            </el-table-column>
            <el-table-column label="附加信息" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ metaSummary(row.meta) }}</template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getGarbageOrderDetailApi,
  getGarbageOrdersApi,
  restoreGarbageOrderApi,
  updateGarbageOrderReasonApi,
} from '../../api/orders';
import {
  blockDeviceApi,
  getDeviceProfileApi,
  getDeviceRiskEventsApi,
  unblockDeviceApi,
} from '../../api/devices';
import { emitAdminSync, isSelfAdminSyncEvent, offAdminSync, onAdminSync } from '../../utils/adminSync';
import { getList, getTotal } from '../../utils/api';
import { usePermission } from '../../composables/usePermission';

const router = useRouter();
const { hasButton } = usePermission();

const RISK_EVENT_TEXT_MAP = {
  suspicious_contact: '联系方式异常',
  fingerprint_high_risk_match: '新设备命中旧高风险指纹',
  fingerprint_repeat_1m: '1分钟内重复提交过多',
  fingerprint_abnormal_5m: '5分钟内连续异常提交',
  contact_repeat_5m: '联系方式短时重复提交',
  garbage_order: '垃圾订单',
  invalid_contact_attempt: '无效联系方式提交',
  device_auto_block: '自动封禁设备',
  device_block_hit: '封禁期间再次提交',
  missing_device_id: '缺少设备标识',
  fingerprint_manual_block_match: '命中手动拉黑设备指纹',
};

const loading = ref(false);
const rows = ref([]);
const refreshTimer = ref(null);
const deviceProfiles = ref({});

const filters = reactive({
  dateRange: [],
  order_no: '',
  keyword: '',
  risk_level: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const reasonDialog = reactive({
  visible: false,
  submitting: false,
  row: null,
  form: {
    preset: '',
    reason: '',
    remark: '',
  },
});

const blockDialog = reactive({
  visible: false,
  submitting: false,
  row: null,
  form: {
    duration: '5',
    reason: '',
    remark: '',
  },
});

const detailDrawer = reactive({
  visible: false,
  row: null,
  deviceProfile: null,
  eventsLoading: false,
  events: [],
});

const durationOptions = [
  { label: '3分钟', value: '3' },
  { label: '5分钟', value: '5' },
  { label: '10分钟', value: '10' },
  { label: '30分钟', value: '30' },
  { label: '1小时', value: '60' },
  { label: '24小时', value: '1440' },
  { label: '永久拉黑', value: 'permanent' },
];

const riskLevelOptions = [
  { label: '低风险', value: 'low' },
  { label: '中风险', value: 'medium' },
  { label: '高风险', value: 'high' },
  { label: '极高风险', value: 'critical' },
];

const reasonPresetOptions = ['重复刷单', '恶意下单', '联系方式异常', '疑似无痕刷单', '疑似脚本下单'];

const canChangeStatus = computed(() => hasButton('orders:change_status'));
const canBlockDevice = computed(() => hasButton('api.device_management.block'));
const canUnblockDevice = computed(() => hasButton('api.device_management.unblock'));
const blockedCount = computed(() => rows.value.filter((row) => resolveDeviceProfile(row)?.is_blocked).length);
const noDeviceCount = computed(() => rows.value.filter((row) => !row.device_id).length);

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  const values = normalizeRiskFlags(flags);
  return values.length ? values.join('、') : '-';
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

function statusText(status) {
  const map = {
    pending: '待处理',
    pending_contact: '待处理（旧状态）',
    processing: '处理中',
    problem: '问题订单',
    garbage: '垃圾订单',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[status] || status || '-';
}

function resolveDeviceProfile(row) {
  return deviceProfiles.value[String(row.device_id || '').trim()] || null;
}

function deviceStatusText(profile, deviceId) {
  if (!deviceId) return '无设备标识';
  if (!profile) return '未建立设备画像';
  if (profile.is_permanent) return '永久拉黑';
  if (profile.is_blocked) {
    return profile.block_type === 'automatic' ? '自动封禁' : '手动封禁';
  }
  return '正常';
}

function deviceStatusTagType(profile) {
  if (!profile) return 'info';
  if (profile.is_permanent) return 'danger';
  if (profile.is_blocked) return 'warning';
  return 'success';
}

function deviceBlockTypeText(profile) {
  if (!profile || !profile.is_blocked) return '未封禁';
  if (profile.is_permanent) return '手动永久拉黑';
  return profile.block_type === 'automatic' ? '自动封禁' : '手动拉黑';
}

function resolveOperatorText(profile) {
  return profile?.last_operator_name || profile?.last_operator_username || '-';
}

function resolveLatestReason(profile) {
  return profile?.reason || profile?.remark || profile?.last_abnormal_reason || '-';
}

function riskEventText(eventType) {
  return RISK_EVENT_TEXT_MAP[eventType] || eventType || '-';
}

function metaSummary(meta) {
  if (!meta || typeof meta !== 'object') return '-';
  const parts = Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? parts.join(' / ') : '-';
}

function resolveReasonValue(form, fallback = '垃圾订单') {
  const preset = String(form?.preset || '').trim();
  const manual = String(form?.reason || '').trim();
  const parts = [preset, manual].filter(Boolean);
  if (!parts.length) return fallback;
  return Array.from(new Set(parts)).join(' / ');
}

function buildQuery() {
  const query = {
    page: pagination.page,
    page_size: pagination.pageSize,
    status: 'garbage',
    include_garbage: 1,
    order_no: filters.order_no || undefined,
    keyword: filters.keyword || undefined,
    risk_level: filters.risk_level || undefined,
  };
  if (filters.dateRange?.length === 2) {
    query.start_time = filters.dateRange[0];
    query.end_time = filters.dateRange[1];
  }
  return query;
}

async function enrichDeviceProfiles(list) {
  const ids = Array.from(new Set(list.map((item) => String(item.device_id || '').trim()).filter(Boolean)));
  if (!ids.length) {
    deviceProfiles.value = {};
    return;
  }

  const entries = await Promise.all(
    ids.map(async (deviceId) => {
      try {
        const resp = await getDeviceProfileApi(deviceId);
        return [deviceId, resp?.data || null];
      } catch {
        return [deviceId, null];
      }
    }),
  );

  deviceProfiles.value = Object.fromEntries(entries);
}

async function fetchRows() {
  loading.value = true;
  try {
    const resp = await getGarbageOrdersApi(buildQuery());
    const list = getList(resp);
    rows.value = list;
    pagination.total = Number(getTotal(resp));
    await enrichDeviceProfiles(list);
    if (detailDrawer.visible && detailDrawer.row?.id) {
      detailDrawer.row = list.find((item) => Number(item.id) === Number(detailDrawer.row?.id)) || detailDrawer.row;
      detailDrawer.deviceProfile = resolveDeviceProfile(detailDrawer.row);
    }
  } finally {
    loading.value = false;
  }
}

function runSearch() {
  pagination.page = 1;
  fetchRows();
}

function resetFilters() {
  filters.dateRange = [];
  filters.order_no = '';
  filters.keyword = '';
  filters.risk_level = '';
  pagination.page = 1;
  fetchRows();
}

function handleSizeChange(size) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchRows();
}

function openReasonDialog(row) {
  reasonDialog.row = row;
  reasonDialog.form.preset = '';
  reasonDialog.form.reason = row.junk_reason || '';
  reasonDialog.form.remark = '';
  reasonDialog.visible = true;
}

async function submitReason() {
  if (!reasonDialog.row?.id) return;
  reasonDialog.submitting = true;
  try {
    const reason = resolveReasonValue(reasonDialog.form);
    await updateGarbageOrderReasonApi(reasonDialog.row.id, {
      reason,
      remark: reasonDialog.form.remark || undefined,
    });
    ElMessage.success('垃圾原因已更新');
    reasonDialog.visible = false;
    emitAdminSync('order-risk-updated', {
      allow_same_tab: true,
      focus_order_id: reasonDialog.row.id,
      device_id: reasonDialog.row.device_id || '',
    });
    await fetchRows();
  } finally {
    reasonDialog.submitting = false;
  }
}

function openBlockDialog(row) {
  if (!row.device_id) {
    ElMessage.warning('该订单无设备标识，无法联动设备拉黑。');
    return;
  }
  blockDialog.row = row;
  blockDialog.form.duration = '5';
  blockDialog.form.reason = row.junk_reason || '垃圾订单';
  blockDialog.form.remark = '';
  blockDialog.visible = true;
}

async function submitBlock() {
  if (!blockDialog.row?.device_id) return;
  blockDialog.submitting = true;
  try {
    const isPermanent = blockDialog.form.duration === 'permanent';
    await blockDeviceApi(blockDialog.row.device_id, {
      duration_minutes: isPermanent ? 'permanent' : Number(blockDialog.form.duration),
      is_permanent: isPermanent,
      source: blockDialog.row.source || undefined,
      reason: blockDialog.form.reason || undefined,
      remark: blockDialog.form.remark || undefined,
    });
    ElMessage.success(isPermanent ? '关联设备已永久拉黑' : '关联设备已拉黑');
    blockDialog.visible = false;
    emitAdminSync('device-risk-updated', {
      allow_same_tab: true,
      device_id: blockDialog.row.device_id,
    });
    await fetchRows();
  } finally {
    blockDialog.submitting = false;
  }
}

async function unblockLinkedDevice(row) {
  if (!row.device_id) {
    ElMessage.warning('该订单无设备标识，无法解除设备封禁。');
    return;
  }
  await unblockDeviceApi(row.device_id, {
    reason: row.junk_reason || '垃圾订单恢复处理',
  });
  ElMessage.success('关联设备已解封');
  emitAdminSync('device-risk-updated', {
    allow_same_tab: true,
    device_id: row.device_id,
  });
  await fetchRows();
}

async function restoreOrder(row) {
  await ElMessageBox.confirm(`确认将订单 ${row.order_no} 恢复为正常订单吗？`, '恢复正常订单', {
    type: 'warning',
  });
  await restoreGarbageOrderApi(row.id, {
    restore_status: 'pending_contact',
  });
  ElMessage.success('订单已恢复为正常订单');
  emitAdminSync('order-status-updated', {
    allow_same_tab: true,
    focus_order_id: row.id,
    device_id: row.device_id || '',
  });
  await fetchRows();
}

function viewLinkedDevice(row) {
  if (!row.device_id) {
    ElMessage.warning('该订单无设备标识');
    return;
  }
  router.push({
    path: '/devices',
    query: {
      keyword: row.device_id,
    },
  });
}

async function openRiskDetail(row) {
  detailDrawer.visible = true;
  detailDrawer.row = row;
  detailDrawer.deviceProfile = row.device_id ? resolveDeviceProfile(row) : null;
  detailDrawer.events = [];
  if (!row.device_id) return;

  detailDrawer.eventsLoading = true;
  try {
    const [detailResp, profileResp, eventResp] = await Promise.all([
      getGarbageOrderDetailApi(row.id).catch(() => null),
      getDeviceProfileApi(row.device_id).catch(() => null),
      getDeviceRiskEventsApi(row.device_id, { page: 1, page_size: 20 }).catch(() => null),
    ]);
    detailDrawer.row = detailResp?.data || detailDrawer.row;
    detailDrawer.deviceProfile = profileResp?.data || detailDrawer.deviceProfile;
    detailDrawer.events = getList(eventResp);
  } finally {
    detailDrawer.eventsLoading = false;
  }
}

function setupAutoRefresh() {
  if (refreshTimer.value) clearInterval(refreshTimer.value);
  refreshTimer.value = setInterval(() => {
    if (!loading.value) {
      fetchRows();
    }
  }, 20000);
}

const refreshReasons = new Set([
  'order-status-updated',
  'order-risk-updated',
  'device-risk-updated',
  'order-created',
]);

function onSyncEvent(event) {
  const allowSameTab = event?.detail?.allow_same_tab === true || String(event?.detail?.allow_same_tab || '') === '1';
  if (isSelfAdminSyncEvent(event) && !allowSameTab) return;
  const reason = String(event?.detail?.reason || '');
  if (!refreshReasons.has(reason)) return;
  if (!loading.value) {
    fetchRows();
  }
}

onMounted(async () => {
  await fetchRows();
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
.toolbar-form {
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
  grid-template-columns: minmax(260px, 1fr);
}

.action-layer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.filter-layer :deep(.el-form-item) {
  margin: 0;
}

.compact-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.risk-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.risk-score {
  color: #374151;
  font-weight: 600;
}

.subtle {
  color: var(--text-tertiary);
  font-size: 12px;
}

.op-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.dialog-static-text {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f6f8fc;
  color: #263143;
  line-height: 1.5;
}

.dialog-break {
  word-break: break-all;
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

.detail-item span {
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-item strong {
  color: #1e2430;
  font-weight: 590;
  line-height: 1.45;
  word-break: break-word;
}

.detail-item-wide {
  grid-column: 1 / -1;
}

.pager {
  justify-content: flex-end;
  margin-top: 18px;
}

@media (max-width: 1080px) {
  .core-layer {
    grid-template-columns: 1fr;
  }

  .action-layer {
    justify-content: flex-start;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
