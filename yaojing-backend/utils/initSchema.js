const { query } = require('../config/db');
const {
  ROLE_DEFAULTS,
  VIEW_SCOPE_KEYS,
  getBuiltInRoleDefaultUiPermissions,
  normalizeUiPermissions,
  setRoleTemplateOverrides,
} = require('./permissionMatrix');

const DEFAULT_PLATFORM_RATE = Number(process.env.DEFAULT_PLATFORM_RATE || 0.05);
const DEFAULT_ONLINE_STORE_NAME = process.env.DEFAULT_ONLINE_STORE_NAME || 'Online Store';
const ROLE_TEMPLATE_PERMISSION_BACKFILL = Object.freeze({
  admin: {
    fields: ['orders:customer_nickname', 'orders:order_remark'],
    buttons: ['orders:edit_remark'],
    scopes: Object.values(VIEW_SCOPE_KEYS),
  },
  store_owner: {
    fields: ['orders:customer_nickname'],
    scopes: [
      VIEW_SCOPE_KEYS.ORDERS_SELF_STORE,
      VIEW_SCOPE_KEYS.STATS_SELF_STORE,
      VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
      VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
      VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
      VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
    ],
  },
  customer_service: {
    fields: ['orders:customer_nickname', 'orders:order_remark'],
    buttons: ['orders:edit_remark'],
    scopes: [
      VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
      VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
    ],
  },
  finance: {
    fields: ['orders:customer_nickname', 'orders:order_remark'],
    scopes: [
      VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
      VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
      VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
      VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
    ],
  },
});


function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function appendUnique(list = [], additions = []) {
  const next = Array.isArray(list) ? [...list] : [];
  const existing = new Set(next.map((item) => String(item || '').trim()).filter(Boolean));
  additions.forEach((item) => {
    const key = String(item || '').trim();
    if (!key || existing.has(key)) {
      return;
    }
    next.push(key);
    existing.add(key);
  });
  return next;
}

async function safeQuery(sql, params = {}) {
  try {
    await query(sql, params);
  } catch (error) {
    if (
      error.code === 'ER_DUP_FIELDNAME' ||
      error.code === 'ER_DUP_KEYNAME' ||
      error.code === 'ER_FK_INCOMPATIBLE_COLUMNS' ||
      error.code === 'ER_CANNOT_ADD_FOREIGN' ||
      error.code === 'ER_FK_DUP_NAME' ||
      error.code === 'ER_DUP_ENTRY' ||
      error.errno === 3780
    ) {
      return;
    }
    throw error;
  }
}

async function columnExists(tableName, columnName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = :table_name
       AND column_name = :column_name`,
    {
      table_name: tableName,
      column_name: columnName,
    }
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function constraintExists(tableName, constraintName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE()
       AND table_name = :table_name
       AND constraint_name = :constraint_name`,
    {
      table_name: tableName,
      constraint_name: constraintName,
    }
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function ensureStoresTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS stores (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      store_key VARCHAR(80) NULL,
      subdomain VARCHAR(80) NULL,
      domain_prefix VARCHAR(80) NULL,
      commission_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_stores_store_key (store_key),
      UNIQUE KEY uk_stores_subdomain (subdomain),
      UNIQUE KEY uk_stores_domain_prefix (domain_prefix)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE stores ADD COLUMN store_key VARCHAR(80) NULL`);
  await safeQuery(`ALTER TABLE stores ADD COLUMN subdomain VARCHAR(80) NULL`);
  await safeQuery(`ALTER TABLE stores ADD COLUMN domain_prefix VARCHAR(80) NULL`);
  await safeQuery(`ALTER TABLE stores ADD UNIQUE KEY uk_stores_store_key (store_key)`);
  await safeQuery(`ALTER TABLE stores ADD UNIQUE KEY uk_stores_subdomain (subdomain)`);
  await safeQuery(`ALTER TABLE stores ADD UNIQUE KEY uk_stores_domain_prefix (domain_prefix)`);
  await safeQuery(`UPDATE stores SET domain_prefix = subdomain WHERE (domain_prefix IS NULL OR domain_prefix = '') AND subdomain IS NOT NULL`);
  await safeQuery(`UPDATE stores SET store_key = LOWER(domain_prefix) WHERE (store_key IS NULL OR store_key = '') AND domain_prefix IS NOT NULL AND domain_prefix <> ''`);
  await safeQuery(`UPDATE stores SET store_key = LOWER(subdomain) WHERE (store_key IS NULL OR store_key = '') AND subdomain IS NOT NULL AND subdomain <> ''`);
}

async function ensurePlayShopsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS play_shops (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      commission_rate DECIMAL(6,4) NOT NULL DEFAULT 0.9000,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_play_shops_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE play_shops ADD COLUMN commission_rate DECIMAL(6,4) NOT NULL DEFAULT 0.9000`);
  await safeQuery(`ALTER TABLE play_shops ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0`);
}

async function ensureUsersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(80) NOT NULL,
      role ENUM('super_admin', 'admin', 'store_owner', 'customer_service', 'finance') NOT NULL,
      store_id BIGINT UNSIGNED NULL,
      admin_permissions JSON NULL,
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_users_username (username),
      KEY idx_users_role (role),
      KEY idx_users_store_id (store_id),
      KEY idx_users_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE users ADD COLUMN store_id BIGINT UNSIGNED NULL`);
  await safeQuery(`ALTER TABLE users ADD COLUMN admin_permissions JSON NULL`);
  await safeQuery(`ALTER TABLE users ADD COLUMN status ENUM('active', 'disabled') NOT NULL DEFAULT 'active'`);
  await safeQuery(`ALTER TABLE users ADD KEY idx_users_status (status)`);
  await safeQuery(`UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''`);

  if (!(await constraintExists('users', 'fk_users_store'))) {
    await safeQuery(`ALTER TABLE users ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id)`);
  }
}

async function ensureOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_no VARCHAR(40) NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      contact VARCHAR(120) NOT NULL,
      customer_contact VARCHAR(120) NULL,
      customer_nickname VARCHAR(80) NULL,
      order_info VARCHAR(255) NOT NULL,
      order_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      status ENUM('pending_contact', 'processing', 'problem', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_contact',
      store_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
      store_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      platform_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
      platform_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      shop_id BIGINT UNSIGNED NULL,
      shop_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
      shop_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      play_shop_id BIGINT UNSIGNED NULL,
      play_shop_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
      play_shop_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      store_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      platform_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      play_shop_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      revised_amount DECIMAL(12,2) NULL,
      order_remark VARCHAR(500) NULL,
      problem_remark VARCHAR(500) NULL,
      west_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
      is_effective TINYINT(1) NOT NULL DEFAULT 0,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      confirmed_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_orders_order_no (order_no),
      KEY idx_orders_store_status (store_id, status),
      KEY idx_orders_created_at (created_at),
      KEY idx_orders_status_created (status, created_at),
      KEY idx_orders_shop_id (shop_id),
      KEY idx_orders_play_shop_id (play_shop_id),
      KEY idx_orders_deleted_created (is_deleted, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE orders ADD COLUMN store_commission DECIMAL(12,2) NOT NULL DEFAULT 0`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN platform_commission DECIMAL(12,2) NOT NULL DEFAULT 0`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN play_shop_commission DECIMAL(12,2) NOT NULL DEFAULT 0`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN customer_contact VARCHAR(120) NULL`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN customer_nickname VARCHAR(80) NULL`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN revised_amount DECIMAL(12,2) NULL`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN order_remark VARCHAR(500) NULL`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN problem_remark VARCHAR(500) NULL`);
  await safeQuery(`ALTER TABLE orders ADD COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0`);
  await safeQuery(`ALTER TABLE orders MODIFY COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0`);
  await safeQuery(`ALTER TABLE orders ADD KEY idx_orders_play_shop_id (play_shop_id)`);

  await safeQuery(`UPDATE orders SET order_no = CONCAT('LEGACY', id) WHERE order_no IS NULL OR order_no = ''`);
  await safeQuery(`UPDATE orders SET status = 'pending_contact' WHERE status IN ('pending', 'confirmed')`);
  await safeQuery(
    `ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'pending_contact', 'processing', 'problem', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_contact'`
  );
  await safeQuery(
    `ALTER TABLE orders MODIFY COLUMN status ENUM('pending_contact', 'processing', 'problem', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_contact'`
  );

  await safeQuery(`UPDATE orders SET shop_id = play_shop_id WHERE shop_id IS NULL AND play_shop_id IS NOT NULL`);
  await safeQuery(`UPDATE orders SET play_shop_id = shop_id WHERE play_shop_id IS NULL AND shop_id IS NOT NULL`);
  await safeQuery(`UPDATE orders SET shop_rate = play_shop_rate WHERE shop_rate = 0 AND play_shop_rate IS NOT NULL`);
  await safeQuery(`UPDATE orders SET play_shop_rate = shop_rate WHERE play_shop_rate = 0 AND shop_rate IS NOT NULL`);
  await safeQuery(`UPDATE orders SET shop_share = play_shop_share WHERE shop_share = 0 AND play_shop_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET play_shop_share = shop_share WHERE play_shop_share = 0 AND shop_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET contact = customer_contact WHERE (contact IS NULL OR contact = '') AND customer_contact IS NOT NULL`);
  await safeQuery(`UPDATE orders SET customer_contact = contact WHERE (customer_contact IS NULL OR customer_contact = '') AND contact IS NOT NULL`);
  await safeQuery(`UPDATE orders SET store_commission = store_share WHERE store_commission = 0 AND store_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET platform_commission = platform_share WHERE platform_commission = 0 AND platform_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET play_shop_commission = play_shop_share WHERE play_shop_commission = 0 AND play_shop_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET platform_share = west_share WHERE platform_share = 0 AND west_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET west_share = platform_share WHERE west_share = 0 AND platform_share IS NOT NULL`);
  await safeQuery(`UPDATE orders SET platform_rate = ${DEFAULT_PLATFORM_RATE.toFixed(4)} WHERE platform_rate IS NULL OR platform_rate = 0`);
  await safeQuery(`UPDATE orders SET is_anonymous = 0 WHERE is_anonymous IS NULL`);
  await safeQuery(`UPDATE orders SET is_effective = 1 WHERE status = 'completed'`);

  if (!(await constraintExists('orders', 'fk_orders_store'))) {
    await safeQuery(`ALTER TABLE orders ADD CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores(id)`);
  }
  if (!(await constraintExists('orders', 'fk_orders_shop'))) {
    await safeQuery(`ALTER TABLE orders ADD CONSTRAINT fk_orders_shop FOREIGN KEY (shop_id) REFERENCES play_shops(id)`);
  }
  if (!(await constraintExists('orders', 'fk_orders_play_shop'))) {
    await safeQuery(`ALTER TABLE orders ADD CONSTRAINT fk_orders_play_shop FOREIGN KEY (play_shop_id) REFERENCES play_shops(id)`);
  }
}

async function ensureProblemOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS problem_orders (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      order_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      revised_amount DECIMAL(12,2) NULL,
      status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
      reason VARCHAR(255) NOT NULL DEFAULT '',
      problem_remark VARCHAR(500) NULL,
      reported_by BIGINT UNSIGNED NULL,
      resolved_by BIGINT UNSIGNED NULL,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_problem_orders_order_id (order_id),
      KEY idx_problem_orders_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE problem_orders ADD COLUMN revised_amount DECIMAL(12,2) NULL`);
  await safeQuery(`ALTER TABLE problem_orders ADD COLUMN problem_remark VARCHAR(500) NULL`);
  if (await columnExists('problem_orders', 'remark')) {
    await safeQuery(`UPDATE problem_orders SET reason = remark WHERE (reason = '' OR reason IS NULL) AND remark IS NOT NULL`);
  }
  await safeQuery(`UPDATE problem_orders SET problem_remark = reason WHERE (problem_remark IS NULL OR problem_remark = '') AND reason IS NOT NULL`);
}

async function ensureOrderLimitsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS order_limits (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NULL,
      ip VARCHAR(64) NOT NULL,
      device_id VARCHAR(120) NULL,
      browser VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_order_limits_ip_created (ip, created_at),
      KEY idx_order_limits_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureOperationLogsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      operator_user_id BIGINT UNSIGNED NULL,
      operator_role VARCHAR(50) NOT NULL DEFAULT '',
      action_code VARCHAR(120) NULL,
      action VARCHAR(80) NOT NULL,
      content VARCHAR(500) NOT NULL,
      ip VARCHAR(64) NOT NULL DEFAULT '',
      target_type VARCHAR(40) NULL,
      target_id VARCHAR(80) NULL,
      before_json JSON NULL,
      after_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_operation_logs_user_created (operator_user_id, created_at),
      KEY idx_operation_logs_action_created (action, created_at),
      KEY idx_operation_logs_action_code_created (action_code, created_at),
      KEY idx_operation_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE operation_logs ADD COLUMN action_code VARCHAR(120) NULL`);
  await safeQuery(`ALTER TABLE operation_logs ADD COLUMN before_json JSON NULL`);
  await safeQuery(`ALTER TABLE operation_logs ADD COLUMN after_json JSON NULL`);
  await safeQuery(`ALTER TABLE operation_logs ADD KEY idx_operation_logs_action_code_created (action_code, created_at)`);
}

async function ensureRecycleOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS recycle_orders (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      snapshot_json JSON NOT NULL,
      recycled_by BIGINT UNSIGNED NULL,
      recycled_ip VARCHAR(64) NOT NULL DEFAULT '',
      recycled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_restored TINYINT(1) NOT NULL DEFAULT 0,
      restored_by BIGINT UNSIGNED NULL,
      restored_at TIMESTAMP NULL DEFAULT NULL,
      KEY idx_recycle_orders_order (order_id),
      KEY idx_recycle_orders_restored (is_restored, recycled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureOrdersHourStatsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS orders_hour_stats (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      stat_date DATE NOT NULL,
      stat_hour TINYINT UNSIGNED NOT NULL,
      total_orders INT NOT NULL DEFAULT 0,
      total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      completed_orders INT NOT NULL DEFAULT 0,
      completed_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_orders_hour_stats_date_hour (stat_date, stat_hour),
      KEY idx_orders_hour_stats_amount (completed_amount),
      KEY idx_orders_hour_stats_date (stat_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureOnlineUsersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS online_users (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      store_id BIGINT UNSIGNED NULL,
      nickname VARCHAR(80) NOT NULL,
      game_name VARCHAR(80) NOT NULL DEFAULT '',
      status ENUM('online', 'offline') NOT NULL DEFAULT 'online',
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_online_users_store (store_id),
      KEY idx_online_users_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureOnlineOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS online_orders (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      order_no VARCHAR(40) NOT NULL,
      store_id BIGINT UNSIGNED NOT NULL,
      contact VARCHAR(120) NOT NULL,
      order_info VARCHAR(255) NOT NULL,
      order_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      status ENUM('pending_contact', 'processing', 'problem', 'completed', 'cancelled') NOT NULL DEFAULT 'completed',
      platform_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
      platform_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_online_orders_order_no (order_no),
      KEY idx_online_orders_status_created (status, created_at),
      KEY idx_online_orders_store_created (store_id, created_at),
      KEY idx_online_orders_deleted_created (is_deleted, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`UPDATE online_orders SET status = 'pending_contact' WHERE status = 'pending'`);
  await safeQuery(
    `ALTER TABLE online_orders MODIFY COLUMN status ENUM('pending', 'pending_contact', 'processing', 'problem', 'completed', 'cancelled') NOT NULL DEFAULT 'completed'`
  );
  await safeQuery(
    `ALTER TABLE online_orders MODIFY COLUMN status ENUM('pending_contact', 'processing', 'problem', 'completed', 'cancelled') NOT NULL DEFAULT 'completed'`
  );

  if (!(await constraintExists('online_orders', 'fk_online_orders_store'))) {
    await safeQuery(`ALTER TABLE online_orders ADD CONSTRAINT fk_online_orders_store FOREIGN KEY (store_id) REFERENCES stores(id)`);
  }
}

async function ensureNotificationsTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      type VARCHAR(40) NOT NULL DEFAULT 'order_created',
      title VARCHAR(120) NOT NULL,
      content VARCHAR(500) NOT NULL DEFAULT '',
      order_id BIGINT UNSIGNED NULL,
      store_id BIGINT UNSIGNED NULL,
      source_store_name VARCHAR(120) NULL,
      source_contact VARCHAR(120) NULL,
      source_order_info VARCHAR(255) NULL,
      source_amount DECIMAL(12,2) NULL,
      source_order_time DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notifications_created (created_at),
      KEY idx_notifications_store_created (store_id, created_at),
      KEY idx_notifications_source_time (source_order_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE notifications ADD COLUMN source_store_name VARCHAR(120) NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN source_contact VARCHAR(120) NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN source_order_info VARCHAR(255) NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN source_amount DECIMAL(12,2) NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN source_order_time DATETIME NULL`);
  await safeQuery(`ALTER TABLE notifications ADD KEY idx_notifications_source_time (source_order_time)`);

  await query(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id BIGINT UNSIGNED NOT NULL,
      order_id BIGINT UNSIGNED NOT NULL,
      notification_id BIGINT UNSIGNED NULL,
      read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, order_id),
      KEY idx_notification_reads_user_read (user_id, read_at),
      KEY idx_notification_reads_order (order_id),
      KEY idx_notification_reads_notification (notification_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`ALTER TABLE notification_reads ADD COLUMN order_id BIGINT UNSIGNED NULL`);
  await safeQuery(`ALTER TABLE notification_reads ADD COLUMN notification_id BIGINT UNSIGNED NULL`);
  await safeQuery(`ALTER TABLE notification_reads ADD KEY idx_notification_reads_user_read (user_id, read_at)`);
  await safeQuery(`ALTER TABLE notification_reads ADD KEY idx_notification_reads_order (order_id)`);
  await safeQuery(`ALTER TABLE notification_reads ADD KEY idx_notification_reads_notification (notification_id)`);
  await safeQuery(
    `UPDATE notification_reads nr
     LEFT JOIN notifications n ON n.id = nr.notification_id
     SET nr.order_id = COALESCE(n.order_id, nr.notification_id)
     WHERE nr.order_id IS NULL`
  );
  await safeQuery(
    `DELETE nr_dup
     FROM notification_reads nr_dup
     JOIN notification_reads nr_keep
       ON nr_dup.user_id = nr_keep.user_id
      AND nr_dup.order_id = nr_keep.order_id
      AND nr_dup.order_id IS NOT NULL
      AND nr_dup.notification_id > nr_keep.notification_id`
  );
  await safeQuery(`ALTER TABLE notification_reads ADD UNIQUE KEY uk_notification_reads_user_order (user_id, order_id)`);
}

async function ensureRBACSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_roles_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(120) NOT NULL,
      name VARCHAR(120) NOT NULL,
      scope_type ENUM('page', 'button', 'field', 'api') NOT NULL,
      resource VARCHAR(80) NOT NULL,
      action VARCHAR(80) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_permissions_code (code),
      KEY idx_permissions_scope (scope_type, resource)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id BIGINT UNSIGNED NOT NULL,
      permission_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (role_id, permission_id),
      KEY idx_role_permissions_role (role_id),
      KEY idx_role_permissions_permission (permission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_id),
      KEY idx_user_roles_user (user_id),
      KEY idx_user_roles_role (role_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureRolePermissionTemplatesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS role_permission_templates (
      role_code VARCHAR(50) NOT NULL,
      permissions_json JSON NOT NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role_code),
      KEY idx_role_permission_templates_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function seedRBACData() {
  await query(
    `INSERT IGNORE INTO roles (code, name, description) VALUES
    ('super_admin', 'Super Admin', 'Global owner permissions'),
    ('admin', 'Admin', 'Operation and order permissions'),
    ('store_owner', 'Store Owner', 'Read only own completed orders'),
    ('customer_service', 'Customer Service', 'Order and notification read permissions'),
    ('finance', 'Finance', 'Revenue and logs permissions')`
  );

  await query(
    `INSERT IGNORE INTO permissions (code, name, scope_type, resource, action) VALUES
    ('api.orders.read', 'Read orders', 'api', 'orders', 'read'),
    ('api.orders.create', 'Create orders', 'api', 'orders', 'create'),
    ('api.orders.update_status', 'Update order status', 'api', 'orders', 'update_status'),
    ('api.orders.update_problem', 'Update problem order', 'api', 'orders', 'update_problem'),
    ('api.orders.assign_play_shop', 'Assign play shop', 'api', 'orders', 'assign_play_shop'),
    ('api.orders.delete', 'Delete order', 'api', 'orders', 'delete'),
    ('api.orders.restore', 'Restore order', 'api', 'orders', 'restore'),
    ('api.stats.overview', 'Stats overview', 'api', 'stats', 'overview'),
    ('api.stats.peak_hours', 'Stats peak hours', 'api', 'stats', 'peak_hours'),
    ('api.stats.store_ranking', 'Stats store ranking', 'api', 'stats', 'store_ranking'),
    ('api.stats.online_vs_offline', 'Stats online vs offline', 'api', 'stats', 'online_vs_offline'),
    ('api.logs.read', 'Read logs', 'api', 'logs', 'read'),
    ('api.notifications.read', 'Read notifications', 'api', 'notifications', 'read'),
    ('api.notifications.read_all', 'Mark notifications read', 'api', 'notifications', 'read_all'),
    ('api.users.manage', 'Manage users', 'api', 'users', 'manage'),
    ('api.stores.manage', 'Manage stores', 'api', 'stores', 'manage'),
    ('api.play_shops.manage', 'Manage play shops', 'api', 'play_shops', 'manage'),
    ('api.online_orders.read', 'Read online orders', 'api', 'online_orders', 'read'),
    ('api.online_orders.create', 'Create online orders', 'api', 'online_orders', 'create')`
  );

  const roles = await query(`SELECT id, code FROM roles`);
  const permissions = await query(`SELECT id, code FROM permissions`);
  const roleIdMap = Object.fromEntries(roles.map((item) => [item.code, Number(item.id)]));
  const permissionIdMap = Object.fromEntries(permissions.map((item) => [item.code, Number(item.id)]));
  const allPermissionCodes = Object.keys(permissionIdMap);

  const grants = {
    super_admin: allPermissionCodes,
    admin: [
      'api.orders.read',
      'api.orders.create',
      'api.orders.update_status',
      'api.orders.update_problem',
      'api.orders.assign_play_shop',
      'api.stats.overview',
      'api.stats.peak_hours',
      'api.stats.store_ranking',
      'api.stats.online_vs_offline',
      'api.notifications.read',
      'api.notifications.read_all',
      'api.online_orders.read',
      'api.logs.read',
    ],
    store_owner: ['api.orders.read', 'api.stats.overview', 'api.stats.peak_hours', 'api.notifications.read'],
    customer_service: [
      'api.orders.read',
      'api.orders.create',
      'api.notifications.read',
      'api.notifications.read_all',
      'api.online_orders.create',
    ],
    finance: [
      'api.orders.read',
      'api.stats.overview',
      'api.stats.peak_hours',
      'api.stats.store_ranking',
      'api.stats.online_vs_offline',
      'api.logs.read',
      'api.online_orders.read',
    ],
  };

  for (const [roleCode, permissionCodes] of Object.entries(grants)) {
    const roleId = roleIdMap[roleCode];
    if (!roleId) {
      continue;
    }

    for (const code of permissionCodes) {
      const permissionId = permissionIdMap[code];
      if (!permissionId) {
        continue;
      }

      await query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         VALUES (:role_id, :permission_id)`,
        {
          role_id: roleId,
          permission_id: permissionId,
        }
      );
    }
  }
}

async function seedRolePermissionTemplates() {
  const roleCodes = Object.keys(ROLE_DEFAULTS);
  for (const roleCode of roleCodes) {
    const builtInTemplate = normalizeUiPermissions(
      getBuiltInRoleDefaultUiPermissions(roleCode)
    );
    if (roleCode === 'super_admin') {
      await query(
        `INSERT INTO role_permission_templates (role_code, permissions_json)
         VALUES (:role_code, :permissions_json)
         ON DUPLICATE KEY UPDATE
           permissions_json = VALUES(permissions_json),
           updated_at = CURRENT_TIMESTAMP`,
        {
          role_code: roleCode,
          permissions_json: JSON.stringify(builtInTemplate),
        }
      );
      continue;
    }

    await query(
      `INSERT IGNORE INTO role_permission_templates (role_code, permissions_json)
       VALUES (:role_code, :permissions_json)`,
      {
        role_code: roleCode,
        permissions_json: JSON.stringify(builtInTemplate),
      }
    );
  }
}

async function backfillRoleTemplatePermissionKeys() {
  const rows = await query(
    `SELECT role_code, permissions_json
     FROM role_permission_templates`
  );

  for (const row of rows) {
    const roleCode = String(row.role_code || '').trim();
    if (!roleCode || !ROLE_TEMPLATE_PERMISSION_BACKFILL[roleCode]) {
      continue;
    }

    const builtInTemplate = normalizeUiPermissions(getBuiltInRoleDefaultUiPermissions(roleCode));
    const current = normalizeUiPermissions(parseJson(row.permissions_json, {}), builtInTemplate);
    const next = {
      menus: [...current.menus],
      pages: [...current.pages],
      buttons: [...current.buttons],
      fields: [...current.fields],
      scopes: [...(Array.isArray(current.scopes) ? current.scopes : [])],
    };

    let changed = false;
    const additions = ROLE_TEMPLATE_PERMISSION_BACKFILL[roleCode];
    Object.entries(additions).forEach(([scope, keys]) => {
      if (!Array.isArray(next[scope])) {
        return;
      }
      const merged = appendUnique(next[scope], keys);
      if (merged.length !== next[scope].length) {
        next[scope] = merged;
        changed = true;
      }
    });

    if (!changed) {
      continue;
    }

    await query(
      `UPDATE role_permission_templates
       SET permissions_json = :permissions_json,
           updated_at = CURRENT_TIMESTAMP
       WHERE role_code = :role_code`,
      {
        role_code: roleCode,
        permissions_json: JSON.stringify(next),
      }
    );
  }
}

function stripStoreOwnerOrderRemarkFromPermissionObject(value) {
  return {
    changed: false,
    value: value,
  };
}

async function enforceStoreOwnerOrderRemarkRestriction() {
  return;
}

async function loadRolePermissionTemplatesToRuntime() {
  const rows = await query(
    `SELECT role_code, permissions_json
     FROM role_permission_templates`
  );

  const templates = {};
  rows.forEach((row) => {
    const roleCode = String(row.role_code || '').trim();
    if (!roleCode) {
      return;
    }
    const fallback = getBuiltInRoleDefaultUiPermissions(roleCode);
    const permissions =
      roleCode === 'super_admin'
        ? normalizeUiPermissions(fallback, fallback)
        : normalizeUiPermissions(parseJson(row.permissions_json, {}), fallback);
    templates[roleCode] = permissions;
  });

  setRoleTemplateOverrides(templates);
}

async function seedBaseData() {
  await query(
    `INSERT IGNORE INTO stores (id, name, store_key, subdomain, domain_prefix, commission_rate) VALUES
    (1, 'Store-1', 'yishiguang', 'yishiguang', 'yishiguang', 0.0500),
    (2, 'Store-2', 'shuguang', 'shuguang', 'shuguang', 0.0400),
    (3, 'Store-3', 'xinghe', 'xinghe', 'xinghe', 0.0300)`
  );
  await query(
    `INSERT IGNORE INTO stores (name, store_key, subdomain, domain_prefix, commission_rate)
     VALUES (:name, 'online', 'online', 'online', 0.0000)`,
    { name: DEFAULT_ONLINE_STORE_NAME }
  );
  await query(
    `UPDATE stores
     SET name = :new_name,
         updated_at = CURRENT_TIMESTAMP
     WHERE (
       LOWER(COALESCE(domain_prefix, '')) = 'online'
       OR LOWER(COALESCE(subdomain, '')) = 'online'
     )
       AND BINARY COALESCE(name, '') <> BINARY :new_name`,
    {
      new_name: DEFAULT_ONLINE_STORE_NAME,
    }
  );
  await query(
    `INSERT IGNORE INTO stores (name, store_key, subdomain, domain_prefix, commission_rate) VALUES
     ('yishiguang', 'yishiguang', 'yishiguang', 'yishiguang', 0.0500),
     ('buka', 'buka', 'buka', 'buka', 0.0400)`
  );

  await query(
    `INSERT IGNORE INTO play_shops (id, name, commission_rate) VALUES
    (1, 'Play Shop A', 0.9000),
    (2, 'Play Shop B', 0.8800),
    (3, 'Play Shop C', 0.9200)`
  );

  await query(
    `INSERT IGNORE INTO users (id, username, password, name, role, store_id, admin_permissions, status) VALUES
    (1, 'superadmin_demo', 'ChangeMe123!', 'Super Admin', 'super_admin', NULL, JSON_OBJECT('can_manage_admin_permissions', true), 'active'),
    (2, 'admin_demo_a', 'ChangeMe123!', 'Admin A', 'admin', NULL, JSON_OBJECT('can_confirm_order', true), 'active'),
    (3, 'admin_demo_b', 'ChangeMe123!', 'Admin B', 'admin', NULL, JSON_OBJECT('can_confirm_order', true), 'active'),
    (4, 'admin_demo_c', 'ChangeMe123!', 'Admin C', 'admin', NULL, JSON_OBJECT('can_confirm_order', true), 'active'),
    (5, 'store_owner_demo', 'ChangeMe123!', 'Store Owner A', 'store_owner', 1, NULL, 'active'),
    (6, 'service01', 'service123', 'Customer Service A', 'customer_service', NULL, NULL, 'active'),
    (7, 'finance01', 'finance123', 'Finance A', 'finance', NULL, NULL, 'active')`
  );

  await query(
    `INSERT IGNORE INTO user_roles (user_id, role_id)
     SELECT u.id, r.id
     FROM users u
     JOIN roles r ON BINARY r.code = BINARY u.role
     WHERE u.is_deleted = 0`
  );

  const orderCountRows = await query(`SELECT COUNT(*) AS total FROM orders`);
  if (Number(orderCountRows[0]?.total || 0) === 0) {
    await query(
      `INSERT INTO orders
      (order_no, store_id, contact, order_info, order_amount, status, store_rate, store_share, platform_rate, platform_share, shop_id, shop_rate, shop_share, play_shop_id, play_shop_rate, play_shop_share, store_commission, platform_commission, play_shop_commission, revised_amount, problem_remark, west_share, is_effective, created_by, confirmed_by)
      VALUES
      ('WB20260304001', 1, '13800000001', 'Rank boost 3h', 300, 'completed', 0.0500, 15, ${DEFAULT_PLATFORM_RATE.toFixed(4)}, 15, 1, 0.9000, 270, 1, 0.9000, 270, 15, 15, 270, NULL, NULL, 15, 1, 1, 2),
      ('WB20260304002', 2, '13800000002', 'Duo queue 2h', 180, 'pending_contact', 0.0400, 7.2, ${DEFAULT_PLATFORM_RATE.toFixed(4)}, 9, 2, 0.8800, 158.4, 2, 0.8800, 158.4, 7.2, 9, 158.4, NULL, NULL, 9, 0, 1, NULL),
      ('WB20260303001', 1, '13800000003', 'Team play 4h', 420, 'problem', 0.0500, 21, ${DEFAULT_PLATFORM_RATE.toFixed(4)}, 21, 3, 0.9200, 386.4, 3, 0.9200, 386.4, 21, 21, 386.4, 399, 'Compensation', 21, 0, 1, NULL)`
    );
  }

  const onlineStoreRows = await query(
    `SELECT id FROM stores WHERE is_deleted = 0 AND name = :name LIMIT 1`,
    { name: DEFAULT_ONLINE_STORE_NAME }
  );
  const onlineStoreId = Number(onlineStoreRows[0]?.id || 0);
  if (onlineStoreId) {
    const onlineOrderCountRows = await query(`SELECT COUNT(*) AS total FROM online_orders`);
    if (Number(onlineOrderCountRows[0]?.total || 0) === 0) {
      await query(
        `INSERT INTO online_orders (order_no, store_id, contact, order_info, order_amount, status, platform_rate, platform_commission, created_by)
         VALUES ('ONL20260304001', :store_id, '13900000001', 'Online sample order', 120, 'completed', :platform_rate, ROUND(120 * :platform_rate, 2), 1)`,
        {
          store_id: onlineStoreId,
          platform_rate: DEFAULT_PLATFORM_RATE,
        }
      );
    }
  }
}

async function initSchema() {
  await ensureStoresTable();
  await ensurePlayShopsTable();
  await ensureUsersTable();
  await ensureOrdersTable();
  await ensureRBACSchema();
  await ensureRolePermissionTemplatesTable();
  await ensureProblemOrdersTable();
  await ensureOrderLimitsTable();
  await ensureOperationLogsTable();
  await ensureRecycleOrdersTable();
  await ensureOrdersHourStatsTable();
  await ensureOnlineUsersTable();
  await ensureOnlineOrdersTable();
  await ensureNotificationsTables();
  await seedRBACData();
  await seedRolePermissionTemplates();
  await backfillRoleTemplatePermissionKeys();
  await enforceStoreOwnerOrderRemarkRestriction();
  await loadRolePermissionTemplatesToRuntime();
  await seedBaseData();
}

module.exports = {
  initSchema,
};

