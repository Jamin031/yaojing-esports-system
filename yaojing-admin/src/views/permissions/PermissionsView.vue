<template>
  <div class="page-shell">
    <div class="page-header">
      <div>
        <p class="page-kicker">Access Control</p>
        <h2 class="page-title">权限管理</h2>
        <p class="page-subtitle">身份模板与个人微调双轨管理，保持权限联动一致性</p>
      </div>
      <div class="page-metrics">
        <div class="metric-chip">
          <span>身份模板</span>
          <strong>{{ roleTemplateRows.length }}</strong>
        </div>
        <div class="metric-chip">
          <span>可见账号</span>
          <strong>{{ displayUsers.length }}</strong>
        </div>
      </div>
    </div>

    <div class="card-surface page-toolbar mode-toolbar">
      <el-radio-group v-model="activePanel">
        <el-radio-button label="role_templates">身份默认权限模板</el-radio-button>
        <el-radio-button label="user_permissions">个人权限微调</el-radio-button>
      </el-radio-group>
      <div class="mode-tip">
        {{
          activePanel === 'role_templates'
            ? '由超级管理员统一维护各身份默认权限模板，新账号会按模板初始化。'
            : '个人权限微调基于身份默认模板，用于针对单个账号做差异化调整。'
        }}
      </div>
    </div>

    <template v-if="activePanel === 'role_templates'">
      <div class="card-surface page-table">
        <div class="section-head">
          <h3 class="section-title">身份默认权限模板</h3>
        </div>
        <el-table :data="roleTemplateRows" v-loading="loadingTemplates" stripe>
          <el-table-column label="身份" min-width="180">
            <template #default="{ row }">{{ roleText(row.role) }}</template>
          </el-table-column>
          <el-table-column label="菜单权限" min-width="160">
            <template #default="{ row }">{{ summarize(row.permissions?.menus, 'menus') }}</template>
          </el-table-column>
          <el-table-column label="页面权限" min-width="160">
            <template #default="{ row }">{{ summarize(row.permissions?.pages, 'pages') }}</template>
          </el-table-column>
          <el-table-column label="按钮权限" min-width="160">
            <template #default="{ row }">{{ summarize(row.permissions?.buttons, 'buttons') }}</template>
          </el-table-column>
          <el-table-column label="字段权限" min-width="180">
            <template #default="{ row }">{{ summarize(row.permissions?.fields, 'fields') }}</template>
          </el-table-column>
          <el-table-column label="查看级权限" min-width="180">
            <template #default="{ row }">{{ summarize(row.permissions?.views, 'views') }}</template>
          </el-table-column>
          <el-table-column label="操作" min-width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openTemplateEditor(row.role)">编辑模板</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <template v-else>
      <div class="card-surface page-toolbar">
        <el-form :inline="true" :model="filters" class="permission-filter-form">
          <el-form-item label="账号筛选">
            <el-input v-model="filters.keyword" clearable placeholder="姓名/账号关键词" style="width: 220px" />
          </el-form-item>
          <el-form-item label="角色">
            <el-select v-model="filters.role" clearable placeholder="全部角色" style="width: 180px">
              <el-option v-for="item in roleFilterOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <div class="card-surface page-table">
        <div class="section-head">
          <h3 class="section-title">个人权限微调列表</h3>
        </div>
        <el-table :data="displayUsers" v-loading="loading" stripe>
          <el-table-column prop="name" label="姓名" min-width="120" />
          <el-table-column prop="username" label="账号" min-width="140" />
          <el-table-column label="角色" min-width="120">
            <template #default="{ row }">{{ roleText(row.role) }}</template>
          </el-table-column>
          <el-table-column label="权限模式" min-width="130">
            <template #default="{ row }">
              <el-tag v-if="isSuperAdminRole(row.role)" type="danger">超管全权限</el-tag>
              <el-tag v-else type="info">模板 + 微调</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="菜单权限" min-width="160">
            <template #default="{ row }">{{ summarize(row.permissions?.menus, 'menus') }}</template>
          </el-table-column>
          <el-table-column label="页面权限" min-width="160">
            <template #default="{ row }">{{ summarize(row.permissions?.pages, 'pages') }}</template>
          </el-table-column>
          <el-table-column label="按钮权限" min-width="160">
            <template #default="{ row }">{{ summarize(row.permissions?.buttons, 'buttons') }}</template>
          </el-table-column>
          <el-table-column label="字段权限" min-width="180">
            <template #default="{ row }">{{ summarize(row.permissions?.fields, 'fields') }}</template>
          </el-table-column>
          <el-table-column label="查看级权限" min-width="180">
            <template #default="{ row }">{{ summarize(row.permissions?.views, 'views') }}</template>
          </el-table-column>
          <el-table-column label="操作" min-width="130" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openUserEditor(row)">微调权限</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <el-dialog v-model="userEditor.visible" :title="`个人权限微调 - ${userEditor.form.name || ''}`" width="900px">
      <el-alert
        v-if="isEditingSelfSuperAdmin"
        type="warning"
        :closable="false"
        show-icon
        title="当前为超级管理员自我权限编辑，核心权限项已锁定，不能取消。"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="当前账号权限 = 身份默认模板 + 个人微调。可先恢复模板，再做个人调整。"
      />

      <div class="editor-actions">
        <el-button
          v-if="!isEditingSelfSuperAdmin && hasRoleTemplate(userEditor.form.role)"
          type="primary"
          plain
          @click="applyRoleTemplateToUserEditor"
        >恢复身份默认模板</el-button>
      </div>

      <el-tabs v-model="userEditor.tab">
        <el-tab-pane label="菜单级权限" name="menus">
          <el-checkbox-group v-model="userEditor.form.permissions.menus" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.menus"
              :key="item.key"
              :label="item.key"
              :disabled="isUserPermissionLocked('menus', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="页面级权限" name="pages">
          <el-checkbox-group v-model="userEditor.form.permissions.pages" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.pages"
              :key="item.key"
              :label="item.key"
              :disabled="isUserPermissionLocked('pages', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="按钮级权限" name="buttons">
          <el-checkbox-group v-model="userEditor.form.permissions.buttons" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.buttons"
              :key="item.key"
              :label="item.key"
              :disabled="isUserPermissionLocked('buttons', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="字段级权限" name="fields">
          <el-checkbox-group v-model="userEditor.form.permissions.fields" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.fields"
              :key="item.key"
              :label="item.key"
              :disabled="isUserPermissionLocked('fields', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="查看级权限" name="views">
          <p class="view-permission-tip">查看级权限用于控制可见范围与敏感信息读取，不等同于字段编辑权限。</p>
          <el-checkbox-group v-model="userEditor.form.permissions.views" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.views"
              :key="item.key"
              :label="item.key"
              :disabled="isUserPermissionLocked('views', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="userEditor.visible = false">取消</el-button>
        <el-button v-if="!isEditingSelfSuperAdmin" type="warning" plain @click="clearUserPermissions">收回全部权限</el-button>
        <el-button type="primary" @click="saveUserPermissions">保存权限</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="templateEditor.visible"
      :title="`身份默认权限模板 - ${roleText(templateEditor.form.role)}`"
      width="900px"
    >
      <el-alert
        v-if="isTemplateSuperAdmin"
        type="warning"
        :closable="false"
        show-icon
        title="超级管理员身份模板固定为全权限，不可取消。"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="模板用于新账号默认权限，保存后可继续对个人做微调。"
      />

      <el-tabs v-model="templateEditor.tab">
        <el-tab-pane label="菜单级权限" name="menus">
          <el-checkbox-group v-model="templateEditor.form.permissions.menus" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.menus"
              :key="item.key"
              :label="item.key"
              :disabled="isTemplatePermissionLocked('menus', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="页面级权限" name="pages">
          <el-checkbox-group v-model="templateEditor.form.permissions.pages" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.pages"
              :key="item.key"
              :label="item.key"
              :disabled="isTemplatePermissionLocked('pages', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="按钮级权限" name="buttons">
          <el-checkbox-group v-model="templateEditor.form.permissions.buttons" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.buttons"
              :key="item.key"
              :label="item.key"
              :disabled="isTemplatePermissionLocked('buttons', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="字段级权限" name="fields">
          <el-checkbox-group v-model="templateEditor.form.permissions.fields" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.fields"
              :key="item.key"
              :label="item.key"
              :disabled="isTemplatePermissionLocked('fields', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>

        <el-tab-pane label="查看级权限" name="views">
          <p class="view-permission-tip">查看级权限用于控制可见范围与敏感信息读取，不等同于字段编辑权限。</p>
          <el-checkbox-group v-model="templateEditor.form.permissions.views" class="permission-grid">
            <el-checkbox
              v-for="item in schemas.views"
              :key="item.key"
              :label="item.key"
              :disabled="isTemplatePermissionLocked('views', item.key)"
            >{{ item.name }}</el-checkbox>
          </el-checkbox-group>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="templateEditor.visible = false">取消</el-button>
        <el-button v-if="!isTemplateSuperAdmin" type="warning" plain @click="clearTemplatePermissions">清空模板</el-button>
        <el-button type="primary" @click="saveTemplatePermissions">保存模板</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getPermissionSchemasApi,
  getRolePermissionTemplatesApi,
  getUsersWithPermissionsApi,
  updateRolePermissionTemplateApi,
  updateUserPermissionsApi,
} from '../../api/permissions';
import { useAuthStore } from '../../store/auth';
import { getList, getPayloadObject } from '../../utils/api';
import { emitAdminSync } from '../../utils/adminSync';
import {
  buildPermissionRequestPayload,
  clearRolePermissionTemplateCache,
  emptyPermissionSet,
  listPermissionTypes,
  normalizePermissionSet,
  normalizeRolePermissionTemplateMap,
  readRolePermissionTemplateCache,
  writeRolePermissionTemplateCache,
} from '../../utils/permissionTemplateCache';
import { DEFAULT_VIEW_PERMISSION_SCHEMAS } from '../../utils/viewPermissionKeys';

const authStore = useAuthStore();
const PERMISSION_TYPES = listPermissionTypes();
const activePanel = ref('role_templates');

const SUPER_ADMIN_CORE_PERMISSIONS = {
  menus: ['menu:dashboard', 'menu:orders', 'menu:users', 'menu:permissions', 'menu:operation_logs'],
  pages: ['dashboard:view', 'orders:view', 'users:view', 'permissions:view', 'operation_logs:view'],
  buttons: [],
  fields: [],
  views: [],
};

const ROLE_LABEL_MAP = {
  super_admin: '超级管理员',
  admin: '管理员',
  store_owner: '网吧老板',
  customer_service: '客服',
  finance: '财务',
};

const ROLE_TEMPLATE_ORDER = ['super_admin', 'admin', 'store_owner', 'customer_service', 'finance'];

const defaultSchemas = {
  menus: [
    { key: 'menu:dashboard', name: '仪表盘' },
    { key: 'menu:orders', name: '订单管理' },
    { key: 'menu:problem_orders', name: '问题订单' },
    { key: 'menu:recycle_orders', name: '回收订单' },
    { key: 'menu:online_user_orders', name: '线上用户订单' },
    { key: 'menu:store_data', name: '网吧数据' },
    { key: 'menu:stores', name: '网吧管理' },
    { key: 'menu:play_stores', name: '陪玩店维护' },
    { key: 'menu:users', name: '用户管理' },
    { key: 'menu:permissions', name: '权限管理' },
    { key: 'menu:operation_logs', name: '操作日志' },
    { key: 'menu:stats', name: '统计分析' },
  ],
  pages: [
    { key: 'dashboard:view', name: '仪表盘' },
    { key: 'orders:view', name: '订单管理' },
    { key: 'problem_orders:view', name: '问题订单' },
    { key: 'recycle_orders:view', name: '回收订单' },
    { key: 'online_user_orders:view', name: '线上用户订单' },
    { key: 'store_data:view', name: '网吧数据' },
    { key: 'stores:view', name: '网吧管理' },
    { key: 'play_stores:view', name: '陪玩店维护' },
    { key: 'page.device_management.view', name: '设备管理' },
    { key: 'users:view', name: '用户管理' },
    { key: 'permissions:view', name: '权限管理' },
    { key: 'operation_logs:view', name: '操作日志' },
    { key: 'stats:view', name: '统计分析' },
    { key: 'notifications:view', name: '消息提醒' },
  ],
  buttons: [
    { key: 'orders:create', name: '订单-新增' },
    { key: 'orders:batch_status', name: '订单-批量改状态' },
    { key: 'orders:batch_delete', name: '订单-批量删除' },
    { key: 'orders:change_status', name: '订单-改单状态' },
    { key: 'orders:edit_remark', name: '订单-编辑备注' },
    { key: 'orders:problem_save', name: '问题订单-保存修改' },
    { key: 'orders:problem_complete', name: '问题订单-订单完成' },
    { key: 'orders:problem_withdraw', name: '问题订单-撤回' },
    { key: 'orders:delete', name: '订单-删除' },
    { key: 'orders:restore', name: '订单-恢复' },
    { key: 'orders:assign_play_store', name: '订单-派单陪玩店' },
    { key: 'api.device_management.block', name: '设备管理-手动拉黑' },
    { key: 'api.device_management.unblock', name: '设备管理-解除封禁' },
    { key: 'play_store:manage', name: '陪玩店-维护' },
    { key: 'permissions:manage_users', name: '权限-个人权限管理' },
    { key: 'permissions:manage_templates', name: '权限-默认模板管理' },
  ],
  fields: [
    { key: 'orders:contact', name: '联系方式' },
    { key: 'orders:customer_nickname', name: '客户昵称' },
    { key: 'orders:info', name: '订单信息' },
    { key: 'orders:source_store', name: '来源网吧' },
    { key: 'orders:amount', name: '订单金额' },
    { key: 'orders:order_remark', name: '客户订单备注' },
    { key: 'orders:problem_remark', name: '问题订单备注' },
    { key: 'orders:store_commission', name: '网吧分成' },
    { key: 'orders:play_shop_commission', name: '陪玩店分成' },
    { key: 'orders:platform_commission', name: '曜竞分成' },
    { key: 'orders:assigned_play_shop', name: '派单陪玩店' },
    { key: 'orders:created_at', name: '下单时间' },
    { key: 'orders:status', name: '订单状态' },
    { key: 'orders:deleted_status', name: '删除状态' },
    { key: 'orders:operations', name: '操作' },
  ],
  views: DEFAULT_VIEW_PERMISSION_SCHEMAS,
};

const loading = ref(false);
const loadingTemplates = ref(false);
const users = ref([]);
const roleTemplates = ref({});
const filters = reactive({
  keyword: '',
  role: '',
});

const schemas = reactive({
  menus: [],
  pages: [],
  buttons: [],
  fields: [],
  views: [],
});

const userEditor = reactive({
  visible: false,
  tab: 'menus',
  form: {
    id: null,
    name: '',
    role: '',
    permissions: emptyPermissionSet(),
    hiddenPermissions: emptyPermissionSet(),
  },
});

const templateEditor = reactive({
  visible: false,
  tab: 'menus',
  form: {
    role: '',
    permissions: emptyPermissionSet(),
    hiddenPermissions: emptyPermissionSet(),
  },
});

const roleFilterOptions = computed(() => {
  const roleSet = new Set(users.value.map((item) => normalizeRole(item.role)).filter(Boolean));
  ROLE_TEMPLATE_ORDER.forEach((role) => roleSet.add(role));
  return Array.from(roleSet).map((role) => ({
    value: role,
    label: roleText(role),
  }));
});

const displayUsers = computed(() => {
  const keyword = String(filters.keyword || '').trim().toLowerCase();
  const role = normalizeRole(filters.role);

  return users.value.filter((item) => {
    const roleMatch = role ? normalizeRole(item.role) === role : true;
    if (!roleMatch) return false;
    if (!keyword) return true;
    const name = String(item.name || '').toLowerCase();
    const username = String(item.username || '').toLowerCase();
    return name.includes(keyword) || username.includes(keyword);
  });
});

const currentUserId = computed(() => resolveUserId(authStore.userInfo));
const isEditingSelfSuperAdmin = computed(() => isSelfSuperAdminTarget(userEditor.form.id, userEditor.form.role));
const isTemplateSuperAdmin = computed(() => isSuperAdminRole(templateEditor.form.role));

const schemaKeySetMap = computed(() => ({
  menus: new Set(schemas.menus.map((item) => item.key)),
  pages: new Set(schemas.pages.map((item) => item.key)),
  buttons: new Set(schemas.buttons.map((item) => item.key)),
  fields: new Set(schemas.fields.map((item) => item.key)),
  views: new Set(schemas.views.map((item) => item.key)),
}));

const allSchemaPermissions = computed(() => ({
  menus: schemas.menus.map((item) => item.key),
  pages: schemas.pages.map((item) => item.key),
  buttons: schemas.buttons.map((item) => item.key),
  fields: schemas.fields.map((item) => item.key),
  views: schemas.views.map((item) => item.key),
}));

const roleTemplateRows = computed(() => {
  const roleSet = new Set(ROLE_TEMPLATE_ORDER);
  users.value.forEach((user) => {
    const role = normalizeRole(user.role);
    if (role) roleSet.add(role);
  });
  Object.keys(roleTemplates.value || {}).forEach((role) => {
    const roleKey = normalizeRole(role);
    if (roleKey) roleSet.add(roleKey);
  });

  return Array.from(roleSet).map((role) => ({
    role,
    permissions: resolveRoleTemplatePermissions(role),
  }));
});

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeRole(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text) return '';
  if (['super_admin', 'super-admin', 'superadmin'].includes(text)) return 'super_admin';
  if (['store_owner', 'store-owner', 'owner'].includes(text)) return 'store_owner';
  if (['customer_service', 'customer-service', 'customer', 'service'].includes(text)) return 'customer_service';
  return text;
}

function isSuperAdminRole(role) {
  return normalizeRole(role) === 'super_admin';
}

function roleText(role) {
  const normalizedRole = normalizeRole(role);
  return ROLE_LABEL_MAP[normalizedRole] || normalizedRole || '-';
}

function resolveUserId(value) {
  if (!value || typeof value !== 'object') return '';
  const id = value.id ?? value.user_id ?? value.userId ?? value.uid ?? value.account_id ?? value.accountId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function resolveRowUserId(row) {
  if (!row || typeof row !== 'object') return null;
  const id = row.id ?? row.user_id ?? row.userId ?? row.uid;
  return id === null || id === undefined || id === '' ? null : id;
}

function uniq(list) {
  return Array.from(new Set((Array.isArray(list) ? list : []).map((item) => String(item || '').trim()).filter(Boolean)));
}

function clonePermissionSet(source = emptyPermissionSet()) {
  const normalized = normalizePermissionSet(source);
  return {
    menus: normalized.menus.slice(),
    pages: normalized.pages.slice(),
    buttons: normalized.buttons.slice(),
    fields: normalized.fields.slice(),
    views: normalized.views.slice(),
  };
}

function isSelfSuperAdminTarget(userId, role) {
  if (authStore.role !== 'super_admin') return false;
  if (!currentUserId.value) return false;
  if (!isSuperAdminRole(role)) return false;
  return String(userId || '') === currentUserId.value;
}

function buildSuperAdminFullPermissions() {
  return clonePermissionSet(allSchemaPermissions.value);
}

function enforceSuperAdminDefaults(permissions, role) {
  if (!isSuperAdminRole(role)) return clonePermissionSet(permissions);
  return buildSuperAdminFullPermissions();
}

function enforceSelfSuperAdminCore(permissions, userId, role) {
  const next = clonePermissionSet(permissions);
  if (!isSelfSuperAdminTarget(userId, role)) return next;

  return {
    menus: uniq([...next.menus, ...SUPER_ADMIN_CORE_PERMISSIONS.menus]),
    pages: uniq([...next.pages, ...SUPER_ADMIN_CORE_PERMISSIONS.pages]),
    buttons: uniq([...next.buttons, ...SUPER_ADMIN_CORE_PERMISSIONS.buttons]),
    fields: uniq([...next.fields, ...SUPER_ADMIN_CORE_PERMISSIONS.fields]),
    views: uniq([...next.views, ...SUPER_ADMIN_CORE_PERMISSIONS.views]),
  };
}

function splitVisibleAndHiddenPermissions(permissions) {
  const normalized = normalizePermissionSet(permissions);
  const visible = emptyPermissionSet();
  const hidden = emptyPermissionSet();

  PERMISSION_TYPES.forEach((type) => {
    const visibleSet = schemaKeySetMap.value[type] || new Set();
    normalized[type].forEach((key) => {
      if (visibleSet.has(key)) {
        visible[type].push(key);
      } else {
        hidden[type].push(key);
      }
    });
  });

  return {
    visible: clonePermissionSet(visible),
    hidden: clonePermissionSet(hidden),
  };
}

function mergeVisibleAndHiddenPermissions(visiblePermissions, hiddenPermissions) {
  const visible = normalizePermissionSet(visiblePermissions);
  const hidden = normalizePermissionSet(hiddenPermissions);
  return {
    menus: uniq([...visible.menus, ...hidden.menus]),
    pages: uniq([...visible.pages, ...hidden.pages]),
    buttons: uniq([...visible.buttons, ...hidden.buttons]),
    fields: uniq([...visible.fields, ...hidden.fields]),
    views: uniq([...visible.views, ...hidden.views]),
  };
}

function resolvePermissionSource(source) {
  if (!isPlainObject(source)) return source;
  return source.permissions || source.permission || source.permission_set || source.user_permissions || source.permission_data || source;
}

function hasRoleTemplate(role) {
  const roleKey = normalizeRole(role);
  if (!roleKey) return false;
  if (isSuperAdminRole(roleKey)) return true;
  return Boolean(roleTemplates.value?.[roleKey]);
}

function resolveRoleTemplatePermissions(role) {
  const roleKey = normalizeRole(role);
  if (!roleKey) return emptyPermissionSet();
  if (isSuperAdminRole(roleKey)) {
    return buildSuperAdminFullPermissions();
  }
  return clonePermissionSet(roleTemplates.value?.[roleKey] || emptyPermissionSet());
}

function summarize(list, type) {
  if (!Array.isArray(list) || !list.length) return '未设置';
  const count = uniq(list).length;
  const total = schemas[type]?.length || 0;
  if (total > 0 && count >= total) {
    return `全量（${count}项）`;
  }
  return `${count} 项`;
}

function mergeSchemaItems(primary, fallback) {
  const merged = [];
  const seen = new Set();

  [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(fallback) ? fallback : [])].forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = String(item.key || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({
      key,
      name: String(item.name || key),
    });
  });

  return merged;
}

function resolveSchemaItems(primary, fallback) {
  const remoteList = Array.isArray(primary) ? primary : [];
  if (remoteList.length) {
    return mergeSchemaItems(remoteList, []);
  }
  return mergeSchemaItems([], fallback);
}

function pickSchemaSource(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

async function refreshCurrentProfilePermissions(options = {}) {
  if (!authStore.token) return;

  const targetUserId = options.userId === null || options.userId === undefined ? '' : String(options.userId);
  const targetRole = normalizeRole(options.role);
  const currentRole = normalizeRole(authStore.role);

  const sameUser = Boolean(targetUserId && currentUserId.value && targetUserId === currentUserId.value);
  const sameRole = Boolean(targetRole && currentRole && targetRole === currentRole);

  if (!sameUser && !sameRole && options.force !== true) return;
  await authStore.fetchProfile().catch(() => null);
}

function extractRoleTemplateMap(source) {
  const payload = isPlainObject(source) ? source : {};
  const templateMap = {};

  const mergeRoleTemplateObject = (target) => {
    if (!isPlainObject(target)) return;
    const normalized = normalizeRolePermissionTemplateMap(target);
    Object.entries(normalized).forEach(([role, permissions]) => {
      const roleKey = normalizeRole(role);
      if (!roleKey) return;
      templateMap[roleKey] = clonePermissionSet(permissions);
    });
  };

  const mergeRoleTemplateList = (target) => {
    if (!Array.isArray(target)) return;
    target.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const role = normalizeRole(item.role || item.role_key || item.roleName || item.name);
      if (!role) return;
      const permissions = normalizePermissionSet(
        item.permissions || item.template || item.template_permissions || item.permission_set || item.permission || item,
      );
      templateMap[role] = clonePermissionSet(permissions);
    });
  };

  mergeRoleTemplateObject(payload.role_templates);
  mergeRoleTemplateObject(payload.roleTemplates);
  mergeRoleTemplateObject(payload.templates);
  mergeRoleTemplateObject(payload.role_permission_templates);
  mergeRoleTemplateObject(payload.default_role_permissions);

  mergeRoleTemplateList(payload.list);
  mergeRoleTemplateList(payload.rows);
  mergeRoleTemplateList(payload.items);
  mergeRoleTemplateList(payload.templates_list);

  if (!Object.keys(templateMap).length) {
    const likelyDirectMap = normalizeRolePermissionTemplateMap(payload);
    Object.entries(likelyDirectMap).forEach(([role, permissions]) => {
      const roleKey = normalizeRole(role);
      if (!roleKey) return;
      templateMap[roleKey] = clonePermissionSet(permissions);
    });
  }

  return templateMap;
}

function applyRoleTemplates(nextTemplates, options = {}) {
  const persist = options.persist !== false;
  const normalizedMap = normalizeRolePermissionTemplateMap(nextTemplates);
  normalizedMap.super_admin = buildSuperAdminFullPermissions();
  roleTemplates.value = normalizedMap;
  if (persist) {
    writeRolePermissionTemplateCache(normalizedMap);
  }
}

async function fetchSchemas() {
  const resp = await getPermissionSchemasApi().catch(() => null);
  const data = getPayloadObject(resp);

  Object.assign(schemas, {
    menus: resolveSchemaItems(pickSchemaSource(data, ['menus', 'menu_permissions', 'menus_permissions']), defaultSchemas.menus),
    pages: resolveSchemaItems(pickSchemaSource(data, ['pages', 'page_permissions', 'pages_permissions']), defaultSchemas.pages),
    buttons: resolveSchemaItems(pickSchemaSource(data, ['buttons', 'button_permissions', 'buttons_permissions']), defaultSchemas.buttons).filter(
      (item) => item.key !== 'orders:remark_edit',
    ),
    fields: resolveSchemaItems(pickSchemaSource(data, ['fields', 'field_permissions', 'fields_permissions']), defaultSchemas.fields),
    views: resolveSchemaItems(
      pickSchemaSource(data, ['scopes', 'views', 'view_scopes', 'view_permissions', 'views_permissions', 'scope_permissions', 'scopes_permissions', 'data_scope_permissions']),
      defaultSchemas.views,
    ),
  });
}

async function fetchRoleTemplates(options = {}) {
  const silentFallbackMessage = options.silentFallbackMessage === true;
  loadingTemplates.value = true;
  try {
    const resp = await getRolePermissionTemplatesApi();
    const remoteTemplates = extractRoleTemplateMap(getPayloadObject(resp));
    applyRoleTemplates(remoteTemplates, { persist: true });
    return true;
  } catch {
    const localCache = readRolePermissionTemplateCache();
    if (Object.keys(localCache).length) {
      applyRoleTemplates(localCache, { persist: false });
      if (!silentFallbackMessage) {
        ElMessage.warning('权限模板接口暂不可用，当前仅临时展示本地短期缓存数据');
      }
      return false;
    }

    clearRolePermissionTemplateCache();
    applyRoleTemplates({}, { persist: false });
    return false;
  } finally {
    loadingTemplates.value = false;
  }
}

function mergeRoleTemplateObject(base, patch) {
  const nextBase = normalizeRolePermissionTemplateMap(base || {});
  const nextPatch = normalizeRolePermissionTemplateMap(patch || {});
  const merged = { ...nextBase };

  Object.entries(nextPatch).forEach(([role, permissions]) => {
    const roleKey = normalizeRole(role);
    if (!roleKey) return;
    merged[roleKey] = clonePermissionSet(permissions);
  });

  return merged;
}

async function fetchUsers() {
  loading.value = true;
  try {
    const resp = await getUsersWithPermissionsApi();
    const payload = getPayloadObject(resp);
    const templatesFromUsersResp = extractRoleTemplateMap(payload);
    if (Object.keys(templatesFromUsersResp).length) {
      applyRoleTemplates(mergeRoleTemplateObject(roleTemplates.value, templatesFromUsersResp), { persist: true });
    }

    users.value = getList(resp).map((item) => {
      const role = normalizeRole(item.role || item.user_role || item.role_key);
      const permissions = enforceSuperAdminDefaults(normalizePermissionSet(resolvePermissionSource(item)), role);
      return {
        ...item,
        id: resolveRowUserId(item),
        role,
        permissions,
      };
    });
  } finally {
    loading.value = false;
  }
}

function openUserEditor(row) {
  const userId = resolveRowUserId(row);
  const role = normalizeRole(row.role || row.user_role || row.role_key);

  const roleAdjusted = enforceSuperAdminDefaults(normalizePermissionSet(row.permissions || row), role);
  const selfCoreMerged = enforceSelfSuperAdminCore(roleAdjusted, userId, role);
  const split = splitVisibleAndHiddenPermissions(selfCoreMerged);

  userEditor.form = {
    id: userId,
    name: row.name,
    role,
    permissions: split.visible,
    hiddenPermissions: split.hidden,
  };
  userEditor.tab = 'menus';
  userEditor.visible = true;
}

function isUserPermissionLocked(type, key) {
  if (!isEditingSelfSuperAdmin.value || !key) return false;
  const list = SUPER_ADMIN_CORE_PERMISSIONS[type] || [];
  return list.includes(key);
}

function clearUserPermissions() {
  if (isEditingSelfSuperAdmin.value) return;
  userEditor.form.permissions = emptyPermissionSet();
  userEditor.form.hiddenPermissions = emptyPermissionSet();
}

function applyRoleTemplateToUserEditor() {
  if (!hasRoleTemplate(userEditor.form.role)) return;
  const rolePermissions = resolveRoleTemplatePermissions(userEditor.form.role);
  const selfCoreMerged = enforceSelfSuperAdminCore(rolePermissions, userEditor.form.id, userEditor.form.role);
  const split = splitVisibleAndHiddenPermissions(selfCoreMerged);
  userEditor.form.permissions = split.visible;
  userEditor.form.hiddenPermissions = split.hidden;
}

async function saveUserPermissions() {
  const userId = userEditor.form.id;
  const role = normalizeRole(userEditor.form.role);
  if (userId === null || userId === undefined || userId === '') {
    ElMessage.error('无法识别用户ID');
    return;
  }

  let visiblePermissions = normalizePermissionSet(userEditor.form.permissions);
  visiblePermissions = enforceSuperAdminDefaults(visiblePermissions, role);
  visiblePermissions = enforceSelfSuperAdminCore(visiblePermissions, userId, role);

  const payloadPermissions = mergeVisibleAndHiddenPermissions(visiblePermissions, userEditor.form.hiddenPermissions);
  const requestPayload = buildPermissionRequestPayload(payloadPermissions);

  await updateUserPermissionsApi(userId, requestPayload);
  await refreshCurrentProfilePermissions({ userId });

  emitAdminSync('permissions-updated', { user_id: String(userId || '') });
  ElMessage.success('个人权限更新成功');
  userEditor.visible = false;
  await fetchUsers();
}

function openTemplateEditor(role) {
  const roleKey = normalizeRole(role);
  const rolePermissions = resolveRoleTemplatePermissions(roleKey);
  const split = splitVisibleAndHiddenPermissions(rolePermissions);

  templateEditor.form = {
    role: roleKey,
    permissions: split.visible,
    hiddenPermissions: split.hidden,
  };
  templateEditor.tab = 'menus';
  templateEditor.visible = true;
}

function isTemplatePermissionLocked(_type, _key) {
  return isTemplateSuperAdmin.value;
}

function clearTemplatePermissions() {
  if (isTemplateSuperAdmin.value) return;
  templateEditor.form.permissions = emptyPermissionSet();
  templateEditor.form.hiddenPermissions = emptyPermissionSet();
}

async function saveTemplatePermissions() {
  const role = normalizeRole(templateEditor.form.role);
  if (!role) {
    ElMessage.error('无法识别身份模板');
    return;
  }

  let visiblePermissions = normalizePermissionSet(templateEditor.form.permissions);
  visiblePermissions = enforceSuperAdminDefaults(visiblePermissions, role);

  let payloadPermissions = mergeVisibleAndHiddenPermissions(visiblePermissions, templateEditor.form.hiddenPermissions);
  payloadPermissions = enforceSuperAdminDefaults(payloadPermissions, role);
  const requestPayload = buildPermissionRequestPayload(payloadPermissions);

  let saveResp = null;
  try {
    saveResp = await updateRolePermissionTemplateApi(role, {
      role,
      ...requestPayload,
    });
  } catch {
    ElMessage.error('身份默认权限模板保存失败，后端未保存');
    return;
  }

  const remoteUpdatedTemplates = extractRoleTemplateMap(getPayloadObject(saveResp));
  if (remoteUpdatedTemplates[role]) {
    applyRoleTemplates(mergeRoleTemplateObject(roleTemplates.value, remoteUpdatedTemplates), { persist: true });
  } else {
    applyRoleTemplates(
      {
        ...roleTemplates.value,
        [role]: payloadPermissions,
      },
      { persist: true },
    );
  }

  await fetchRoleTemplates({ silentFallbackMessage: true });
  await refreshCurrentProfilePermissions({ role });
  await fetchUsers();
  emitAdminSync('permission-template-updated', { role });
  ElMessage.success('身份默认权限模板已保存');
  templateEditor.visible = false;
}

onMounted(async () => {
  await fetchSchemas();
  await fetchRoleTemplates();
  await fetchUsers();
});
</script>

<style scoped>
.mode-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.mode-tip {
  color: var(--text-secondary);
  font-size: 13px;
  max-width: 520px;
  line-height: 1.55;
}

.permission-filter-form {
  width: 100%;
}

:deep(.el-radio-group) {
  border-radius: 11px;
  overflow: hidden;
}

:deep(.el-radio-button__inner) {
  min-width: 140px;
}

:deep(.el-tabs__item) {
  font-weight: 560;
}

.editor-actions {
  margin: 12px 0 4px;
}

.view-permission-tip {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 8px;
  min-height: 180px;
}

:deep(.permission-grid .el-checkbox) {
  margin-right: 0;
  width: 100%;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid #e7eaf0;
  background: #fbfcfd;
}

:deep(.permission-grid .el-checkbox.is-checked) {
  border-color: #ffd2ad;
  background: #fff7ef;
}

@media (max-width: 900px) {
  .mode-tip {
    max-width: 100%;
  }

  .permission-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
