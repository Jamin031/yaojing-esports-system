const { query, transaction } = require('../config/db');
const { normalizeDeviceId, isValidDeviceId } = require('../../shared/deviceId');

const DEVICE_BLOCK_TYPES = Object.freeze({
  NONE: 'none',
  AUTOMATIC: 'automatic',
  MANUAL: 'manual',
});

const DEVICE_STATUS_TYPES = Object.freeze({
  NORMAL: 'normal',
  BLOCKED: 'blocked',
  PERMANENT: 'permanent',
});

const DEVICE_ACTION_TYPES = Object.freeze({
  AUTO_BLOCK: 'auto_block',
  MANUAL_BLOCK: 'manual_block',
  MANUAL_PERMANENT_BLOCK: 'manual_permanent_block',
  MANUAL_UNBLOCK: 'manual_unblock',
  MANUAL_REVOKE_PERMANENT_BLOCK: 'manual_revoke_permanent_block',
});

const DEVICE_BLOCK_TABLE = 'device_blocks';
const DEVICE_BLOCK_LOG_TABLE = 'device_block_logs';

function createExecutor(conn = null) {
  if (conn) {
    return {
      async select(sql, params = {}) {
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
      async execute(sql, params = {}) {
        const [result] = await conn.execute(sql, params);
        return result;
      },
    };
  }

  return {
    async select(sql, params = {}) {
      return query(sql, params);
    },
    async execute(sql, params = {}) {
      return query(sql, params);
    },
  };
}

function trimText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  return typeof maxLength === 'number' && maxLength > 0 ? text.slice(0, maxLength) : text;
}

function parseJson(value, fallback = null) {
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

function stringifyJson(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateMs(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function isFuture(value, nowMs = Date.now()) {
  const stamp = toDateMs(value);
  return stamp > nowMs;
}

function buildOperator(operator = null, fallbackSystem = false) {
  if (operator && typeof operator === 'object') {
    return {
      id: operator.id ? Number(operator.id) : null,
      username: trimText(operator.username, 64),
      name: trimText(operator.name, 80),
    };
  }

  if (!fallbackSystem) {
    return {
      id: null,
      username: null,
      name: null,
    };
  }

  return {
    id: null,
    username: 'system',
    name: 'System',
  };
}

function normalizeProfileRow(row) {
  if (!row) {
    return null;
  }

  return {
    device_id: normalizeDeviceId(row.device_id),
    source: trimText(row.source, 120),
    source_store_key: trimText(row.source_store_key, 80),
    last_order_id: row.last_order_id == null ? null : Number(row.last_order_id),
    last_order_at: row.last_order_at || null,
    last_abnormal_at: row.last_abnormal_at || null,
    last_abnormal_count: Number(row.last_abnormal_count || 0),
    last_abnormal_reason: trimText(row.last_abnormal_reason, 255),
    manual_block_started_at: row.manual_block_started_at || null,
    manual_block_expires_at: row.manual_block_expires_at || null,
    manual_is_permanent: Number(row.manual_is_permanent || 0) ? 1 : 0,
    manual_block_reason: trimText(row.manual_block_reason, 255),
    manual_block_remark: trimText(row.manual_block_remark, 500),
    auto_block_started_at: row.auto_block_started_at || null,
    auto_block_expires_at: row.auto_block_expires_at || null,
    auto_block_reason: trimText(row.auto_block_reason, 255),
    last_operator_user_id: row.last_operator_user_id == null ? null : Number(row.last_operator_user_id),
    last_operator_username: trimText(row.last_operator_username, 64),
    last_operator_name: trimText(row.last_operator_name, 80),
    last_operation_type: trimText(row.last_operation_type, 50),
    last_operation_at: row.last_operation_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function buildEffectiveDeviceState(row) {
  const normalized = normalizeProfileRow(row);
  if (!normalized) {
    return {
      exists: false,
      device_id: '',
      current_status: DEVICE_STATUS_TYPES.NORMAL,
      block_type: DEVICE_BLOCK_TYPES.NONE,
      is_blocked: false,
      is_permanent: false,
      blocked_at: null,
      blocked_until: null,
      remaining_seconds: 0,
      reason: null,
      remark: null,
      source: null,
      source_store_key: null,
      last_order_id: null,
      last_order_at: null,
      last_abnormal_at: null,
      last_abnormal_count: 0,
      last_abnormal_reason: null,
      last_operator_user_id: null,
      last_operator_username: null,
      last_operator_name: null,
      last_operation_type: null,
      last_operation_at: null,
      created_at: null,
      updated_at: null,
      manual_block_active: false,
      automatic_block_active: false,
      manual_block: null,
      automatic_block: null,
    };
  }

  const nowMs = Date.now();
  const manualPermanent = normalized.manual_is_permanent === 1;
  const manualTimedActive = isFuture(normalized.manual_block_expires_at, nowMs);
  const manualActive = manualPermanent || manualTimedActive;
  const autoActive = isFuture(normalized.auto_block_expires_at, nowMs);

  let currentStatus = DEVICE_STATUS_TYPES.NORMAL;
  let blockType = DEVICE_BLOCK_TYPES.NONE;
  let blockedAt = null;
  let blockedUntil = null;
  let isPermanent = false;
  let reason = null;
  let remark = null;

  if (manualActive) {
    currentStatus = manualPermanent ? DEVICE_STATUS_TYPES.PERMANENT : DEVICE_STATUS_TYPES.BLOCKED;
    blockType = DEVICE_BLOCK_TYPES.MANUAL;
    blockedAt = normalized.manual_block_started_at;
    blockedUntil = manualPermanent ? null : normalized.manual_block_expires_at;
    isPermanent = manualPermanent;
    reason = normalized.manual_block_reason;
    remark = normalized.manual_block_remark;
  } else if (autoActive) {
    currentStatus = DEVICE_STATUS_TYPES.BLOCKED;
    blockType = DEVICE_BLOCK_TYPES.AUTOMATIC;
    blockedAt = normalized.auto_block_started_at;
    blockedUntil = normalized.auto_block_expires_at;
    reason = normalized.auto_block_reason;
  }

  const remainingSeconds = blockedUntil ? Math.max(0, Math.ceil((toDateMs(blockedUntil) - nowMs) / 1000)) : 0;

  return {
    exists: true,
    device_id: normalized.device_id,
    current_status: currentStatus,
    block_type: blockType,
    is_blocked: currentStatus !== DEVICE_STATUS_TYPES.NORMAL,
    is_permanent: isPermanent,
    blocked_at: blockedAt,
    blocked_until: blockedUntil,
    remaining_seconds: isPermanent ? null : remainingSeconds,
    reason,
    remark,
    source: normalized.source,
    source_store_key: normalized.source_store_key,
    last_order_id: normalized.last_order_id,
    last_order_at: normalized.last_order_at,
    last_abnormal_at: normalized.last_abnormal_at,
    last_abnormal_count: normalized.last_abnormal_count,
    last_abnormal_reason: normalized.last_abnormal_reason,
    last_operator_user_id: normalized.last_operator_user_id,
    last_operator_username: normalized.last_operator_username,
    last_operator_name: normalized.last_operator_name,
    last_operation_type: normalized.last_operation_type,
    last_operation_at: normalized.last_operation_at,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
    manual_block_active: manualActive,
    automatic_block_active: autoActive,
    manual_block: {
      active: manualActive,
      started_at: normalized.manual_block_started_at,
      expires_at: normalized.manual_block_expires_at,
      is_permanent: manualPermanent,
      reason: normalized.manual_block_reason,
      remark: normalized.manual_block_remark,
    },
    automatic_block: {
      active: autoActive,
      started_at: normalized.auto_block_started_at,
      expires_at: normalized.auto_block_expires_at,
      reason: normalized.auto_block_reason,
    },
  };
}

async function getDeviceProfileRow(deviceId, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return null;
  }

  const executor = createExecutor(options.conn);
  const rows = await executor.select(
    `SELECT
      device_id,
      source,
      source_store_key,
      last_order_id,
      last_order_at,
      last_abnormal_at,
      last_abnormal_count,
      last_abnormal_reason,
      manual_block_started_at,
      manual_block_expires_at,
      manual_is_permanent,
      manual_block_reason,
      manual_block_remark,
      auto_block_started_at,
      auto_block_expires_at,
      auto_block_reason,
      last_operator_user_id,
      last_operator_username,
      last_operator_name,
      last_operation_type,
      last_operation_at,
      created_at,
      updated_at
     FROM ${DEVICE_BLOCK_TABLE}
     WHERE device_id = :device_id
     LIMIT 1`,
    {
      device_id: normalized,
    }
  );

  return rows[0] || null;
}

async function getDeviceStatus(deviceId, options = {}) {
  const row = await getDeviceProfileRow(deviceId, options);
  const snapshot = buildEffectiveDeviceState(row);
  if (snapshot.exists) {
    return snapshot;
  }

  return {
    ...snapshot,
    device_id: normalizeDeviceId(deviceId),
  };
}

async function upsertDeviceProfileBase(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return null;
  }

  const executor = createExecutor(options.conn);
  const params = {
    device_id: normalized,
    source: trimText(context.source, 120),
    source_store_key: trimText(context.source_store_key || context.store_key, 80),
  };

  await executor.execute(
    `INSERT INTO ${DEVICE_BLOCK_TABLE}
      (
        device_id,
        source,
        source_store_key
      )
     VALUES
      (
        :device_id,
        :source,
        :source_store_key
      )
     ON DUPLICATE KEY UPDATE
      source = COALESCE(VALUES(source), source),
      source_store_key = COALESCE(VALUES(source_store_key), source_store_key),
      updated_at = CURRENT_TIMESTAMP`,
    params
  );

  return normalized;
}

async function writeDeviceRiskLog(deviceId, payload = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return;
  }

  const executor = createExecutor(options.conn);
  await executor.execute(
    `INSERT INTO ${DEVICE_BLOCK_LOG_TABLE}
      (
        device_id,
        action_type,
        action_scope,
        operator_user_id,
        operator_username,
        operator_name,
        duration_minutes,
        is_permanent,
        reason,
        remark,
        source,
        before_status_json,
        after_status_json,
        metadata_json
      )
     VALUES
      (
        :device_id,
        :action_type,
        :action_scope,
        :operator_user_id,
        :operator_username,
        :operator_name,
        :duration_minutes,
        :is_permanent,
        :reason,
        :remark,
        :source,
        :before_status_json,
        :after_status_json,
        :metadata_json
      )`,
    {
      device_id: normalized,
      action_type: trimText(payload.action_type, 50),
      action_scope: trimText(payload.action_scope, 20),
      operator_user_id: payload.operator_user_id == null ? null : Number(payload.operator_user_id),
      operator_username: trimText(payload.operator_username, 64),
      operator_name: trimText(payload.operator_name, 80),
      duration_minutes:
        payload.duration_minutes == null || payload.duration_minutes === ''
          ? null
          : Number(payload.duration_minutes),
      is_permanent: payload.is_permanent ? 1 : 0,
      reason: trimText(payload.reason, 255),
      remark: trimText(payload.remark, 500),
      source: trimText(payload.source, 120),
      before_status_json: stringifyJson(payload.before_status),
      after_status_json: stringifyJson(payload.after_status),
      metadata_json: stringifyJson(payload.metadata),
    }
  );
}

async function recordDeviceOrderActivity(deviceId, context = {}, options = {}) {
  const normalized = await upsertDeviceProfileBase(deviceId, context, options);
  if (!normalized) {
    return null;
  }

  const executor = createExecutor(options.conn);
  await executor.execute(
    `UPDATE ${DEVICE_BLOCK_TABLE}
     SET source = COALESCE(:source, source),
         source_store_key = COALESCE(:source_store_key, source_store_key),
         last_order_id = COALESCE(:last_order_id, last_order_id),
         last_order_at = COALESCE(:last_order_at, last_order_at),
         updated_at = CURRENT_TIMESTAMP
     WHERE device_id = :device_id`,
    {
      device_id: normalized,
      source: trimText(context.source, 120),
      source_store_key: trimText(context.source_store_key || context.store_key, 80),
      last_order_id: context.order_id == null ? null : Number(context.order_id),
      last_order_at: toDate(context.last_order_at || new Date()),
    }
  );

  return getDeviceStatus(normalized, options);
}

async function recordDeviceAbnormalActivity(deviceId, context = {}, options = {}) {
  const normalized = await upsertDeviceProfileBase(deviceId, context, options);
  if (!normalized) {
    return null;
  }

  const executor = createExecutor(options.conn);
  await executor.execute(
    `UPDATE ${DEVICE_BLOCK_TABLE}
     SET source = COALESCE(:source, source),
         source_store_key = COALESCE(:source_store_key, source_store_key),
         last_abnormal_at = COALESCE(:last_abnormal_at, last_abnormal_at),
         last_abnormal_count = :last_abnormal_count,
         last_abnormal_reason = COALESCE(:last_abnormal_reason, last_abnormal_reason),
         updated_at = CURRENT_TIMESTAMP
     WHERE device_id = :device_id`,
    {
      device_id: normalized,
      source: trimText(context.source, 120),
      source_store_key: trimText(context.source_store_key || context.store_key, 80),
      last_abnormal_at: toDate(context.last_abnormal_at || new Date()),
      last_abnormal_count: Math.max(0, Number(context.last_abnormal_count || 0)),
      last_abnormal_reason: trimText(context.last_abnormal_reason || context.reason, 255),
    }
  );

  return getDeviceStatus(normalized, options);
}

async function applyAutomaticDeviceBlock(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return getDeviceStatus(normalized, options);
  }

  const runner = async (conn) => {
    const beforeStatus = await getDeviceStatus(normalized, { conn });
    await upsertDeviceProfileBase(normalized, context, { conn });

    const executor = createExecutor(conn);
    const operator = buildOperator(null, true);
    await executor.execute(
      `UPDATE ${DEVICE_BLOCK_TABLE}
       SET source = COALESCE(:source, source),
           source_store_key = COALESCE(:source_store_key, source_store_key),
           last_abnormal_at = COALESCE(:last_abnormal_at, last_abnormal_at),
           last_abnormal_count = :last_abnormal_count,
           last_abnormal_reason = COALESCE(:last_abnormal_reason, last_abnormal_reason),
           auto_block_started_at = COALESCE(:auto_block_started_at, auto_block_started_at),
           auto_block_expires_at = :auto_block_expires_at,
           auto_block_reason = COALESCE(:auto_block_reason, auto_block_reason),
           last_operator_user_id = :last_operator_user_id,
           last_operator_username = :last_operator_username,
           last_operator_name = :last_operator_name,
           last_operation_type = :last_operation_type,
           last_operation_at = :last_operation_at,
           updated_at = CURRENT_TIMESTAMP
       WHERE device_id = :device_id`,
      {
        device_id: normalized,
        source: trimText(context.source, 120),
        source_store_key: trimText(context.source_store_key || context.store_key, 80),
        last_abnormal_at: toDate(context.last_abnormal_at || new Date()),
        last_abnormal_count: Math.max(0, Number(context.last_abnormal_count || 0)),
        last_abnormal_reason: trimText(context.last_abnormal_reason || context.reason, 255),
        auto_block_started_at: toDate(context.block_started_at || new Date()),
        auto_block_expires_at: toDate(context.blocked_until || context.expires_at),
        auto_block_reason: trimText(context.reason, 255),
        last_operator_user_id: operator.id,
        last_operator_username: operator.username,
        last_operator_name: operator.name,
        last_operation_type: DEVICE_ACTION_TYPES.AUTO_BLOCK,
        last_operation_at: toDate(context.operation_at || new Date()),
      }
    );

    const afterStatus = await getDeviceStatus(normalized, { conn });
    await writeDeviceRiskLog(
      normalized,
      {
        action_type: DEVICE_ACTION_TYPES.AUTO_BLOCK,
        action_scope: 'automatic',
        operator_user_id: operator.id,
        operator_username: operator.username,
        operator_name: operator.name,
        duration_minutes: Math.max(0, Number(context.duration_minutes || 0)),
        is_permanent: false,
        reason: context.reason,
        source: context.source,
        before_status: beforeStatus,
        after_status: afterStatus,
        metadata: {
          source_store_key: trimText(context.source_store_key || context.store_key, 80),
          trigger: trimText(context.trigger, 120),
        },
      },
      { conn }
    );

    return afterStatus;
  };

  if (options.conn) {
    return runner(options.conn);
  }

  return transaction(runner);
}

async function blockDevice(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return getDeviceStatus(normalized, options);
  }

  const operator = buildOperator(context.operator);
  const isPermanent = Boolean(context.is_permanent);
  const durationMinutes = isPermanent ? null : Math.max(1, Number(context.duration_minutes || 0));
  const blockedAt = toDate(context.block_started_at || new Date()) || new Date();
  const blockedUntil = isPermanent ? null : new Date(blockedAt.getTime() + durationMinutes * 60 * 1000);
  const actionType = isPermanent ? DEVICE_ACTION_TYPES.MANUAL_PERMANENT_BLOCK : DEVICE_ACTION_TYPES.MANUAL_BLOCK;

  const runner = async (conn) => {
    const beforeStatus = await getDeviceStatus(normalized, { conn });
    await upsertDeviceProfileBase(normalized, context, { conn });

    const executor = createExecutor(conn);
    await executor.execute(
      `UPDATE ${DEVICE_BLOCK_TABLE}
       SET source = COALESCE(:source, source),
           source_store_key = COALESCE(:source_store_key, source_store_key),
           manual_block_started_at = :manual_block_started_at,
           manual_block_expires_at = :manual_block_expires_at,
           manual_is_permanent = :manual_is_permanent,
           manual_block_reason = :manual_block_reason,
           manual_block_remark = :manual_block_remark,
           last_operator_user_id = :last_operator_user_id,
           last_operator_username = :last_operator_username,
           last_operator_name = :last_operator_name,
           last_operation_type = :last_operation_type,
           last_operation_at = :last_operation_at,
           updated_at = CURRENT_TIMESTAMP
       WHERE device_id = :device_id`,
      {
        device_id: normalized,
        source: trimText(context.source, 120),
        source_store_key: trimText(context.source_store_key || context.store_key, 80),
        manual_block_started_at: blockedAt,
        manual_block_expires_at: blockedUntil,
        manual_is_permanent: isPermanent ? 1 : 0,
        manual_block_reason: trimText(context.reason, 255),
        manual_block_remark: trimText(context.remark, 500),
        last_operator_user_id: operator.id,
        last_operator_username: operator.username,
        last_operator_name: operator.name,
        last_operation_type: actionType,
        last_operation_at: blockedAt,
      }
    );

    const afterStatus = await getDeviceStatus(normalized, { conn });
    await writeDeviceRiskLog(
      normalized,
      {
        action_type: actionType,
        action_scope: 'manual',
        operator_user_id: operator.id,
        operator_username: operator.username,
        operator_name: operator.name,
        duration_minutes: durationMinutes,
        is_permanent: isPermanent,
        reason: context.reason,
        remark: context.remark,
        source: context.source,
        before_status: beforeStatus,
        after_status: afterStatus,
        metadata: {
          source_store_key: trimText(context.source_store_key || context.store_key, 80),
        },
      },
      { conn }
    );

    return afterStatus;
  };

  if (options.conn) {
    return runner(options.conn);
  }

  return transaction(runner);
}

async function unblockDevice(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return getDeviceStatus(normalized, options);
  }

  const operator = buildOperator(context.operator);
  const runner = async (conn) => {
    const beforeStatus = await getDeviceStatus(normalized, { conn });
    if (!beforeStatus.exists) {
      await upsertDeviceProfileBase(normalized, context, { conn });
    }

    if (beforeStatus.exists && !beforeStatus.is_blocked) {
      return beforeStatus;
    }

    const actionType = beforeStatus.is_permanent
      ? DEVICE_ACTION_TYPES.MANUAL_REVOKE_PERMANENT_BLOCK
      : DEVICE_ACTION_TYPES.MANUAL_UNBLOCK;
    const executor = createExecutor(conn);
    await executor.execute(
      `UPDATE ${DEVICE_BLOCK_TABLE}
       SET manual_block_started_at = NULL,
           manual_block_expires_at = NULL,
           manual_is_permanent = 0,
           manual_block_reason = NULL,
           manual_block_remark = NULL,
           auto_block_started_at = NULL,
           auto_block_expires_at = NULL,
           auto_block_reason = NULL,
           last_operator_user_id = :last_operator_user_id,
           last_operator_username = :last_operator_username,
           last_operator_name = :last_operator_name,
           last_operation_type = :last_operation_type,
           last_operation_at = :last_operation_at,
           updated_at = CURRENT_TIMESTAMP
       WHERE device_id = :device_id`,
      {
        device_id: normalized,
        last_operator_user_id: operator.id,
        last_operator_username: operator.username,
        last_operator_name: operator.name,
        last_operation_type: actionType,
        last_operation_at: toDate(context.operation_at || new Date()),
      }
    );

    const afterStatus = await getDeviceStatus(normalized, { conn });
    await writeDeviceRiskLog(
      normalized,
      {
        action_type: actionType,
        action_scope: 'manual',
        operator_user_id: operator.id,
        operator_username: operator.username,
        operator_name: operator.name,
        duration_minutes: null,
        is_permanent: false,
        reason: context.reason,
        remark: context.remark,
        source: context.source || beforeStatus.source,
        before_status: beforeStatus,
        after_status: afterStatus,
      },
      { conn }
    );

    return afterStatus;
  };

  if (options.conn) {
    return runner(options.conn);
  }

  return transaction(runner);
}

function buildDeviceListFilters(filters = {}) {
  const where = ['1=1'];
  const params = {};
  const keyword = trimText(filters.keyword, 120);
  const status = trimText(filters.status, 20);
  const source = trimText(filters.source, 120);

  const manualActiveWhere =
    '(COALESCE(p.manual_is_permanent, 0) = 1 OR (p.manual_block_expires_at IS NOT NULL AND p.manual_block_expires_at > CURRENT_TIMESTAMP))';
  const autoActiveWhere =
    '(p.auto_block_expires_at IS NOT NULL AND p.auto_block_expires_at > CURRENT_TIMESTAMP)';

  if (keyword) {
    where.push('(p.device_id LIKE :keyword OR COALESCE(p.source, \'\') LIKE :keyword)');
    params.keyword = `%${keyword}%`;
  }

  if (source) {
    where.push('p.source = :source');
    params.source = source;
  }

  if (status === DEVICE_STATUS_TYPES.PERMANENT) {
    where.push('COALESCE(p.manual_is_permanent, 0) = 1');
  } else if (status === DEVICE_STATUS_TYPES.BLOCKED) {
    where.push(
      `(
        (COALESCE(p.manual_is_permanent, 0) = 0 AND p.manual_block_expires_at IS NOT NULL AND p.manual_block_expires_at > CURRENT_TIMESTAMP)
        OR ${autoActiveWhere}
      )`
    );
  } else if (status === DEVICE_STATUS_TYPES.NORMAL) {
    where.push(`NOT (${manualActiveWhere} OR ${autoActiveWhere})`);
  }

  return {
    where: where.join(' AND '),
    params,
  };
}

async function listDevices(filters = {}) {
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 20)));
  const offset = (page - 1) * pageSize;
  const { where, params } = buildDeviceListFilters(filters);

  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM ${DEVICE_BLOCK_TABLE} p
     WHERE ${where}`,
    params
  );

  const rows = await query(
    `SELECT
      p.device_id,
      p.source,
      p.source_store_key,
      p.last_order_id,
      p.last_order_at,
      p.last_abnormal_at,
      p.last_abnormal_count,
      p.last_abnormal_reason,
      p.manual_block_started_at,
      p.manual_block_expires_at,
      p.manual_is_permanent,
      p.manual_block_reason,
      p.manual_block_remark,
      p.auto_block_started_at,
      p.auto_block_expires_at,
      p.auto_block_reason,
      p.last_operator_user_id,
      p.last_operator_username,
      p.last_operator_name,
      p.last_operation_type,
      p.last_operation_at,
      p.created_at,
      p.updated_at
     FROM ${DEVICE_BLOCK_TABLE} p
     WHERE ${where}
     ORDER BY
      CASE
        WHEN COALESCE(p.manual_is_permanent, 0) = 1 THEN 0
        WHEN p.manual_block_expires_at IS NOT NULL AND p.manual_block_expires_at > CURRENT_TIMESTAMP THEN 1
        WHEN p.auto_block_expires_at IS NOT NULL AND p.auto_block_expires_at > CURRENT_TIMESTAMP THEN 2
        ELSE 3
      END ASC,
      COALESCE(p.last_operation_at, p.last_abnormal_at, p.last_order_at, p.updated_at, p.created_at) DESC,
      p.device_id ASC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  return {
    list: rows.map((row) => buildEffectiveDeviceState(row)),
    total: Number(totalRows[0]?.total || 0),
    page,
    pageSize,
  };
}

async function listDeviceSources() {
  const rows = await query(
    `SELECT DISTINCT source
     FROM ${DEVICE_BLOCK_TABLE}
     WHERE source IS NOT NULL
       AND source <> ''
     ORDER BY source ASC`
  );

  return rows.map((row) => row.source).filter(Boolean);
}

async function listDeviceLogs(deviceId, filters = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return {
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
    };
  }

  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM ${DEVICE_BLOCK_LOG_TABLE}
     WHERE device_id = :device_id`,
    {
      device_id: normalized,
    }
  );

  const rows = await query(
    `SELECT
      id,
      device_id,
      action_type,
      action_scope,
      operator_user_id,
      operator_username,
      operator_name,
      duration_minutes,
      is_permanent,
      reason,
      remark,
      source,
      before_status_json,
      after_status_json,
      metadata_json,
      created_at
     FROM ${DEVICE_BLOCK_LOG_TABLE}
     WHERE device_id = :device_id
     ORDER BY created_at DESC, id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    {
      device_id: normalized,
    }
  );

  return {
    list: rows.map((row) => ({
      id: Number(row.id),
      device_id: row.device_id,
      action_type: trimText(row.action_type, 50),
      action_scope: trimText(row.action_scope, 20),
      operator_user_id: row.operator_user_id == null ? null : Number(row.operator_user_id),
      operator_username: trimText(row.operator_username, 64),
      operator_name: trimText(row.operator_name, 80),
      duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
      is_permanent: Number(row.is_permanent || 0) === 1,
      reason: trimText(row.reason, 255),
      remark: trimText(row.remark, 500),
      source: trimText(row.source, 120),
      before_status: parseJson(row.before_status_json, null),
      after_status: parseJson(row.after_status_json, null),
      metadata: parseJson(row.metadata_json, null),
      created_at: row.created_at,
    })),
    total: Number(totalRows[0]?.total || 0),
    page,
    pageSize,
  };
}

async function isDeviceBlocked(deviceId, options = {}) {
  const status = await getDeviceStatus(deviceId, options);
  return Boolean(status.is_blocked);
}

async function isDevicePermanentlyBlocked(deviceId, options = {}) {
  const status = await getDeviceStatus(deviceId, options);
  return Boolean(status.is_permanent);
}

module.exports = {
  DEVICE_BLOCK_TYPES,
  DEVICE_STATUS_TYPES,
  DEVICE_ACTION_TYPES,
  applyAutomaticDeviceBlock,
  blockDevice,
  buildEffectiveDeviceState,
  getDeviceProfileRow,
  getDeviceStatus,
  isDeviceBlocked,
  isDevicePermanentlyBlocked,
  listDeviceLogs,
  listDeviceSources,
  listDevices,
  recordDeviceAbnormalActivity,
  recordDeviceOrderActivity,
  unblockDevice,
};
