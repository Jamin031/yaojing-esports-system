const { query } = require('../config/db');
const { hasAnyRole, hasPermission, hasPagePermission } = require('../middleware/permissions');
const { buildPagination, ok, fail } = require('../utils/http');
const { TARGET_TEXT_MAP } = require('../utils/operationLog');

function canReadLogs(user) {
  if (!hasPagePermission(user, 'operation_logs:view')) {
    return false;
  }

  return hasPermission(user, 'api.logs.read') || hasAnyRole(user, ['super_admin', 'admin', 'finance']);
}

async function listLogs(req, res) {
  if (!canReadLogs(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 200);
  const { action, action_code, operator_user_id, operator, start_date, end_date, start_time, end_time } = req.query;

  const filters = ['1=1'];
  const params = {};

  if (action) {
    filters.push('(l.action = :action OR l.action_code = :action)');
    params.action = String(action);
  }

  if (action_code) {
    filters.push('l.action_code = :action_code');
    params.action_code = String(action_code);
  }

  if (operator_user_id) {
    filters.push('l.operator_user_id = :operator_user_id');
    params.operator_user_id = Number(operator_user_id);
  }

  if (operator) {
    filters.push(`(u.name LIKE :operator OR u.username LIKE :operator)`);
    params.operator = `%${String(operator)}%`;
  }

  if (start_time) {
    filters.push('l.created_at >= :start_time');
    params.start_time = start_time;
  } else if (start_date) {
    filters.push('DATE(l.created_at) >= :start_date');
    params.start_date = start_date;
  }

  if (end_time) {
    filters.push('l.created_at <= :end_time');
    params.end_time = end_time;
  } else if (end_date) {
    filters.push('DATE(l.created_at) <= :end_date');
    params.end_date = end_date;
  }

  const where = filters.join(' AND ');
  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM operation_logs l
     LEFT JOIN users u ON u.id = l.operator_user_id
     WHERE ${where}`,
    params
  );

  const list = await query(
    `SELECT
      l.id,
      l.operator_user_id,
      u.username AS operator_username,
      u.name AS operator_name,
      l.operator_role,
      l.action_code,
      l.action,
      l.content,
      l.content AS detail,
      l.ip,
      l.target_type,
      l.target_id,
      l.before_json,
      l.after_json,
      CONCAT(COALESCE(l.target_type, ''), ':', COALESCE(l.target_id, '')) AS target_legacy,
      l.created_at
     FROM operation_logs l
     LEFT JOIN users u ON u.id = l.operator_user_id
     WHERE ${where}
     ORDER BY l.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const mapped = list.map((item) => {
    const target = formatTarget(item.target_type, item.target_id, item.target_legacy);
    const operator = item.operator_name || item.operator_username || `用户#${item.operator_user_id || '-'}`;
    return {
      ...item,
      target,
      detail: item.content,
      time: item.created_at,
      operator,
      before: item.before_json ? parseJsonSafe(item.before_json) : null,
      after: item.after_json ? parseJsonSafe(item.after_json) : null,
    };
  });

  return ok(
    res,
    {
      list: mapped,
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
    },
    '操作日志获取成功'
  );
}

function formatTarget(targetType, targetId, legacyTarget) {
  const type = String(targetType || '').trim();
  const id = targetId == null ? '' : String(targetId).trim();
  const typeText = TARGET_TEXT_MAP[type] || type;

  if (!typeText && !id) {
    return String(legacyTarget || '').trim();
  }
  if (!typeText) {
    return id;
  }
  if (!id) {
    return typeText;
  }
  return `${typeText}#${id}`;
}

function parseJsonSafe(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  listLogs,
};
