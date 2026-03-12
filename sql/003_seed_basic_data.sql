USE xbdj_saas;

-- 网吧
INSERT INTO stores (name, commission_rate, domain_prefix)
SELECT '忆时光网吧', 20.00, 'yishiguang'
WHERE NOT EXISTS (
  SELECT 1 FROM stores WHERE name = '忆时光网吧'
);

INSERT INTO stores (name, commission_rate, domain_prefix)
SELECT '布卡网吧', 20.00, 'buka'
WHERE NOT EXISTS (
  SELECT 1 FROM stores WHERE name = '布卡网吧'
);

INSERT INTO stores (name, commission_rate, domain_prefix)
SELECT '线上订单', 0.00, 'online'
WHERE NOT EXISTS (
  SELECT 1 FROM stores WHERE name = '线上订单'
);

-- 陪玩店
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

-- 用户角色补充示例
INSERT INTO users (username, password, role)
SELECT 'finance_demo','ChangeMe123!','finance'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'finance_demo'
);

INSERT INTO users (username, password, role)
SELECT 'customer_service_demo','ChangeMe123!','customer_service'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'customer_service_demo'
);
