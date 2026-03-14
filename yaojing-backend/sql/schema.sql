CREATE DATABASE IF NOT EXISTS yaojing_saas
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE yaojing_saas;

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

CREATE TABLE IF NOT EXISTS play_shops (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  commission_rate DECIMAL(6,4) NOT NULL DEFAULT 0.9000,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_play_shops_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  KEY idx_users_status (status),
  CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  store_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
  platform_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
  platform_share DECIMAL(12,2) NOT NULL DEFAULT 0,
  platform_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
  shop_id BIGINT UNSIGNED NULL,
  shop_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  shop_share DECIMAL(12,2) NOT NULL DEFAULT 0,
  play_shop_id BIGINT UNSIGNED NULL,
  play_shop_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  play_shop_share DECIMAL(12,2) NOT NULL DEFAULT 0,
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
  KEY idx_orders_deleted_created (is_deleted, created_at),
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores(id),
  CONSTRAINT fk_orders_shop FOREIGN KEY (shop_id) REFERENCES play_shops(id),
  CONSTRAINT fk_orders_play_shop FOREIGN KEY (play_shop_id) REFERENCES play_shops(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  KEY idx_online_users_status (status),
  CONSTRAINT fk_online_users_store FOREIGN KEY (store_id) REFERENCES stores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  KEY idx_online_orders_deleted_created (is_deleted, created_at),
  CONSTRAINT fk_online_orders_store FOREIGN KEY (store_id) REFERENCES stores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_role (role_id),
  KEY idx_role_permissions_permission (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_user (user_id),
  KEY idx_user_roles_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permission_templates (
  role_code VARCHAR(50) NOT NULL,
  permissions_json JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_code),
  KEY idx_role_permission_templates_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
