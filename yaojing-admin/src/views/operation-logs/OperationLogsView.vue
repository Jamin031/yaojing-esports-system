<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">Audit Trail</p>
        <h2 class="page-title">操作日志</h2>
        <p class="page-subtitle">关键操作追踪与审计视图</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>日志总量</span>
          <strong>{{ pagination.total }}</strong>
        </div>
        <div class="metric-chip">
          <span>当前页</span>
          <strong>{{ list.length }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters" class="log-filter-form">
        <el-form-item label="操作人">
          <el-input v-model="filters.operator" placeholder="姓名或账号" clearable style="width: 180px" />
        </el-form-item>
        <el-form-item label="动作">
          <el-input v-model="filters.action" placeholder="如：删除订单 / 恢复订单" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="IP">
          <el-input v-model="filters.ip" placeholder="可选" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">审计明细</h3>
      </div>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="operator_name" label="操作人" min-width="120" />
        <el-table-column label="动作" min-width="180">
          <template #default="{ row }">{{ row.action_text }}</template>
        </el-table-column>
        <el-table-column label="目标" min-width="180">
          <template #default="{ row }">{{ row.target_text }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" min-width="130" />
        <el-table-column label="详情" min-width="360" show-overflow-tooltip>
          <template #default="{ row }">{{ row.detail_text }}</template>
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
        @size-change="handleSizeChange"
        @current-change="fetchLogs"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { getOperationLogsApi } from '../../api/operationLogs';
import { getList, getTotal } from '../../utils/api';

const ACTION_TEXT_MAP = {
  update_order_status: '修改订单状态',
  update_order_remark: '更新订单备注',
  update_order_note: '更新订单备注',
  assign_play_store: '派单陪玩店',
  delete_order: '删除订单',
  restore_order: '恢复订单',
  permanent_delete_order: '彻底删除订单',
  grant_permission: '发放权限',
  revoke_permission: '收回权限',
  update_user_permissions: '更新个人权限',
  update_role_permissions_template: '更新身份默认权限模板',
  'devices.block': '设备拉黑',
  'devices.permanent_block': '永久拉黑设备',
  'devices.unblock': '解除设备封禁',
  'devices.revoke_permanent_block': '撤回永久拉黑',
  update_user_name: '修改用户姓名',
  update_user_status: '修改用户状态',
  create_order: '创建订单',
  create_user: '创建用户',
  reset_password: '重置密码',
  update_play_store_share: '设置陪玩店分成',
  update_store_binding: '更新网吧来源绑定',
  create_store: '新增网吧',
  update_store: '编辑网吧',
  delete_store: '删除网吧',
  create_play_store: '新增陪玩店',
  update_play_store: '编辑陪玩店',
  delete_play_store: '删除陪玩店',
};

const ACTION_ALIAS_MAP = {
  assign_play_shop: 'assign_play_store',
  dispatch_play_store: 'assign_play_store',
  set_order_status: 'update_order_status',
  change_order_status: 'update_order_status',
  order_remark_updated: 'update_order_remark',
  edit_order_remark: 'update_order_remark',
  set_play_store_share: 'update_play_store_share',
  update_role_template: 'update_role_permissions_template',
  update_role_default_permissions: 'update_role_permissions_template',
  role_template_updated: 'update_role_permissions_template',
};

const ACTION_CODE_BY_LABEL = Object.entries(ACTION_TEXT_MAP).reduce((acc, [code, text]) => {
  if (text && !acc[text]) {
    acc[text] = code;
  }
  return acc;
}, {});

const NON_BUSINESS_ACTION_CODES = new Set([
  'open_page',
  'view_page',
  'visit_page',
  'browse_page',
  'page_view',
  'page_visit',
  'page_access',
  'route_visit',
  'route_access',
  'navigate',
  'navigation',
  'enter_page',
  'leave_page',
  'refresh_page',
]);

const NON_BUSINESS_DETAIL_HINTS = ['打开页面', '浏览页面', '访问页面', '页面访问', '进入页面', '离开页面', '路由访问', '页面刷新'];

const STATUS_MAP = {
  pending: '待联系',
  pending_contact: '待联系',
  processing: '订单进行中',
  problem: '问题订单',
  completed: '订单已完成',
  cancelled: '已取消',
};

const FIELD_MAP = {
  order_no: '订单号',
  order_id: '订单ID',
  store_name: '来源网吧',
  play_store_name: '陪玩店',
  from_status: '原状态',
  to_status: '新状态',
  old_status: '原状态',
  new_status: '新状态',
  user_name: '用户',
  username: '账号',
  old_name: '原姓名',
  new_name: '新姓名',
  permissions: '权限',
  role: '身份',
  role_name: '身份',
  target: '目标',
  old_rate: '原分成',
  new_rate: '新分成',
  from_rate: '原分成',
  to_rate: '新分成',
  commission_rate: '分成比例',
  store_share: '网吧分成',
  west_share: '曜竞分成',
  play_store_share: '陪玩店分成',
  contact: '联系方式',
  order_info: '订单信息',
  remark: '备注',
  reason: '原因',
  message: '说明',
  description: '说明',
  created_at: '时间',
  updated_at: '时间',
  deleted_at: '时间',
  ip: 'IP',
};

const loading = ref(false);
const list = ref([]);

const pagination = reactive({
  page: 1,
  page_size: 12,
  total: 0,
});

const filters = reactive({
  operator: '',
  action: '',
  ip: '',
  dateRange: [],
});

function containsChinese(value) {
  return /[\u4e00-\u9fa5]/.test(String(value || ''));
}

function normalizeActionCode(action) {
  const raw = String(action || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!raw) return '';
  return ACTION_ALIAS_MAP[raw] || raw;
}

function isMeaninglessPageAction(actionCode) {
  if (!actionCode) return false;
  if (NON_BUSINESS_ACTION_CODES.has(actionCode)) return true;

  const hasPageLikeWord = /(page|route|navigation|navigate)/.test(actionCode);
  const hasVisitWord = /(view|browse|visit|open|enter|leave|access|refresh)/.test(actionCode);
  return hasPageLikeWord && hasVisitWord;
}

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusText(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return STATUS_MAP[normalized] || STATUS_MAP[status] || status || '-';
}

function pickLocalizedText(candidates) {
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (!text) continue;
    if (containsChinese(text)) return text;
  }
  return '';
}

function parseDetail(detail) {
  if (!detail) return {};
  if (typeof detail === 'object') {
    if (detail && typeof detail.detail === 'object' && detail.detail) {
      return detail.detail;
    }
    return detail;
  }

  const text = String(detail);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function normalizeFieldLabel(key) {
  const normalized = String(key || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '补充信息';
  if (FIELD_MAP[normalized]) return FIELD_MAP[normalized];

  const tokenMap = {
    order: '订单',
    no: '号',
    id: 'ID',
    store: '网吧',
    play: '陪玩',
    shop: '店',
    status: '状态',
    user: '用户',
    name: '名称',
    old: '原',
    new: '新',
    from: '原',
    to: '新',
    role: '身份',
    permission: '权限',
    contact: '联系方式',
    amount: '金额',
    share: '分成',
    remark: '备注',
    reason: '原因',
    created: '创建',
    updated: '更新',
    deleted: '删除',
    time: '时间',
    at: '',
  };

  const translated = normalized
    .split(/[:_.-]+/)
    .map((part) => tokenMap[part] ?? '')
    .filter(Boolean)
    .join('');

  return translated || '补充信息';
}

function formatPercent(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value || '-');
  if (numberValue <= 1) {
    const percent = numberValue * 100;
    return `${percent.toFixed(percent % 1 === 0 ? 0 : 2)}%`;
  }
  if (numberValue <= 100) {
    return `${numberValue.toFixed(numberValue % 1 === 0 ? 0 : 2)}%`;
  }
  return String(numberValue);
}

function formatDetailValue(key, value) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) {
    return value.map((item) => formatDetailValue(key, item)).filter(Boolean).join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return JSON.stringify(value);

  const normalizedKey = String(key || '').toLowerCase();
  if (normalizedKey.includes('status')) return statusText(value);
  if (/(rate|ratio|percent)$/.test(normalizedKey)) return formatPercent(value);

  return String(value);
}

function readablePairs(detail) {
  if (!detail || typeof detail !== 'object') return '';

  const pairs = Object.entries(detail)
    .filter(([key, value]) => !['text', 'message', 'description'].includes(String(key || '').toLowerCase()) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      const valueText = formatDetailValue(key, value);
      if (!valueText) return '';
      return `${normalizeFieldLabel(key)}：${valueText}`;
    })
    .filter(Boolean);

  if (pairs.length) return pairs.join('；');

  const plainText = String(detail.text || detail.message || detail.description || '').trim();
  return plainText;
}

function actionText(row) {
  const localized = pickLocalizedText([
    row.action_text,
    row.action_name,
    row.action_label,
    row.action_cn,
    row.action_zh,
    row.action_desc,
    row.action_description,
  ]);
  if (localized) return localized;

  const actionCode = normalizeActionCode(row.action_code || row.action || row.type || row.event || '');
  if (!actionCode) return '其他操作';
  return ACTION_TEXT_MAP[actionCode] || '其他操作';
}

function targetText(row) {
  const detail = row.detail_object || parseDetail(row.detail);
  const localized = pickLocalizedText([row.target_text, row.target_label, row.target_name]);
  if (localized) return localized;

  const rowTarget = String(row.target || '').trim();
  if (rowTarget) return rowTarget;

  const candidates = [
    detail.target,
    detail.order_no,
    detail.order_id,
    detail.user_name,
    detail.username,
    detail.store_name,
    detail.play_store_name,
  ];

  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }

  return '-';
}

function summarizePermissionChange(detail) {
  const permissions = detail.permissions || detail.permission_keys || detail.permission_list;
  if (Array.isArray(permissions)) {
    return permissions.length ? `共 ${permissions.length} 项权限` : '权限项为空';
  }

  if (permissions && typeof permissions === 'object') {
    const total = Object.values(permissions).reduce((sum, value) => {
      if (!Array.isArray(value)) return sum;
      return sum + value.length;
    }, 0);
    return total ? `共 ${total} 项权限` : '权限项为空';
  }

  return '权限已调整';
}

function detailText(row) {
  const detail = row.detail_object || parseDetail(row.detail);
  const operator = row.operator_name || '管理员';
  const action = normalizeActionCode(row.action_code || row.action || row.type || row.event || '');

  const localized = pickLocalizedText([row.detail_text, row.description, row.message, row.content]);
  if (localized && !NON_BUSINESS_DETAIL_HINTS.some((hint) => localized.includes(hint))) {
    return localized;
  }

  if (action === 'update_order_status') {
    const orderNo = detail.order_no || row.target || '未知订单';
    const from = statusText(detail.from_status || detail.old_status || detail.before_status || detail.before);
    const to = statusText(detail.to_status || detail.new_status || detail.after_status || detail.after);
    return `${operator} 将订单 ${orderNo} 状态从 ${from} 修改为 ${to}`;
  }

  if (action === 'update_order_remark' || action === 'update_order_note') {
    const orderNo = detail.order_no || row.target || '未知订单';
    const remark = detail.remark || detail.note || detail.order_remark || detail.order_note || '';
    if (remark) {
      return `${operator} 更新了订单 ${orderNo} 备注：${String(remark).slice(0, 40)}`;
    }
    return `${operator} 更新了订单 ${orderNo} 备注`;
  }

  if (action === 'assign_play_store') {
    const orderNo = detail.order_no || row.target || '未知订单';
    const playStore = detail.play_store_name || detail.shop_name || detail.play_store || '未指定陪玩店';
    return `${operator} 将订单 ${orderNo} 派单到陪玩店「${playStore}」`;
  }

  if (action === 'delete_order') {
    const orderNo = detail.order_no || row.target || '未知订单';
    return `${operator} 删除了订单 ${orderNo}`;
  }

  if (action === 'restore_order') {
    const orderNo = detail.order_no || row.target || '未知订单';
    return `${operator} 恢复了订单 ${orderNo}`;
  }

  if (action === 'permanent_delete_order') {
    const orderNo = detail.order_no || row.target || '未知订单';
    return `${operator} 彻底删除了订单 ${orderNo}`;
  }

  if (action === 'grant_permission') {
    const targetUser = detail.user_name || detail.username || row.target || '目标账号';
    return `${operator} 向 ${targetUser} 发放权限（${summarizePermissionChange(detail)}）`;
  }

  if (action === 'revoke_permission') {
    const targetUser = detail.user_name || detail.username || row.target || '目标账号';
    return `${operator} 收回 ${targetUser} 的权限（${summarizePermissionChange(detail)}）`;
  }

  if (action === 'update_user_permissions') {
    const targetUser = detail.user_name || detail.username || row.target || '目标账号';
    return `${operator} 调整了 ${targetUser} 的个人权限（${summarizePermissionChange(detail)}）`;
  }

  if (action === 'update_role_permissions_template') {
    const roleName = detail.role_name || detail.role || row.target || '目标身份';
    return `${operator} 更新了「${roleName}」身份默认权限模板`;
  }

  if (action === 'update_user_name') {
    const oldName = detail.old_name || detail.before || '-';
    const newName = detail.new_name || detail.after || '-';
    return `${operator} 将用户姓名从「${oldName}」修改为「${newName}」`;
  }

  if (action === 'update_play_store_share') {
    const storeName = detail.play_store_name || detail.store_name || row.target || '陪玩店';
    const oldRate = detail.old_rate ?? detail.from_rate ?? detail.before_rate ?? detail.old_value;
    const newRate = detail.new_rate ?? detail.to_rate ?? detail.after_rate ?? detail.new_value;
    if (oldRate !== undefined && newRate !== undefined) {
      return `${operator} 将「${storeName}」分成由 ${formatPercent(oldRate)} 调整为 ${formatPercent(newRate)}`;
    }
    return `${operator} 设置了「${storeName}」分成`;
  }

  if (action === 'create_user') {
    const targetUser = detail.user_name || detail.username || row.target || '新账号';
    const roleName = detail.role_name || detail.role || '';
    return roleName ? `${operator} 创建了账号 ${targetUser}（${roleName}）` : `${operator} 创建了账号 ${targetUser}`;
  }

  if (action === 'reset_password') {
    const targetUser = detail.user_name || detail.username || row.target || '目标账号';
    return `${operator} 重置了 ${targetUser} 的密码`;
  }

  if (action === 'create_store' || action === 'update_store' || action === 'delete_store') {
    const storeName = detail.store_name || detail.name || row.target || '网吧';
    if (action === 'create_store') return `${operator} 新增了网吧「${storeName}」`;
    if (action === 'update_store') return `${operator} 编辑了网吧「${storeName}」`;
    return `${operator} 删除了网吧「${storeName}」`;
  }

  const pairs = readablePairs(detail);
  if (pairs) return pairs;

  return '-';
}

function isBusinessLog(row) {
  const actionCode = normalizeActionCode(row.action_code || row.action || row.type || row.event || '');
  if (isMeaninglessPageAction(actionCode)) return false;

  const detailTextValue = String(row.detail_text || row.description || row.message || row.detail || '').trim();
  if (NON_BUSINESS_DETAIL_HINTS.some((hint) => detailTextValue.includes(hint))) return false;

  return true;
}

function normalizeLogRow(rawRow) {
  const detailObject = parseDetail(rawRow.detail || rawRow.detail_json || rawRow.extra || rawRow.meta);
  const row = {
    ...rawRow,
    action_code: normalizeActionCode(rawRow.action_code || rawRow.action || rawRow.type || rawRow.event || ''),
    detail_object: detailObject,
  };
  row.action_text = actionText(row);
  row.target_text = targetText(row);
  row.detail_text = detailText(row);
  return row;
}

function resolveActionFilter(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  return ACTION_CODE_BY_LABEL[text] || text;
}

function buildQuery() {
  const query = {
    page: pagination.page,
    page_size: pagination.page_size,
    operator: filters.operator || undefined,
    action: resolveActionFilter(filters.action),
    ip: filters.ip || undefined,
    business_only: 1,
    exclude_action_codes: Array.from(NON_BUSINESS_ACTION_CODES).join(','),
  };

  if (filters.dateRange?.length === 2) {
    query.start_time = filters.dateRange[0];
    query.end_time = filters.dateRange[1];
  }

  return query;
}

async function fetchLogs() {
  loading.value = true;
  try {
    const resp = await getOperationLogsApi(buildQuery());
    const rows = getList(resp).map(normalizeLogRow).filter(isBusinessLog);
    list.value = rows;

    const total = Number(getTotal(resp));
    if (Number.isFinite(total) && total >= rows.length) {
      pagination.total = total;
    } else {
      pagination.total = rows.length;
    }
  } finally {
    loading.value = false;
  }
}

function search() {
  pagination.page = 1;
  fetchLogs();
}

function reset() {
  filters.operator = '';
  filters.action = '';
  filters.ip = '';
  filters.dateRange = [];
  pagination.page = 1;
  fetchLogs();
}

function handleSizeChange(size) {
  pagination.page_size = size;
  pagination.page = 1;
  fetchLogs();
}

onMounted(() => {
  fetchLogs();
});
</script>

<style scoped>
.log-filter-form {
  width: 100%;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
