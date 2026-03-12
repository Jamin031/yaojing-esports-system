CREATE DATABASE IF NOT EXISTS xbdj_saas DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE xbdj_saas;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE,
  password VARCHAR(255),
  real_name VARCHAR(100) NULL,
  role VARCHAR(50) NOT NULL,
  store_id INT NULL,
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 网吧表
CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  domain_prefix VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 陪玩店表
CREATE TABLE IF NOT EXISTS play_shops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(50) NULL,
  store_id INT NULL,
  play_shop_id INT NULL,
  customer_nickname VARCHAR(100) NULL,
  customer_contact VARCHAR(100) NULL,
  order_info TEXT NULL,
  customer_order_remark TEXT NULL,
  is_anonymous TINYINT DEFAULT 0,
  amount DECIMAL(10,2) DEFAULT 0,
  store_commission DECIMAL(10,2) DEFAULT 0,
  platform_commission DECIMAL(10,2) DEFAULT 0,
  shop_commission DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending_contact',
  is_deleted TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL
);

-- 问题订单表
CREATE TABLE IF NOT EXISTS problem_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  old_amount DECIMAL(10,2) DEFAULT 0,
  revised_amount DECIMAL(10,2) DEFAULT 0,
  problem_remark TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 回收订单表
CREATE TABLE IF NOT EXISTS recycle_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  deleted_by INT NULL,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  action TEXT NOT NULL,
  role VARCHAR(50) NULL,
  ip VARCHAR(50) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 权限表
CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE
);

-- 角色权限表
CREATE TABLE IF NOT EXISTS role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_id INT NOT NULL
);

-- 线上订单表
CREATE TABLE IF NOT EXISTS online_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(50) NULL,
  customer_nickname VARCHAR(100) NULL,
  customer_contact VARCHAR(100) NULL,
  order_info TEXT NULL,
  customer_order_remark TEXT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending_contact',
  is_anonymous TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL
);

-- 高峰时段统计表
CREATE TABLE IF NOT EXISTS orders_hour_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NULL,
  stat_date DATE NOT NULL,
  hour_num INT NOT NULL,
  order_count INT DEFAULT 0
);

-- 默认网吧
INSERT INTO stores (name, commission_rate, domain_prefix)
SELECT '忆时光网吧', 20.00, 'yishiguang'
WHERE NOT EXISTS (
  SELECT 1 FROM stores WHERE name = '忆时光网吧'
);

-- 默认陪玩店
INSERT INTO play_shops (name, commission_rate)
SELECT '菜猫陪玩店', 90.00
WHERE NOT EXISTS (
  SELECT 1 FROM play_shops WHERE name = '菜猫陪玩店'
);

INSERT INTO play_shops (name, commission_rate)
SELECT '有点甜陪玩店', 90.00
WHERE NOT EXISTS (
  SELECT 1 FROM play_shops WHERE name = '有点甜陪玩店'
);

-- 默认超级管理员
INSERT INTO users (username, password, role)
SELECT 'superadmin_demo','ChangeMe123!','super_admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'superadmin_demo'
);

-- 默认管理员
INSERT INTO users (username, password, role)
SELECT 'admin_demo_a','ChangeMe123!','admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin_demo_a'
);

INSERT INTO users (username, password, role)
SELECT 'admin_demo_b','ChangeMe123!','admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin_demo_b'
);

INSERT INTO users (username, password, role)
SELECT 'admin_demo_c','ChangeMe123!','admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin_demo_c'
);

-- 默认网吧老板
INSERT INTO users (username, password, role, store_id)
SELECT 'store_owner_demo','ChangeMe123!','store_owner',1
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'store_owner_demo'
);
