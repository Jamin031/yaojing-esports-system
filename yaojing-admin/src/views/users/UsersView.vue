<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">Account Center</p>
        <h2 class="page-title">用户管理</h2>
        <p class="page-subtitle">账号状态、角色身份与网吧绑定统一维护</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>账号总数</span>
          <strong>{{ users.length }}</strong>
        </div>
        <div class="metric-chip">
          <span>网吧老板</span>
          <strong>{{ users.filter((item) => resolveRole(item) === 'store_owner').length }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar users-toolbar">
      <el-button type="primary" @click="openCreate">新增用户</el-button>
    </div>

    <div class="card-surface page-table">
      <div class="section-head">
        <h3 class="section-title">账号列表</h3>
      </div>
      <el-table :data="users" v-loading="loading" stripe>
        <el-table-column prop="name" label="姓名" min-width="120" />
        <el-table-column prop="username" label="账号" min-width="140" />
        <el-table-column label="角色" min-width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :class="['role-tag', `role-${resolveRole(row)}`]">{{ roleText(resolveRole(row)) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="140">
          <template #default="{ row }">
            <el-switch
              v-if="!isSuperAdminRow(row)"
              :model-value="resolveStatus(row) === 'active'"
              inline-prompt
              active-text="启用"
              inactive-text="禁用"
              @change="(enabled) => updateStatus(row, enabled)"
            />
            <el-tag v-else type="info">始终启用</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="store_name" label="绑定网吧" min-width="160" />
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatMinute(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="280">
          <template #default="{ row }">
            <div class="op-cell">
              <el-button link type="primary" @click="openEditRole(row)">修改角色</el-button>
              <el-button link type="primary" @click="openEditName(row)">修改姓名</el-button>
              <el-button link type="warning" @click="openChangePassword(row)">修改密码</el-button>
              <el-button v-if="canDeleteUser(row)" link type="danger" @click="deleteUser(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="createDialog.visible" title="新增用户" width="460px">
      <el-form label-width="110px">
        <el-form-item label="姓名">
          <el-input v-model="createDialog.form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="账号">
          <el-input v-model="createDialog.form.username" placeholder="请输入登录账号" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="createDialog.form.password" placeholder="请输入初始密码" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="createDialog.form.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="网吧老板" value="store_owner" />
            <el-option label="客服" value="customer_service" />
            <el-option label="财务" value="finance" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定网吧" v-if="createDialog.form.role === 'store_owner'">
          <el-select v-model="createDialog.form.store_id" style="width: 100%" placeholder="请选择网吧">
            <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="createUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="nameDialog.visible" title="修改姓名" width="420px">
      <el-form label-width="90px">
        <el-form-item label="新姓名">
          <el-input v-model="nameDialog.name" placeholder="请输入新姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nameDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveName">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pwdDialog.visible" title="修改密码" width="420px">
      <el-form label-width="100px">
        <el-form-item label="新密码">
          <el-input v-model="pwdDialog.password" show-password placeholder="请输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="savePassword">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleDialog.visible" title="修改角色" width="460px">
      <el-form label-width="110px">
        <el-form-item label="角色">
          <el-select v-model="roleDialog.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="网吧老板" value="store_owner" />
            <el-option label="客服" value="customer_service" />
            <el-option label="财务" value="finance" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="roleDialog.role === 'store_owner'" label="绑定网吧">
          <el-select v-model="roleDialog.store_id" style="width: 100%" placeholder="请选择网吧">
            <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveRole">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createUserApi,
  deleteUserApi,
  getUsersApi,
  resetPasswordApi,
  updateUserApi,
  updateUserNameApi,
  updateUserStatusApi,
} from '../../api/users';
import { getRolePermissionTemplatesApi, updateUserPermissionsApi } from '../../api/permissions';
import { getStoresApi } from '../../api/stores';
import { getList, getPayloadObject } from '../../utils/api';
import { offAdminSync, onAdminSync } from '../../utils/adminSync';
import { buildPermissionRequestPayload, normalizePermissionSet, normalizeRolePermissionTemplateMap } from '../../utils/permissionTemplateCache';

const loading = ref(false);
const users = ref([]);
const stores = ref([]);

const createDialog = reactive({
  visible: false,
  form: {
    name: '',
    username: '',
    password: '',
    role: 'admin',
    store_id: undefined,
  },
});

const nameDialog = reactive({
  visible: false,
  userId: null,
  name: '',
});

const pwdDialog = reactive({
  visible: false,
  userId: null,
  password: '',
});

const roleDialog = reactive({
  visible: false,
  userId: null,
  role: 'admin',
  store_id: undefined,
});

function resolveRole(row) {
  return row?.role || row?.user_role || row?.role_key || '';
}

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function resolveUserId(row) {
  const id = row?.id ?? row?.user_id ?? row?.userId ?? row?.uid;
  return id === null || id === undefined || id === '' ? null : id;
}

function resolveStatus(row) {
  return String(row?.status || '').trim().toLowerCase() || 'active';
}

function resolveStoreId(row) {
  const storeId = row?.store_id ?? row?.storeId ?? row?.source_store_id ?? row?.sourceStoreId;
  if (storeId === null || storeId === undefined || storeId === '') return undefined;
  return storeId;
}

function isSuperAdminRow(row) {
  const role = normalizeRole(resolveRole(row));
  if (role === 'super_admin' || role === 'super-admin' || role === 'superadmin') return true;

  // 历史数据兼容：少量旧数据可能只返回系统账号名。
  const username = normalizeRole(row?.username);
  return username === 'admin' && role.startsWith('super');
}

function canDeleteUser(row) {
  return !isSuperAdminRow(row);
}

function roleText(role) {
  const map = {
    super_admin: '超级管理员',
    admin: '管理员',
    store_owner: '网吧老板',
    customer_service: '客服',
    finance: '财务',
  };
  return map[role] || role;
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

async function fetchUsers() {
  loading.value = true;
  try {
    const resp = await getUsersApi();
    users.value = getList(resp);
  } finally {
    loading.value = false;
  }
}

async function fetchStores() {
  const resp = await getStoresApi();
  stores.value = getList(resp);
}

function extractRoleTemplates(source) {
  const payload = source && typeof source === 'object' ? source : {};
  const templateMap = {};

  const mergeFromObject = (target) => {
    const normalized = normalizeRolePermissionTemplateMap(target || {});
    Object.entries(normalized).forEach(([role, permissions]) => {
      const roleKey = normalizeRole(role);
      if (!roleKey) return;
      templateMap[roleKey] = normalizePermissionSet(permissions);
    });
  };

  const mergeFromList = (target) => {
    if (!Array.isArray(target)) return;
    target.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const roleKey = normalizeRole(item.role || item.role_key || item.roleName || item.name);
      if (!roleKey) return;
      templateMap[roleKey] = normalizePermissionSet(item.permissions || item.template || item.template_permissions || item);
    });
  };

  mergeFromObject(payload.role_templates);
  mergeFromObject(payload.roleTemplates);
  mergeFromObject(payload.templates);
  mergeFromObject(payload.default_role_permissions);
  mergeFromList(payload.list);
  mergeFromList(payload.rows);
  mergeFromList(payload.items);

  if (!Object.keys(templateMap).length) {
    mergeFromObject(payload);
  }

  return templateMap;
}

async function loadRoleTemplatePermissions(role) {
  const roleKey = normalizeRole(role);
  if (!roleKey || roleKey === 'super_admin') return null;

  try {
    const resp = await getRolePermissionTemplatesApi();
    const payload = getPayloadObject(resp);
    const templates = extractRoleTemplates(payload);
    if (templates[roleKey]) {
      return normalizePermissionSet(templates[roleKey]);
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveCreatedUserId(createResp, username) {
  const payload = getPayloadObject(createResp);
  const directId = payload.id ?? payload.user_id ?? payload.userId ?? payload.uid;
  if (directId !== null && directId !== undefined && directId !== '') {
    return directId;
  }

  await fetchUsers();
  const created = users.value.find((item) => String(item.username || '').trim().toLowerCase() === String(username || '').trim().toLowerCase());
  return resolveUserId(created);
}

async function applyRoleTemplateToCreatedUser(createResp, form) {
  const roleKey = normalizeRole(form.role);
  if (!roleKey || roleKey === 'super_admin') return;

  const templatePermissions = await loadRoleTemplatePermissions(roleKey);
  if (!templatePermissions) return;

  const userId = await resolveCreatedUserId(createResp, form.username);
  if (!userId) return;

  await updateUserPermissionsApi(userId, buildPermissionRequestPayload(normalizePermissionSet(templatePermissions)));
}

function openCreate() {
  createDialog.form = {
    name: '',
    username: '',
    password: '',
    role: 'admin',
    store_id: undefined,
  };
  createDialog.visible = true;
}

async function createUser() {
  const form = createDialog.form;
  if (!form.name || !form.username || !form.password) {
    ElMessage.warning('请填写完整用户信息');
    return;
  }

  if (form.role === 'store_owner' && !form.store_id) {
    ElMessage.warning('网吧老板必须绑定网吧');
    return;
  }

  const createResp = await createUserApi(form);
  await applyRoleTemplateToCreatedUser(createResp, form).catch(() => null);
  ElMessage.success('用户创建成功');
  createDialog.visible = false;
  await fetchUsers();
}

function openEditRole(row) {
  roleDialog.userId = resolveUserId(row);
  roleDialog.role = normalizeRole(resolveRole(row)) || 'admin';
  roleDialog.store_id = resolveStoreId(row);
  roleDialog.visible = true;
}

async function saveRole() {
  const userId = roleDialog.userId;
  if (!userId) {
    ElMessage.error('无法识别用户ID');
    return;
  }

  const nextRole = normalizeRole(roleDialog.role) || 'admin';
  if (nextRole === 'store_owner' && !roleDialog.store_id) {
    ElMessage.warning('网吧老板必须绑定网吧');
    return;
  }

  await updateUserApi(userId, {
    role: nextRole,
    user_role: nextRole,
    role_key: nextRole,
    store_id: nextRole === 'store_owner' ? roleDialog.store_id : null,
  });
  ElMessage.success('角色修改成功');
  roleDialog.visible = false;
  await fetchUsers();
}

function openEditName(row) {
  nameDialog.userId = resolveUserId(row);
  nameDialog.name = row.name || '';
  nameDialog.visible = true;
}

async function saveName() {
  const nextName = String(nameDialog.name || '').trim();
  if (!nextName) {
    ElMessage.warning('请输入姓名');
    return;
  }

  await updateUserNameApi(nameDialog.userId, nextName);
  ElMessage.success('姓名修改成功');
  nameDialog.visible = false;
  await fetchUsers();
}

function openChangePassword(row) {
  pwdDialog.userId = resolveUserId(row);
  pwdDialog.password = '';
  pwdDialog.visible = true;
}

async function savePassword() {
  const nextPassword = String(pwdDialog.password || '').trim();
  if (!nextPassword) {
    ElMessage.warning('请输入新密码');
    return;
  }

  await resetPasswordApi(pwdDialog.userId, nextPassword);
  ElMessage.success('密码修改成功');
  pwdDialog.visible = false;
  await fetchUsers();
}

async function deleteUser(row) {
  if (!canDeleteUser(row)) return;

  const userId = resolveUserId(row);
  if (!userId) {
    ElMessage.error('无法识别用户ID');
    return;
  }

  await ElMessageBox.confirm(`确认删除用户「${row.name}」吗？`, '提示', { type: 'warning' });
  await deleteUserApi(userId);
  ElMessage.success('用户已删除');
  await fetchUsers();
}

async function updateStatus(row, enabled) {
  const userId = resolveUserId(row);
  if (!userId) {
    ElMessage.error('无法识别用户ID');
    return;
  }

  const targetStatus = enabled ? 'active' : 'disabled';
  try {
    await updateUserStatusApi(userId, targetStatus);
    ElMessage.success(targetStatus === 'active' ? '用户已启用' : '用户已禁用');
    await fetchUsers();
  } catch (error) {
    ElMessage.error(error?.message || '状态更新失败');
    await fetchUsers();
  }
}

function onSyncEvent(event) {
  const reason = String(event?.detail?.reason || '');
  if (['store-created', 'store-updated', 'store-deleted'].includes(reason)) {
    fetchStores().catch(() => null);
    fetchUsers().catch(() => null);
  }
}

onMounted(async () => {
  await fetchStores();
  await fetchUsers();
  onAdminSync(onSyncEvent);
});

onUnmounted(() => {
  offAdminSync(onSyncEvent);
});
</script>

<style scoped>
.users-toolbar {
  display: flex;
  justify-content: flex-end;
}

.op-cell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

:deep(.role-tag.role-super_admin) {
  color: #5a2c00;
  border-color: #ffd2ad;
  background: #fff3e7;
}

:deep(.role-tag.role-admin) {
  color: #334155;
  border-color: #d6deea;
  background: #f4f8ff;
}

:deep(.role-tag.role-store_owner) {
  color: #295f39;
  border-color: #c8e6d1;
  background: #edf9f1;
}

:deep(.role-tag.role-customer_service) {
  color: #2f5a78;
  border-color: #cde2f1;
  background: #eef7fd;
}

:deep(.role-tag.role-finance) {
  color: #684b00;
  border-color: #f0dfaf;
  background: #fff9e8;
}

@media (max-width: 768px) {
  .users-toolbar {
    justify-content: flex-start;
  }
}
</style>
