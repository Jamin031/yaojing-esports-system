const { query, transaction } = require('../config/db');
const contactRisk = require('../../shared/contactRisk');
const deviceIdRules = require('../../shared/deviceId');
const {
  applyAutomaticDeviceBlock,
  getDeviceStatus,
  recordDeviceAbnormalActivity,
} = require('./deviceRiskService');

const {
  BLOCKED_DEVICE_MESSAGE,
  DEVICE_ID_REQUIRED_MESSAGE,
  INVALID_CONTACT_MESSAGE,
  evaluateContact,
  isObviousFakePhone,
  isObviousFakeWechat,
  isSuspiciousContact,
  isValidChinaMobile,
  isValidWechat,
} = contactRisk;

const {
  DEVICE_ID_BODY_FIELD,
  DEVICE_ID_HEADER,
  isValidDeviceId,
  normalizeDeviceId,
} = deviceIdRules;

const ORDER_LIMIT_TYPES = Object.freeze({
  DEVICE_BLOCK: 'fraud_device_block',
  DEVICE_BLOCK_HIT: 'fraud_device_block_hit',
  INVALID_ATTEMPT: 'fraud_invalid_contact_attempt',
  MISSING_DEVICE_ID: 'fraud_missing_device_id',
});

const FRAUD_DEVICE_BLOCK_MINUTES = Math.max(
  1,
  Number(process.env.FRAUD_DEVICE_BLOCK_MINUTES || 5)
);
const FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT = Math.max(
  3,
  Number(process.env.FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT || 3)
);

function normalizeIp(ip) {
  let value = String(ip || '').trim();
  if (!value) {
    return '';
  }

  value = value.split(',')[0].trim();
  if (value.startsWith('::ffff:')) {
    value = value.slice(7);
  }
  if (value === '::1') {
    return '127.0.0.1';
  }
  return value;
}

function getRetryAfterSeconds(expiresAt) {
  const targetTime = new Date(expiresAt || 0).getTime();
  if (!Number.isFinite(targetTime) || targetTime <= 0) {
    return 0;
  }

  return Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
}

function getRequestDeviceId(req) {
  const rawValue =
    req.body?.[DEVICE_ID_BODY_FIELD] ||
    req.body?.deviceId ||
    req.headers?.[DEVICE_ID_HEADER] ||
    req.query?.[DEVICE_ID_BODY_FIELD] ||
    req.query?.deviceId ||
    '';
  const deviceId = normalizeDeviceId(rawValue);

  return {
    raw: String(rawValue || '').trim(),
    deviceId,
    isValid: isValidDeviceId(deviceId),
  };
}

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

function stringifyMetadata(metadata = null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const cleaned = Object.entries(metadata).reduce((result, [key, value]) => {
    if (typeof value === 'undefined') {
      return result;
    }
    result[key] = value;
    return result;
  }, {});

  if (!Object.keys(cleaned).length) {
    return null;
  }

  return JSON.stringify(cleaned);
}

function normalizeLimitRow(row, deviceId) {
  if (!row) {
    return {
      blocked: false,
      device_id: normalizeDeviceId(deviceId),
      expires_at: null,
      retry_after_seconds: 0,
    };
  }

  return {
    blocked: true,
    id: Number(row.id),
    device_id: normalizeDeviceId(row.device_id || deviceId),
    ip: normalizeIp(row.ip || ''),
    browser: row.browser || null,
    reason: String(row.reason || '').trim(),
    contact_value: row.contact_value || null,
    customer_nickname: row.customer_nickname || null,
    store_key: row.store_key || null,
    expires_at: row.expires_at,
    metadata_json: row.metadata_json || null,
    created_at: row.created_at,
    retry_after_seconds: getRetryAfterSeconds(row.expires_at),
  };
}

function normalizeDeviceStatusRow(status, deviceId) {
  const normalizedDeviceId = normalizeDeviceId(status?.device_id || deviceId);
  if (!status || !status.is_blocked) {
    return {
      blocked: false,
      device_id: normalizedDeviceId,
      expires_at: status?.blocked_until || null,
      retry_after_seconds: 0,
      block_type: status?.block_type || 'none',
      is_permanent: Boolean(status?.is_permanent),
      reason: status?.reason || null,
      remark: status?.remark || null,
      source: status?.source || null,
      store_key: status?.source_store_key || null,
      blocked_at: status?.blocked_at || null,
      last_block_started_at: status?.blocked_at || null,
    };
  }

  return {
    blocked: true,
    device_id: normalizedDeviceId,
    expires_at: status.blocked_until || null,
    retry_after_seconds: status.is_permanent ? 0 : Math.max(0, Number(status.remaining_seconds || 0)),
    block_type: status.block_type || 'none',
    is_permanent: Boolean(status.is_permanent),
    reason: status.reason || null,
    remark: status.remark || null,
    source: status.source || null,
    store_key: status.source_store_key || null,
    blocked_at: status.blocked_at || null,
    last_block_started_at: status.blocked_at || null,
    last_operator_user_id: status.last_operator_user_id || null,
    last_operator_username: status.last_operator_username || null,
    last_operator_name: status.last_operator_name || null,
  };
}

async function getLatestDeviceBlock(deviceId, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return null;
  }

  const executor = createExecutor(options.conn);
  const rows = await executor.select(
    `SELECT
      id,
      ip,
      device_id,
      browser,
      reason,
      contact_value,
      customer_nickname,
      store_key,
      expires_at,
      metadata_json,
      created_at
     FROM order_limits
     WHERE device_id = :device_id
       AND limit_type = :limit_type
     ORDER BY id DESC
     LIMIT 1`,
    {
      device_id: normalized,
      limit_type: ORDER_LIMIT_TYPES.DEVICE_BLOCK,
    }
  );

  return rows[0] || null;
}

async function getRawBlockedDeviceInfo(deviceId, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return {
      blocked: false,
      device_id: normalized,
      expires_at: null,
      retry_after_seconds: 0,
    };
  }

  const executor = createExecutor(options.conn);
  const rows = await executor.select(
    `SELECT
      id,
      ip,
      device_id,
      browser,
      reason,
      contact_value,
      customer_nickname,
      store_key,
      expires_at,
      metadata_json,
      created_at
     FROM order_limits
     WHERE device_id = :device_id
       AND limit_type = :limit_type
       AND expires_at IS NOT NULL
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY expires_at DESC, id DESC
     LIMIT 1`,
    {
      device_id: normalized,
      limit_type: ORDER_LIMIT_TYPES.DEVICE_BLOCK,
    }
  );

  return normalizeLimitRow(rows[0], normalized);
}

async function getBlockedDeviceInfo(deviceId, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return {
      blocked: false,
      device_id: normalized,
      expires_at: null,
      retry_after_seconds: 0,
    };
  }

  const deviceStatus = await getDeviceStatus(normalized, options);
  if (deviceStatus.exists) {
    return normalizeDeviceStatusRow(deviceStatus, normalized);
  }

  return getRawBlockedDeviceInfo(normalized, options);
}

async function isBlockedDevice(deviceId, options = {}) {
  const blockInfo = await getBlockedDeviceInfo(deviceId, options);
  return blockInfo.blocked;
}

async function clearOrExpireDeviceBlock(deviceId) {
  const normalized = normalizeDeviceId(deviceId);
  const activeBlock = await getBlockedDeviceInfo(normalized);
  if (activeBlock.blocked) {
    return activeBlock;
  }

  const deviceStatus = await getDeviceStatus(normalized);
  if (deviceStatus.exists) {
    return normalizeDeviceStatusRow(deviceStatus, normalized);
  }

  const latestBlock = await getLatestDeviceBlock(normalized);
  return {
    blocked: false,
    device_id: normalized,
    expires_at: latestBlock?.expires_at || null,
    last_block_started_at: latestBlock?.created_at || null,
    retry_after_seconds: 0,
  };
}

async function getDeviceInvalidAttemptCount(deviceId, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return 0;
  }

  const latestBlock = options.latestBlock || (await getLatestDeviceBlock(normalized, options));
  const executor = createExecutor(options.conn);
  const params = {
    device_id: normalized,
    limit_type: ORDER_LIMIT_TYPES.INVALID_ATTEMPT,
    window_start: new Date(Date.now() - FRAUD_DEVICE_BLOCK_MINUTES * 60 * 1000),
  };

  let sinceClause = 'AND created_at >= :window_start';
  if (latestBlock?.created_at) {
    sinceClause += ' AND created_at > :since_time';
    params.since_time = latestBlock.created_at;
  }

  const rows = await executor.select(
    `SELECT COUNT(*) AS total
     FROM order_limits
     WHERE device_id = :device_id
       AND limit_type = :limit_type
       ${sinceClause}`,
    params
  );

  return Number(rows[0]?.total || 0);
}

async function insertOrderLimitEvent(limitType, context = {}, options = {}) {
  const executor = createExecutor(options.conn);
  const normalizedDeviceId = normalizeDeviceId(context.device_id);
  const expiresAt = context.expires_at || null;

  await executor.execute(
    `INSERT INTO order_limits
      (
        order_id,
        ip,
        device_id,
        browser,
        limit_type,
        reason,
        contact_value,
        customer_nickname,
        store_key,
        expires_at,
        metadata_json
      )
     VALUES
      (
        :order_id,
        :ip,
        :device_id,
        :browser,
        :limit_type,
        :reason,
        :contact_value,
        :customer_nickname,
        :store_key,
        :expires_at,
        :metadata_json
      )`,
    {
      order_id: context.order_id ? Number(context.order_id) : null,
      ip: normalizeIp(context.ip || ''),
      device_id: isValidDeviceId(normalizedDeviceId) ? normalizedDeviceId : null,
      browser: context.browser ? String(context.browser).slice(0, 255) : null,
      limit_type: limitType,
      reason: String(context.reason || limitType).slice(0, 255),
      contact_value: context.contact_value ? String(context.contact_value).slice(0, 120) : null,
      customer_nickname: context.customer_nickname ? String(context.customer_nickname).slice(0, 80) : null,
      store_key: context.store_key ? String(context.store_key).slice(0, 80) : null,
      expires_at: expiresAt,
      metadata_json: stringifyMetadata(context.metadata),
    }
  );
}

async function recordInvalidAttempt(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  await insertOrderLimitEvent(
    ORDER_LIMIT_TYPES.INVALID_ATTEMPT,
    {
      ...context,
      device_id: normalized,
    },
    options
  );

  await recordDeviceAbnormalActivity(
    normalized,
    {
      source: context.source || context.source_domain || context.store_key || null,
      source_store_key: context.store_key || null,
      last_abnormal_at: new Date(),
      last_abnormal_count: context.metadata?.attempt_count || context.attempt_count || 0,
      last_abnormal_reason: context.contact_assessment?.reasonSummary || context.reason || 'invalid contact attempt',
    },
    options
  );

  return {
    device_id: normalized,
  };
}

async function blockDeviceFor5Minutes(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return {
      blocked: false,
      device_id: normalized,
      expires_at: null,
      retry_after_seconds: 0,
    };
  }

  const durationMinutes = Math.max(
    1,
    Number(options.minutes || context.duration_minutes || FRAUD_DEVICE_BLOCK_MINUTES)
  );
  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

  await insertOrderLimitEvent(
    ORDER_LIMIT_TYPES.DEVICE_BLOCK,
    {
      ...context,
      device_id: normalized,
      expires_at: blockedUntil,
    },
    options
  );

  await applyAutomaticDeviceBlock(
    normalized,
    {
      source: context.source || context.source_domain || context.store_key || null,
      source_store_key: context.store_key || null,
      last_abnormal_at: new Date(),
      last_abnormal_count:
        context.metadata?.trigger_attempt_count ||
        context.metadata?.attempt_count ||
        context.attempt_count ||
        FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT,
      last_abnormal_reason: context.contact_assessment?.reasonSummary || context.reason || 'device blocked',
      block_started_at: new Date(),
      blocked_until: blockedUntil,
      duration_minutes: durationMinutes,
      reason: context.contact_assessment?.reasonSummary || context.reason || 'device blocked',
      trigger: context.metadata?.rule || 'invalid_contact',
    },
    options
  );

  return {
    blocked: true,
    device_id: normalized,
    duration_minutes: durationMinutes,
    expires_at: blockedUntil,
    retry_after_seconds: durationMinutes * 60,
  };
}

async function recordBlockedAttempt(deviceId, context = {}, options = {}) {
  const normalized = normalizeDeviceId(deviceId);
  await insertOrderLimitEvent(
    ORDER_LIMIT_TYPES.DEVICE_BLOCK_HIT,
    {
      ...context,
      device_id: normalized,
      expires_at: context.expires_at || null,
    },
    options
  );

  return {
    device_id: normalized,
  };
}

async function recordMissingDeviceId(context = {}) {
  await insertOrderLimitEvent(ORDER_LIMIT_TYPES.MISSING_DEVICE_ID, context);
}

function buildRiskMetadata(context = {}, attemptCount) {
  const contactAssessment = context.contact_assessment || {};
  return {
    attempt_count: attemptCount,
    blocked_minutes: FRAUD_DEVICE_BLOCK_MINUTES,
    contact_type: contactAssessment.contactType || null,
    reasons: Array.isArray(contactAssessment.reasons) ? contactAssessment.reasons : [],
    reason_summary: contactAssessment.reasonSummary || null,
    rule: Array.isArray(contactAssessment.reasons) && contactAssessment.reasons.length
      ? contactAssessment.reasons.join(',')
      : 'invalid_contact',
    source_domain: context.source_domain || null,
    source: context.source || context.source_domain || context.store_key || null,
    runtime_mode: context.runtime_mode || null,
    is_anonymous: Number(context.is_anonymous) ? 1 : 0,
  };
}

async function handleInvalidContactAttempt(deviceId, context = {}) {
  const normalized = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalized)) {
    return {
      action: 'device_required',
      attemptCount: 0,
      message: DEVICE_ID_REQUIRED_MESSAGE,
    };
  }

  return transaction(async (conn) => {
    const activeBlock = await getBlockedDeviceInfo(normalized, { conn });
    if (activeBlock.blocked) {
      return {
        action: 'blocked',
        attemptCount: FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT,
        message: BLOCKED_DEVICE_MESSAGE,
        blockInfo: activeBlock,
      };
    }

    const latestBlock = await getLatestDeviceBlock(normalized, { conn });
    const previousCount = await getDeviceInvalidAttemptCount(normalized, { conn, latestBlock });
    const attemptCount = previousCount + 1;
    const metadata = buildRiskMetadata(context, attemptCount);

    if (attemptCount < FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT) {
      await recordInvalidAttempt(
        normalized,
        {
          ...context,
          device_id: normalized,
          reason: context.contact_assessment?.reasonSummary || 'invalid contact attempt',
          metadata,
        },
        { conn }
      );

      return {
        action: 'invalid',
        attemptCount,
        remainingAttempts: FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT - attemptCount,
        message: INVALID_CONTACT_MESSAGE,
      };
    }

    const blockInfo = await blockDeviceFor5Minutes(
      normalized,
      {
        ...context,
        device_id: normalized,
        reason: context.contact_assessment?.reasonSummary || 'device blocked for invalid contact',
        metadata: {
          ...metadata,
          trigger_attempt_count: attemptCount,
        },
      },
      { conn }
    );

    return {
      action: 'blocked',
      attemptCount,
      message: BLOCKED_DEVICE_MESSAGE,
      blockInfo,
    };
  });
}

function validateContact(contact) {
  return evaluateContact(contact);
}

module.exports = {
  BLOCKED_DEVICE_MESSAGE,
  DEVICE_ID_BODY_FIELD,
  DEVICE_ID_HEADER,
  DEVICE_ID_REQUIRED_MESSAGE,
  FRAUD_DEVICE_BLOCK_MINUTES,
  FRAUD_DEVICE_INVALID_ATTEMPT_LIMIT,
  INVALID_CONTACT_MESSAGE,
  ORDER_LIMIT_TYPES,
  blockDeviceFor5Minutes,
  clearOrExpireDeviceBlock,
  evaluateContact,
  getBlockedDeviceInfo,
  getDeviceInvalidAttemptCount,
  getRequestDeviceId,
  getRetryAfterSeconds,
  handleInvalidContactAttempt,
  isBlockedDevice,
  isObviousFakePhone,
  isObviousFakeWechat,
  isSuspiciousContact,
  isValidChinaMobile,
  isValidDeviceId,
  isValidWechat,
  normalizeDeviceId,
  normalizeIp,
  recordBlockedAttempt,
  recordInvalidAttempt,
  recordMissingDeviceId,
  validateContact,
};
