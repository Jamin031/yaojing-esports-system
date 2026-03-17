const { query } = require('../config/db');

const { normalizeIp } = require('../services/antiFraudService');

const ACTION_TEXT_MAP = Object.freeze({
  'orders.create': '新增订单',
  'orders.update_status': '修改订单状态',
  'orders.update_remark': '修改订单备注',
  'orders.problem_complete': '完成问题订单',
  'orders.update_problem': '保存问题订单修改',
  'orders.problem_withdraw': '撤回订单',
  'orders.assign_play_shop': '派单陪玩店',
  'orders.delete': '删除订单',
  'orders.restore': '恢复订单',
  'orders.permanent_delete': '永久删除订单',
  'orders.update_effective': '修改订单生效状态',
  'orders.batch_delete': '批量删除订单',
  'orders.batch_status': '批量修改订单状态',
  'orders.contact_invalid_attempt': '记录异常联系方式提交',
  'orders.device_id_missing': '拒绝缺失设备标识的提交',
  'orders.device_risk_block': '封禁异常下单设备',
  'orders.device_risk_block_hit': '命中设备封禁限制',

  'online_orders.create': '新增线上订单',

  'stores.create': '新增网吧',
  'stores.update': '修改网吧信息',
  'stores.update_domain': '修改网吧来源标识',
  'stores.set_commission': '设置网吧分成比例',
  'stores.delete': '删除网吧',

  'play_shops.create': '新增陪玩店',
  'play_shops.update': '修改陪玩店信息',
  'play_shops.set_commission': '设置陪玩店分成比例',
  'play_shops.delete': '删除陪玩店',

  'users.create': '新增用户',
  'users.update_name': '修改用户姓名',
  'users.update_password': '修改用户密码',
  'users.update_status': '修改用户状态',
  'users.delete': '删除用户',

  'permissions.grant': '发放权限',
  'permissions.revoke': '收回权限',
  'permissions.adjust': '调整权限',
  'permissions.template.update': '设置默认权限模板',

  'notifications.read': '标记提醒已读',
});

const TARGET_TEXT_MAP = Object.freeze({
  order: '订单',
  online_order: '线上订单',
  order_fraud: '风控',
  user: '用户',
  store: '网吧',
  play_shop: '陪玩店',
  role_template: '身份模板',
  permission: '权限',
  notification: '消息提醒',
});

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0]
    .trim();
  return normalizeIp(forwarded || req.ip || req.socket?.remoteAddress || '');
}

function toLimitedString(value, maxLength, fallback = '') {
  const raw = value == null ? fallback : value;
  if (raw == null) {
    return null;
  }

  const text = String(raw);
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function isChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function resolveActionCode(payload = {}) {
  return String(payload.action_code || payload.action || '').trim();
}

function resolveActionText(payload = {}) {
  if (payload.action_text) {
    return String(payload.action_text).trim();
  }

  const actionCode = resolveActionCode(payload);
  if (!actionCode) {
    return '未知操作';
  }

  return ACTION_TEXT_MAP[actionCode] || actionCode;
}

function resolveTargetText(payload = {}) {
  if (payload.target) {
    return String(payload.target).trim();
  }

  const targetType = String(payload.target_type || '').trim();
  const targetId = payload.target_id == null ? '' : String(payload.target_id).trim();
  const targetLabel = TARGET_TEXT_MAP[targetType] || targetType;

  if (!targetLabel && !targetId) {
    return '';
  }
  if (!targetLabel) {
    return targetId;
  }
  if (!targetId) {
    return targetLabel;
  }
  return `${targetLabel}#${targetId}`;
}

function resolveDetailText(payload = {}, actionText, targetText) {
  if (payload.detail) {
    return String(payload.detail).trim();
  }

  const content = String(payload.content || '').trim();
  if (content && isChineseText(content)) {
    return content;
  }

  if (targetText) {
    return `${actionText}（目标：${targetText}）`;
  }

  return actionText;
}

async function insertOperationLog(params, withActionCode = true) {
  if (withActionCode) {
    return query(
      `INSERT INTO operation_logs
      (operator_user_id, operator_role, action_code, action, content, ip, target_type, target_id, before_json, after_json)
      VALUES
      (:operator_user_id, :operator_role, :action_code, :action, :content, :ip, :target_type, :target_id, :before_json, :after_json)`,
      params
    );
  }

  return query(
    `INSERT INTO operation_logs
    (operator_user_id, operator_role, action, content, ip, target_type, target_id, before_json, after_json)
    VALUES
    (:operator_user_id, :operator_role, :action, :content, :ip, :target_type, :target_id, :before_json, :after_json)`,
    params
  );
}

async function writeOperationLog(req, payload = {}) {
  const user = req.user || {};
  const ip = payload.ip || getClientIp(req);
  const beforeJson = payload.before == null ? null : JSON.stringify(payload.before);
  const afterJson = payload.after == null ? null : JSON.stringify(payload.after);

  const actionCode = resolveActionCode(payload);
  const actionText = resolveActionText(payload);
  const targetText = resolveTargetText(payload);
  const detailText = resolveDetailText(payload, actionText, targetText);

  const insertParams = {
    operator_user_id: user.id ? Number(user.id) : null,
    operator_role: toLimitedString(user.role, 50, ''),
    action_code: toLimitedString(actionCode, 120, ''),
    action: toLimitedString(actionText, 80, ''),
    content: toLimitedString(detailText, 500, ''),
    ip: toLimitedString(ip, 64, ''),
    target_type: payload.target_type ? toLimitedString(payload.target_type, 40) : null,
    target_id: payload.target_id == null ? null : toLimitedString(payload.target_id, 80),
    before_json: beforeJson,
    after_json: afterJson,
  };

  try {
    await insertOperationLog(insertParams, true);
  } catch (error) {
    if (error && (error.code === 'ER_BAD_FIELD_ERROR' || Number(error.errno) === 1054)) {
      try {
        await insertOperationLog(insertParams, false);
        return;
      } catch (fallbackError) {
        console.error('[operation_logs] write failed:', fallbackError?.message || fallbackError);
        return;
      }
    }

    // 操作日志是审计辅助，不得阻断主业务流程。
    console.error('[operation_logs] write failed:', error?.message || error);
  }
}

module.exports = {
  ACTION_TEXT_MAP,
  TARGET_TEXT_MAP,
  getClientIp,
  writeOperationLog,
};
