<template>
  <div class="page-shell">
    <h2 class="page-title">网吧管理</h2>

    <div class="card-surface page-toolbar toolbar-line">
      <el-button type="primary" @click="openDialog()">新增网吧</el-button>
      <div class="host-tip">
        <div>当前访问域名：<strong>{{ currentHost }}</strong></div>
        <div>管理后台正式地址预览：<strong>{{ adminPreviewUrl }}</strong></div>
        <div>线上入口正式地址预览：<strong>{{ onlinePreviewUrl }}</strong></div>
      </div>
    </div>

    <el-alert
      class="bind-tip"
      type="info"
      :closable="false"
      show-icon
      title="门店来源标识与 ntfy topic 已统一"
      description="每个门店都维护独立 store_key，ntfy 固定按门店自动生成两条 topic：yaojing-{store_key}-admin-live 与 yaojing-{store_key}-owner-finished。完整 URL 仅用于页面预览，不会写入数据库。"
    />

    <div class="card-surface page-table">
      <el-table :data="stores" v-loading="loading" stripe>
        <el-table-column prop="name" label="网吧名称" min-width="170" />
        <el-table-column prop="store_key" label="store_key" min-width="180" show-overflow-tooltip />
        <el-table-column prop="domain_prefix" label="domain_prefix(来源标识)" min-width="190" show-overflow-tooltip />
        <el-table-column prop="subdomain" label="subdomain(来源标识)" min-width="190" show-overflow-tooltip />
        <el-table-column prop="admin_live_topic" label="admin-live topic" min-width="280" show-overflow-tooltip />
        <el-table-column prop="owner_finished_topic" label="owner-finished topic" min-width="320" show-overflow-tooltip />
        <el-table-column label="本地测试地址预览" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ row.local_preview }}</template>
        </el-table-column>
        <el-table-column label="正式域名预览" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.prod_preview }}</template>
        </el-table-column>
        <el-table-column label="数据状态" min-width="150">
          <template #default="{ row }">
            <el-tag v-if="row.binding_dirty" type="warning">存在历史脏数据</el-tag>
            <span v-else>正常</span>
          </template>
        </el-table-column>
        <el-table-column label="抽成比例" min-width="120">
          <template #default="{ row }">{{ pct(row.commission_rate) }}</template>
        </el-table-column>
        <el-table-column prop="order_count" label="订单数" min-width="90" />
        <el-table-column label="累计收入" min-width="120">
          <template #default="{ row }">￥{{ money(row.total_income) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="deleteStore(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog.visible" :title="dialog.form.id ? '编辑网吧来源配置' : '新增网吧'" width="620px">
      <el-form label-width="180px">
        <el-form-item label="网吧名称">
          <el-input v-model="dialog.form.name" placeholder="请输入网吧名称" />
        </el-form-item>
        <el-form-item label="domain_prefix(来源标识)">
          <el-input v-model="dialog.form.domain_prefix" placeholder="仅输入 online / buka / yishiguang" />
        </el-form-item>
        <el-form-item label="subdomain(来源标识)">
          <el-input v-model="dialog.form.subdomain" placeholder="仅输入来源标识；留空时默认与 domain_prefix 一致" />
        </el-form-item>
        <el-form-item label="store_key(ntfy 用)">
          <el-input v-model="dialog.form.store_key" placeholder="留空时默认与 domain_prefix 一致" />
        </el-form-item>
        <el-form-item v-if="dirtyHintText">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            title="检测到历史脏数据，请确认后保存修复"
            :description="dirtyHintText"
          />
        </el-form-item>
        <el-form-item label="admin-live topic">
          <el-input :model-value="previewAdminLiveTopic" readonly />
        </el-form-item>
        <el-form-item label="owner-finished topic">
          <el-input :model-value="previewOwnerFinishedTopic" readonly />
        </el-form-item>
        <el-form-item label="本地测试地址预览">
          <el-input :model-value="previewLocalUrl" readonly />
        </el-form-item>
        <el-form-item label="正式域名预览">
          <el-input :model-value="previewProdUrl" readonly />
        </el-form-item>
        <el-form-item label="抽成比例(%)">
          <el-input-number v-model="dialog.form.ratePercent" :min="1" :max="99" :step="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveStore">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createStoreApi, deleteStoreApi, getStoresApi, updateStoreApi } from '../../api/stores';
import { getList } from '../../utils/api';
import { emitAdminSync } from '../../utils/adminSync';
import {
  isValidSourceIdentifier,
  normalizeSourceIdentifier,
  resolveLocalPreviewUrl,
  resolveProdPreviewUrl,
  resolveStoreBinding,
} from '../../utils/sourceBinding';

const loading = ref(false);
const stores = ref([]);
const currentHost = window.location.host;
const adminPreviewUrl = 'https://admin.yaojingclub.com';
const onlinePreviewUrl = 'https://online.yaojingclub.com';

const dialog = reactive({
  visible: false,
  form: {
    id: null,
    name: '',
    ratePercent: 5,
    domain_prefix: '',
    subdomain: '',
    store_key: '',
    dirty_domain_prefix_raw: '',
    dirty_subdomain_raw: '',
    dirty_store_key_raw: '',
  },
});

const previewLocalUrl = computed(() => resolveLocalPreviewUrl(dialog.form.domain_prefix));
const previewProdUrl = computed(() => resolveProdPreviewUrl(dialog.form.domain_prefix));
const previewStoreKey = computed(() => normalizeSourceIdentifier(dialog.form.store_key || dialog.form.domain_prefix));
const previewAdminLiveTopic = computed(() =>
  previewStoreKey.value ? `yaojing-${previewStoreKey.value}-admin-live` : ''
);
const previewOwnerFinishedTopic = computed(() =>
  previewStoreKey.value ? `yaojing-${previewStoreKey.value}-owner-finished` : ''
);
const dirtyHintText = computed(() => {
  const hints = [];
  if (dialog.form.dirty_domain_prefix_raw) {
    hints.push(`domain_prefix 原始值：${dialog.form.dirty_domain_prefix_raw}`);
  }
  if (dialog.form.dirty_subdomain_raw) {
    hints.push(`subdomain 原始值：${dialog.form.dirty_subdomain_raw}`);
  }
  if (dialog.form.dirty_store_key_raw) {
    hints.push(`store_key 原始值：${dialog.form.dirty_store_key_raw}`);
  }
  return hints.join('；');
});

function money(v) {
  return Number(v || 0).toFixed(2);
}

function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(0)}%`;
}

function normalizeStoreRow(row) {
  const binding = resolveStoreBinding(row);
  const domainPrefix = binding.domain_prefix || '';
  const subdomain = binding.subdomain || '';
  const previewSource = domainPrefix || subdomain || '';

  return {
    ...row,
    store_key: binding.store_key || domainPrefix,
    source_identifier: binding.source_identifier || previewSource,
    domain_prefix: domainPrefix,
    subdomain,
    admin_live_topic: binding.store_key ? `yaojing-${binding.store_key}-admin-live` : '',
    owner_finished_topic: binding.store_key ? `yaojing-${binding.store_key}-owner-finished` : '',
    local_preview: resolveLocalPreviewUrl(previewSource),
    prod_preview: resolveProdPreviewUrl(previewSource),
    binding_dirty: Boolean(binding.binding_dirty),
    binding_dirty_raw: binding.binding_dirty_raw || '',
    binding_dirty_domain_prefix_raw: binding.binding_dirty_domain_prefix_raw || '',
    binding_dirty_subdomain_raw: binding.binding_dirty_subdomain_raw || '',
    binding_dirty_store_key_raw: binding.binding_dirty_store_key_raw || '',
  };
}

async function fetchStores() {
  loading.value = true;
  try {
    const resp = await getStoresApi();
    stores.value = getList(resp).map(normalizeStoreRow);
  } finally {
    loading.value = false;
  }
}

function openDialog(row) {
  if (!row) {
    dialog.form = {
      id: null,
      name: '',
      ratePercent: 5,
      domain_prefix: '',
      subdomain: '',
      store_key: '',
      dirty_domain_prefix_raw: '',
      dirty_subdomain_raw: '',
      dirty_store_key_raw: '',
    };
  } else {
    const binding = resolveStoreBinding(row);
    dialog.form = {
      id: row.id,
      name: row.name,
      ratePercent: Number(row.commission_rate || 0.3) * 100,
      domain_prefix: binding.domain_prefix || '',
      subdomain: binding.subdomain || '',
      store_key: binding.store_key || binding.domain_prefix || '',
      dirty_domain_prefix_raw: binding.binding_dirty_domain_prefix_raw || '',
      dirty_subdomain_raw: binding.binding_dirty_subdomain_raw || '',
      dirty_store_key_raw: binding.binding_dirty_store_key_raw || '',
    };
  }
  dialog.visible = true;
}

async function saveStore() {
  const storeName = String(dialog.form.name || '').trim();
  if (!storeName) {
    ElMessage.warning('请输入网吧名称');
    return;
  }

  const domainPrefix = normalizeSourceIdentifier(dialog.form.domain_prefix);
  if (!domainPrefix) {
    ElMessage.warning('请输入 domain_prefix 来源标识');
    return;
  }
  if (!isValidSourceIdentifier(domainPrefix)) {
    ElMessage.warning('domain_prefix 只能包含小写字母、数字、-、_，例如 online');
    return;
  }

  let subdomain = normalizeSourceIdentifier(dialog.form.subdomain);
  if (!subdomain) {
    subdomain = domainPrefix;
  }
  if (!isValidSourceIdentifier(subdomain)) {
    ElMessage.warning('subdomain 只能包含小写字母、数字、-、_，例如 buka');
    return;
  }

  let storeKey = normalizeSourceIdentifier(dialog.form.store_key);
  if (!storeKey) {
    storeKey = domainPrefix;
  }
  if (!isValidSourceIdentifier(storeKey)) {
    ElMessage.warning('store_key 只能包含小写字母、数字、-、_，例如 buka');
    return;
  }

  const payload = {
    name: storeName,
    commission_rate: Number(dialog.form.ratePercent) / 100,
    domain_prefix: domainPrefix,
    subdomain,
    store_key: storeKey,
    source_identifier: domainPrefix,
  };

  if (dialog.form.id) {
    await updateStoreApi(dialog.form.id, payload);
  } else {
    await createStoreApi(payload);
  }

  ElMessage.success('保存成功');
  dialog.visible = false;
  await fetchStores();
  emitAdminSync(dialog.form.id ? 'store-updated' : 'store-created', {
    store_name: storeName,
    store_key: storeKey,
    domain_prefix: domainPrefix,
    subdomain,
  });
}

async function deleteStore(row) {
  await ElMessageBox.confirm(`确认删除网吧「${row.name}」吗？`, '提示', { type: 'warning' });
  await deleteStoreApi(row.id);
  ElMessage.success('删除成功');
  await fetchStores();
  emitAdminSync('store-deleted', {
    store_id: row.id,
    store_name: row.name,
  });
}

onMounted(() => {
  fetchStores();
});
</script>

<style scoped>
.toolbar-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.host-tip {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  background: #f9f9fa;
  border: 1px solid #ececf0;
  border-radius: 12px;
  padding: 8px 12px;
}

.host-tip strong {
  color: #262932;
}

.bind-tip {
  margin-bottom: 16px;
}
</style>
