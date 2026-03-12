<template>
  <div class="page-shell">
    <h2 class="page-title">线上用户管理</h2>

    <div class="card-surface page-toolbar">
      <el-form :inline="true" :model="filters">
        <el-form-item label="网吧ID">
          <el-input v-model="filters.store_id" placeholder="可选" style="width: 160px" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" style="width: 140px" clearable>
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchOnlineUsers">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-row :gutter="16" class="cards">
      <el-col :xs="24" :sm="12" :lg="6">
        <div class="card-surface metric">
          <div class="metric-label">用户总数</div>
          <div class="metric-value">{{ total }}</div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <div class="card-surface metric">
          <div class="metric-label">在线人数</div>
          <div class="metric-value">{{ onlineCount }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="card-surface page-table">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="store_name" label="所属网吧" min-width="150" />
        <el-table-column prop="nickname" label="用户昵称" min-width="150" />
        <el-table-column prop="game_name" label="游戏" min-width="140" />
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'info'">
              {{ row.status === 'online' ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_seen_at" label="最后在线" min-width="180" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { getOnlineUsersApi } from '../../api/onlineUsers';
import { getList, getPayloadObject, getTotal } from '../../utils/api';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const onlineCount = ref(0);

const filters = reactive({
  store_id: '',
  status: '',
});

async function fetchOnlineUsers() {
  loading.value = true;
  try {
    const resp = await getOnlineUsersApi({
      store_id: filters.store_id || undefined,
      status: filters.status || undefined,
    });
    const data = getPayloadObject(resp);
    list.value = getList(resp);
    total.value = getTotal(resp);
    onlineCount.value = Number(data.online_count || data.onlineCount || 0);
  } finally {
    loading.value = false;
  }
}

function reset() {
  filters.store_id = '';
  filters.status = '';
  fetchOnlineUsers();
}

onMounted(() => {
  fetchOnlineUsers();
});
</script>

<style scoped>
.cards {
  margin-bottom: 16px;
}

.metric {
  padding: 16px;
}

.metric-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.metric-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
}
</style>
