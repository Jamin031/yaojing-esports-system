<template>
  <div class="page-shell">
    <h2 class="page-title">陪玩店维护</h2>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters">
        <el-form-item label="陪玩店名称">
          <el-input v-model="filters.keyword" placeholder="请输入关键词" clearable style="width: 220px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">查询</el-button>
          <el-button @click="reset">重置</el-button>
          <el-button v-if="canManagePlayStores" type="primary" plain @click="openDialog()">新增陪玩店</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="card-surface page-table">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="name" label="陪玩店名称" min-width="220" />
        <el-table-column label="分成比例" min-width="140">
          <template #default="{ row }">{{ pct(row.commission_rate) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="180">
          <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
        </el-table-column>
        <el-table-column v-if="canManagePlayStores" label="操作" min-width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog.visible" :title="dialog.form.id ? '编辑陪玩店' : '新增陪玩店'" width="420px">
      <el-form label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="dialog.form.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="分成比例(%)">
          <el-input-number v-model="dialog.form.ratePercent" :min="1" :max="99" :step="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createPlayStoreApi, deletePlayStoreApi, getPlayStoresApi, updatePlayStoreApi } from '../../api/playStores';
import { useAuthStore } from '../../store/auth';
import { usePermission } from '../../composables/usePermission';
import { getList } from '../../utils/api';

const authStore = useAuthStore();
const { hasButton } = usePermission();

const loading = ref(false);
const list = ref([]);

const filters = reactive({
  keyword: '',
});

const dialog = reactive({
  visible: false,
  form: {
    id: null,
    name: '',
    ratePercent: 90,
  },
});

const canManagePlayStores = computed(() => hasButton('play_store:manage') && authStore.role !== 'store_owner');

function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(0)}%`;
}

function formatMinute(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function fetchList() {
  loading.value = true;
  try {
    const resp = await getPlayStoresApi({ keyword: filters.keyword || undefined });
    list.value = getList(resp);
  } finally {
    loading.value = false;
  }
}

function reset() {
  filters.keyword = '';
  fetchList();
}

function openDialog(row) {
  if (!row) {
    dialog.form = {
      id: null,
      name: '',
      ratePercent: 90,
    };
  } else {
    dialog.form = {
      id: row.id,
      name: row.name,
      ratePercent: Number(row.commission_rate || 0.9) * 100,
    };
  }

  dialog.visible = true;
}

async function save() {
  const payload = {
    name: dialog.form.name,
    commission_rate: Number(dialog.form.ratePercent || 0) / 100,
  };

  if (!payload.name) {
    ElMessage.warning('请输入陪玩店名称');
    return;
  }

  if (dialog.form.id) {
    await updatePlayStoreApi(dialog.form.id, payload);
  } else {
    await createPlayStoreApi(payload);
  }

  dialog.visible = false;
  ElMessage.success('保存成功');
  fetchList();
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除陪玩店「${row.name}」吗？`, '提示', { type: 'warning' });
  await deletePlayStoreApi(row.id);
  ElMessage.success('删除成功');
  fetchList();
}

fetchList();
</script>
