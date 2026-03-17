const { query } = require('../config/db');
const {
  isValidFingerprintHash,
  normalizeFingerprintHash,
} = require('../../shared/fingerprint');
const { isValidDeviceId, normalizeDeviceId } = require('../../shared/deviceId');

const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const REVIEW_STATUSES = Object.freeze({
  NORMAL: 'normal',
  MANUAL_REVIEW: 'manual_review',
  BLOCKED: 'blocked',
  JUNK: 'junk',
});

const RISK_RULES = Object.freeze({
  suspicious_contact: 30,
  fingerprint_high_risk_match: 40,
  fingerprint_repeat_1m: 20,
  fingerprint_abnormal_5m: 30,
  contact_repeat_5m: 20,
  garbage_order: 50,
});

const DEVICE_RISK_EVENTS_TABLE = 'device_risk_events';
const DEVICE_BLOCKS_TABLE = 'device_blocks';

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
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  return typeof maxLength === 'number' && maxLength > 0 ? text.slice(0, maxLength) : text;
}

function stringifyJson(value) {
  if (value == null) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJson(value, fallback = []) {
  if (!value) {
    return fallback;
  }
  if (Array.isArray(value)) {
    return value;
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

function normalizeRiskFlags(flags = []) {
  return Array.from(
    new Set(
      (Array.isArray(flags) ? flags : [flags])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeRiskScore(value) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.round(score));
}

function resolveRiskLevel(score) {
  const normalizedScore = normalizeRiskScore(score);
  if (normalizedScore >= 90) {
    return RISK_LEVELS.CRITICAL;
  }
  if (normalizedScore >= 60) {
    return RISK_LEVELS.HIGH;
  }
  if (normalizedScore >= 20) {
    return RISK_LEVELS.MEDIUM;
  }
  return RISK_LEVELS.LOW;
}

function resolveReviewStatus({ level, directBlocked = false, isJunk = false }) {
  if (isJunk) {
    return REVIEW_STATUSES.JUNK;
  }
  if (directBlocked) {
    return REVIEW_STATUSES.BLOCKED;
  }
  if ([RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL].includes(level)) {
    return REVIEW_STATUSES.MANUAL_REVIEW;
  }
  return REVIEW_STATUSES.NORMAL;
}

function buildRiskSnapshot({
  baseScore = 0,
  flags = [],
  fingerprintHash = '',
  isJunk = false,
  junkReason = null,
  directBlocked = false,
} = {}) {
  const score = normalizeRiskScore(baseScore);
  const normalizedFlags = normalizeRiskFlags(flags);
  const level = directBlocked ? RISK_LEVELS.CRITICAL : resolveRiskLevel(score);

  return {
    fingerprint_hash: isValidFingerprintHash(fingerprintHash) ? normalizeFingerprintHash(fingerprintHash) : null,
    risk_score: score,
    risk_level: level,
    risk_flags: normalizedFlags,
    review_status: resolveReviewStatus({ level, directBlocked, isJunk }),
    is_junk_order: isJunk ? 1 : 0,
    junk_reason: trimText(junkReason, 255),
    direct_blocked: Boolean(directBlocked),
  };
}

function buildProfileActivityStamp(row = {}) {
  return new Date(
    row.last_operation_at ||
      row.last_abnormal_at ||
      row.last_order_at ||
      row.updated_at ||
      row.created_at ||
      0
  ).getTime();
}

function isFuture(value) {
  const target = new Date(value || 0).getTime();
  return Number.isFinite(target) && target > Date.now();
}

function isManualProfileBlocked(row = {}) {
  return Number(row.manual_is_permanent || 0) === 1 || isFuture(row.manual_block_expires_at);
}

function isAutoProfileBlocked(row = {}) {
  return isFuture(row.auto_block_expires_at);
}

function isHighRiskProfile(row = {}) {
  const level = String(row.last_risk_level || '').trim().toLowerCase();
  const score = normalizeRiskScore(row.last_risk_score);
  return (
    isManualProfileBlocked(row) ||
    isAutoProfileBlocked(row) ||
    ['high', 'critical'].includes(level) ||
    score >= 60
  );
}

function buildRiskSummaryText(flags = []) {
  return normalizeRiskFlags(flags).join(', ');
}

async function getFingerprintRelatedProfile(fingerprintHash, deviceId, options = {}) {
  const normalizedFingerprint = normalizeFingerprintHash(fingerprintHash);
  if (!isValidFingerprintHash(normalizedFingerprint)) {
    return null;
  }

  const executor = createExecutor(options.conn);
  const rows = await executor.select(
    `SELECT
      device_id,
      fingerprint_hash,
      manual_is_permanent,
      manual_block_expires_at,
      auto_block_expires_at,
      last_risk_score,
      last_risk_level,
      last_risk_flags,
      last_order_id,
      last_order_no,
      last_order_at,
      last_abnormal_at,
      last_operation_at,
      updated_at,
      created_at
     FROM ${DEVICE_BLOCKS_TABLE}
     WHERE fingerprint_hash = :fingerprint_hash
       AND (:device_id = '' OR device_id <> :device_id)
     ORDER BY
      CASE
        WHEN manual_is_permanent = 1 THEN 0
        WHEN manual_block_expires_at IS NOT NULL AND manual_block_expires_at > CURRENT_TIMESTAMP THEN 1
        WHEN auto_block_expires_at IS NOT NULL AND auto_block_expires_at > CURRENT_TIMESTAMP THEN 2
        ELSE 3
      END ASC,
      COALESCE(last_risk_score, 0) DESC,
      COALESCE(last_operation_at, last_abnormal_at, last_order_at, updated_at, created_at) DESC
     LIMIT 1`,
    {
      fingerprint_hash: normalizedFingerprint,
      device_id: normalizeDeviceId(deviceId),
    }
  );

  return rows[0] || null;
}

async function getRecentFingerprintStats(fingerprintHash, options = {}) {
  const normalizedFingerprint = normalizeFingerprintHash(fingerprintHash);
  if (!isValidFingerprintHash(normalizedFingerprint)) {
    return {
      orders_1m: 0,
      abnormal_events_5m: 0,
    };
  }

  const executor = createExecutor(options.conn);
  const [orderStats] = await executor.select(
    `SELECT
      SUM(CASE WHEN created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) THEN 1 ELSE 0 END) AS orders_1m
     FROM orders
     WHERE fingerprint_hash = :fingerprint_hash
       AND is_deleted = 0`,
    {
      fingerprint_hash: normalizedFingerprint,
    }
  );

  const [eventStats] = await executor.select(
    `SELECT COUNT(*) AS abnormal_events_5m
     FROM ${DEVICE_RISK_EVENTS_TABLE}
     WHERE fingerprint_hash = :fingerprint_hash
       AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)
       AND (
         risk_score >= 30
         OR event_type IN (
           'invalid_contact_attempt',
           'device_auto_block',
           'device_block_hit',
           'fingerprint_high_risk_match',
           'fingerprint_manual_block_match',
           'garbage_order'
         )
       )`,
    {
      fingerprint_hash: normalizedFingerprint,
    }
  );

  return {
    orders_1m: Number(orderStats?.orders_1m || 0),
    abnormal_events_5m: Number(eventStats?.abnormal_events_5m || 0),
  };
}

async function getRecentContactRepeatCount(contactValue, options = {}) {
  const normalizedContact = trimText(contactValue, 128);
  if (!normalizedContact) {
    return 0;
  }

  const executor = createExecutor(options.conn);
  const rows = await executor.select(
    `SELECT COUNT(*) AS total
     FROM orders
     WHERE is_deleted = 0
       AND COALESCE(NULLIF(contact, ''), customer_contact) = :contact_value
       AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)`,
    {
      contact_value: normalizedContact,
    }
  );

  return Number(rows[0]?.total || 0);
}

async function evaluateOrderRisk(context = {}, options = {}) {
  const fingerprintHash = normalizeFingerprintHash(context.fingerprint_hash);
  const flags = [];
  let score = 0;

  if (context.contact_assessment?.isSuspicious) {
    score += RISK_RULES.suspicious_contact;
    flags.push('suspicious_contact');
  }

  const relatedProfile = await getFingerprintRelatedProfile(fingerprintHash, context.device_id, options);
  if (relatedProfile) {
    if (isManualProfileBlocked(relatedProfile)) {
      flags.push('fingerprint_manual_block_match');
      const snapshot = buildRiskSnapshot({
        baseScore: 100,
        flags,
        fingerprintHash,
        directBlocked: true,
      });

      return {
        ...snapshot,
        matched_profile: relatedProfile,
        direct_block: {
          reason: 'fingerprint_manual_block_match',
          matched_device_id: normalizeDeviceId(relatedProfile.device_id),
          matched_order_no: trimText(relatedProfile.last_order_no, 64),
        },
      };
    }

    if (isHighRiskProfile(relatedProfile)) {
      score += RISK_RULES.fingerprint_high_risk_match;
      flags.push('fingerprint_high_risk_match');
    }
  }

  const fingerprintStats = await getRecentFingerprintStats(fingerprintHash, options);
  if (fingerprintStats.orders_1m >= 2) {
    score += RISK_RULES.fingerprint_repeat_1m;
    flags.push('fingerprint_repeat_1m');
  }
  if (fingerprintStats.abnormal_events_5m >= 2) {
    score += RISK_RULES.fingerprint_abnormal_5m;
    flags.push('fingerprint_abnormal_5m');
  }

  const contactRepeatCount = await getRecentContactRepeatCount(context.contact_value, options);
  if (contactRepeatCount >= 1) {
    score += RISK_RULES.contact_repeat_5m;
    flags.push('contact_repeat_5m');
  }

  if (!isValidFingerprintHash(fingerprintHash) && trimText(context.fingerprint_status, 20) === 'failed') {
    flags.push('fingerprint_collection_failed');
  }

  return {
    ...buildRiskSnapshot({
      baseScore: score,
      flags,
      fingerprintHash,
    }),
    matched_profile: relatedProfile,
    direct_block: null,
  };
}

async function upsertDeviceRiskSnapshot(deviceId, snapshot = {}, options = {}) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!isValidDeviceId(normalizedDeviceId)) {
    return null;
  }

  const executor = createExecutor(options.conn);
  await executor.execute(
    `INSERT INTO ${DEVICE_BLOCKS_TABLE}
      (
        device_id,
        source,
        source_store_key,
        fingerprint_hash,
        last_risk_score,
        last_risk_level,
        last_risk_flags,
        last_contact_value,
        last_order_id,
        last_order_no,
        last_order_at,
        last_abnormal_at,
        last_abnormal_reason
      )
     VALUES
      (
        :device_id,
        :source,
        :source_store_key,
        :fingerprint_hash,
        :last_risk_score,
        :last_risk_level,
        :last_risk_flags,
        :last_contact_value,
        :last_order_id,
        :last_order_no,
        :last_order_at,
        :last_abnormal_at,
        :last_abnormal_reason
      )
     ON DUPLICATE KEY UPDATE
      source = COALESCE(VALUES(source), source),
      source_store_key = COALESCE(VALUES(source_store_key), source_store_key),
      fingerprint_hash = COALESCE(VALUES(fingerprint_hash), fingerprint_hash),
      last_risk_score = VALUES(last_risk_score),
      last_risk_level = VALUES(last_risk_level),
      last_risk_flags = VALUES(last_risk_flags),
      last_contact_value = COALESCE(VALUES(last_contact_value), last_contact_value),
      last_order_id = COALESCE(VALUES(last_order_id), last_order_id),
      last_order_no = COALESCE(VALUES(last_order_no), last_order_no),
      last_order_at = COALESCE(VALUES(last_order_at), last_order_at),
      last_abnormal_at = COALESCE(VALUES(last_abnormal_at), last_abnormal_at),
      last_abnormal_reason = COALESCE(VALUES(last_abnormal_reason), last_abnormal_reason),
      updated_at = CURRENT_TIMESTAMP`,
    {
      device_id: normalizedDeviceId,
      source: trimText(snapshot.source, 120),
      source_store_key: trimText(snapshot.source_store_key || snapshot.store_key, 80),
      fingerprint_hash: isValidFingerprintHash(snapshot.fingerprint_hash)
        ? normalizeFingerprintHash(snapshot.fingerprint_hash)
        : null,
      last_risk_score: normalizeRiskScore(snapshot.risk_score),
      last_risk_level: trimText(snapshot.risk_level, 32) || RISK_LEVELS.LOW,
      last_risk_flags: stringifyJson(normalizeRiskFlags(snapshot.risk_flags)),
      last_contact_value: trimText(snapshot.contact_value, 128),
      last_order_id: snapshot.order_id == null ? null : Number(snapshot.order_id),
      last_order_no: trimText(snapshot.order_no, 64),
      last_order_at: snapshot.last_order_at || null,
      last_abnormal_at: snapshot.last_abnormal_at || null,
      last_abnormal_reason: trimText(snapshot.last_abnormal_reason || buildRiskSummaryText(snapshot.risk_flags), 255),
    }
  );

  return normalizedDeviceId;
}

async function applyOrderRiskSnapshot(orderId, snapshot = {}, options = {}) {
  const executor = createExecutor(options.conn);
  await executor.execute(
    `UPDATE orders
     SET fingerprint_hash = COALESCE(:fingerprint_hash, fingerprint_hash),
         risk_score = :risk_score,
         risk_level = :risk_level,
         risk_flags = :risk_flags,
         is_junk_order = :is_junk_order,
         junk_reason = :junk_reason,
         review_status = :review_status,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :order_id`,
    {
      order_id: Number(orderId),
      fingerprint_hash: isValidFingerprintHash(snapshot.fingerprint_hash)
        ? normalizeFingerprintHash(snapshot.fingerprint_hash)
        : null,
      risk_score: normalizeRiskScore(snapshot.risk_score),
      risk_level: trimText(snapshot.risk_level, 32) || RISK_LEVELS.LOW,
      risk_flags: stringifyJson(normalizeRiskFlags(snapshot.risk_flags)),
      is_junk_order: Number(snapshot.is_junk_order || 0) ? 1 : 0,
      junk_reason: trimText(snapshot.junk_reason, 255),
      review_status: trimText(snapshot.review_status, 32) || REVIEW_STATUSES.NORMAL,
    }
  );
}

function buildRiskEventPayload(payload = {}) {
  return {
    device_id: isValidDeviceId(payload.device_id) ? normalizeDeviceId(payload.device_id) : null,
    fingerprint_hash: isValidFingerprintHash(payload.fingerprint_hash)
      ? normalizeFingerprintHash(payload.fingerprint_hash)
      : null,
    ip: trimText(payload.ip, 64),
    source: trimText(payload.source, 120),
    store_key: trimText(payload.store_key, 80),
    order_id: payload.order_id == null ? null : Number(payload.order_id),
    order_no: trimText(payload.order_no, 64),
    event_type: trimText(payload.event_type, 64),
    risk_score: normalizeRiskScore(payload.risk_score),
    risk_level: trimText(payload.risk_level, 32) || RISK_LEVELS.LOW,
    risk_flags: stringifyJson(normalizeRiskFlags(payload.risk_flags)),
    contact_value: trimText(payload.contact_value, 128),
    customer_name: trimText(payload.customer_name || payload.customer_nickname, 80),
    meta_json: stringifyJson(payload.meta_json || payload.meta || null),
  };
}

async function recordDeviceRiskEvent(payload = {}, options = {}) {
  const eventPayload = buildRiskEventPayload(payload);
  const executor = createExecutor(options.conn);

  await executor.execute(
    `INSERT INTO ${DEVICE_RISK_EVENTS_TABLE}
      (
        device_id,
        fingerprint_hash,
        ip,
        source,
        store_key,
        order_id,
        order_no,
        event_type,
        risk_score,
        risk_level,
        risk_flags,
        contact_value,
        customer_name,
        meta_json
      )
     VALUES
      (
        :device_id,
        :fingerprint_hash,
        :ip,
        :source,
        :store_key,
        :order_id,
        :order_no,
        :event_type,
        :risk_score,
        :risk_level,
        :risk_flags,
        :contact_value,
        :customer_name,
        :meta_json
      )`,
    eventPayload
  );
}

async function recordRiskSnapshotEvents(snapshot = {}, context = {}, options = {}) {
  const flags = normalizeRiskFlags(snapshot.risk_flags);
  if (!flags.length) {
    return;
  }

  for (const flag of flags) {
    await recordDeviceRiskEvent(
      {
        device_id: context.device_id,
        fingerprint_hash: snapshot.fingerprint_hash || context.fingerprint_hash,
        ip: context.ip,
        source: context.source,
        store_key: context.store_key,
        order_id: context.order_id,
        order_no: context.order_no,
        event_type: flag,
        risk_score: snapshot.risk_score,
        risk_level: snapshot.risk_level,
        risk_flags: snapshot.risk_flags,
        contact_value: context.contact_value,
        customer_name: context.customer_name || context.customer_nickname,
        meta: {
          matched_device_id: trimText(snapshot.matched_profile?.device_id, 120),
          matched_order_no: trimText(snapshot.matched_profile?.last_order_no, 64),
          review_status: snapshot.review_status,
          direct_blocked: snapshot.direct_blocked ? 1 : 0,
          fingerprint_status: trimText(context.fingerprint_status, 20),
          fingerprint_error: trimText(context.fingerprint_error, 120),
        },
      },
      options
    );
  }
}

function mergeRiskSnapshot(current = {}, extra = {}) {
  const baseScore = normalizeRiskScore(current.risk_score) + normalizeRiskScore(extra.risk_score);
  const flags = normalizeRiskFlags([
    ...parseJson(current.risk_flags, []),
    ...normalizeRiskFlags(extra.risk_flags),
  ]);
  const isJunk = Number(extra.is_junk_order || current.is_junk_order || 0) === 1;

  return buildRiskSnapshot({
    baseScore,
    flags,
    fingerprintHash: extra.fingerprint_hash || current.fingerprint_hash,
    isJunk,
    junkReason: extra.junk_reason || current.junk_reason,
    directBlocked: Boolean(extra.direct_blocked || current.direct_blocked),
  });
}

async function listDeviceRiskEvents(filters = {}) {
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 20)));
  const offset = (page - 1) * pageSize;
  const where = ['1=1'];
  const params = {};

  const deviceId = normalizeDeviceId(filters.deviceId || filters.device_id);
  if (isValidDeviceId(deviceId)) {
    where.push('device_id = :device_id');
    params.device_id = deviceId;
  }

  const fingerprintHash = normalizeFingerprintHash(filters.fingerprint_hash || filters.fingerprintHash);
  if (isValidFingerprintHash(fingerprintHash)) {
    where.push('fingerprint_hash = :fingerprint_hash');
    params.fingerprint_hash = fingerprintHash;
  }

  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM ${DEVICE_RISK_EVENTS_TABLE}
     WHERE ${where.join(' AND ')}`,
    params
  );

  const rows = await query(
    `SELECT
      id,
      device_id,
      fingerprint_hash,
      ip,
      source,
      store_key,
      order_id,
      order_no,
      event_type,
      risk_score,
      risk_level,
      risk_flags,
      contact_value,
      customer_name,
      meta_json,
      created_at
     FROM ${DEVICE_RISK_EVENTS_TABLE}
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  return {
    list: rows.map((row) => ({
      id: Number(row.id),
      device_id: trimText(row.device_id, 120),
      fingerprint_hash: trimText(row.fingerprint_hash, 128),
      ip: trimText(row.ip, 64),
      source: trimText(row.source, 120),
      store_key: trimText(row.store_key, 80),
      order_id: row.order_id == null ? null : Number(row.order_id),
      order_no: trimText(row.order_no, 64),
      event_type: trimText(row.event_type, 64),
      risk_score: normalizeRiskScore(row.risk_score),
      risk_level: trimText(row.risk_level, 32) || RISK_LEVELS.LOW,
      risk_flags: normalizeRiskFlags(parseJson(row.risk_flags, [])),
      contact_value: trimText(row.contact_value, 128),
      customer_name: trimText(row.customer_name, 80),
      meta: parseJson(row.meta_json, null),
      created_at: row.created_at,
    })),
    total: Number(countRows[0]?.total || 0),
    page,
    pageSize,
  };
}

module.exports = {
  REVIEW_STATUSES,
  RISK_LEVELS,
  RISK_RULES,
  applyOrderRiskSnapshot,
  buildRiskSnapshot,
  buildRiskSummaryText,
  evaluateOrderRisk,
  listDeviceRiskEvents,
  mergeRiskSnapshot,
  normalizeRiskFlags,
  normalizeRiskScore,
  recordDeviceRiskEvent,
  recordRiskSnapshotEvents,
  resolveRiskLevel,
  upsertDeviceRiskSnapshot,
};
