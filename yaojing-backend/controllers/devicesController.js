const { buildPagination, ok, fail } = require('../utils/http');
const { hasButtonPermission, hasPagePermission } = require('../middleware/permissions');
const { writeOperationLog } = require('../utils/operationLog');
const {
  blockDevice,
  getDeviceStatus,
  listDeviceLogs,
  listDeviceSources,
  listDevices,
  unblockDevice,
} = require('../services/deviceRiskService');
const { isValidDeviceId, normalizeDeviceId } = require('../../shared/deviceId');

const ALLOWED_BLOCK_MINUTES = new Set([3, 5, 10, 30, 60, 1440]);
const DEVICE_MANAGEMENT_PAGE_PERMISSION = 'page.device_management.view';
const DEVICE_MANAGEMENT_BLOCK_PERMISSION = 'api.device_management.block';
const DEVICE_MANAGEMENT_UNBLOCK_PERMISSION = 'api.device_management.unblock';

function canViewDevices(user) {
  return hasPagePermission(user, DEVICE_MANAGEMENT_PAGE_PERMISSION);
}

function canBlockDevices(user) {
  return canViewDevices(user) && hasButtonPermission(user, DEVICE_MANAGEMENT_BLOCK_PERMISSION);
}

function canUnblockDevices(user) {
  return canViewDevices(user) && hasButtonPermission(user, DEVICE_MANAGEMENT_UNBLOCK_PERMISSION);
}

function parsePermanentFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  const text = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'permanent', 'forever'].includes(text);
}

function resolveDuration(body = {}) {
  const raw = body.duration_minutes ?? body.duration ?? body.minutes ?? body.block_minutes ?? body.block_duration;
  const permanent = parsePermanentFlag(body.is_permanent ?? raw);
  if (permanent) {
    return {
      isPermanent: true,
      durationMinutes: null,
    };
  }

  const durationMinutes = Number(raw);
  if (!ALLOWED_BLOCK_MINUTES.has(durationMinutes)) {
    return null;
  }

  return {
    isPermanent: false,
    durationMinutes,
  };
}

function resolveDeviceId(value) {
  const deviceId = normalizeDeviceId(value);
  return {
    deviceId,
    isValid: isValidDeviceId(deviceId),
  };
}

function pickReason(body = {}) {
  return String(body.reason || '').trim() || null;
}

function pickRemark(body = {}) {
  return String(body.remark || body.note || body.memo || '').trim() || null;
}

async function listDeviceProfiles(req, res) {
  if (!canViewDevices(req.user)) {
    return fail(res, '权限不足', 403);
  }

  const { page, pageSize } = buildPagination(req.query, 20, 100);
  const payload = await listDevices({
    page,
    pageSize,
    status: req.query.status,
    source: req.query.source,
    keyword: req.query.keyword || req.query.device_id || req.query.deviceId,
  });

  return ok(res, payload, '设备列表获取成功');
}

async function getDeviceSourceOptions(req, res) {
  if (!canViewDevices(req.user)) {
    return fail(res, '权限不足', 403);
  }

  const list = await listDeviceSources();
  return ok(res, { list, total: list.length }, '设备来源选项获取成功');
}

async function getDeviceProfile(req, res) {
  if (!canViewDevices(req.user)) {
    return fail(res, '权限不足', 403);
  }

  const { deviceId, isValid } = resolveDeviceId(req.params.deviceId);
  if (!isValid) {
    return fail(res, 'device_id 无效', 400);
  }

  const status = await getDeviceStatus(deviceId);
  if (!status.exists) {
    return fail(res, '设备不存在', 404);
  }

  return ok(res, status, '设备详情获取成功');
}

async function getDeviceOperationLogs(req, res) {
  if (!canViewDevices(req.user)) {
    return fail(res, '权限不足', 403);
  }

  const { deviceId, isValid } = resolveDeviceId(req.params.deviceId);
  if (!isValid) {
    return fail(res, 'device_id 无效', 400);
  }

  const { page, pageSize } = buildPagination(req.query, 10, 100);
  const payload = await listDeviceLogs(deviceId, { page, pageSize });
  return ok(res, payload, '设备操作日志获取成功');
}

async function blockDeviceProfile(req, res) {
  if (!canBlockDevices(req.user)) {
    return fail(res, '权限不足', 403);
  }

  const { deviceId, isValid } = resolveDeviceId(req.params.deviceId);
  if (!isValid) {
    return fail(res, 'device_id 无效', 400);
  }

  const duration = resolveDuration(req.body || {});
  if (!duration) {
    return fail(res, '封禁时长仅支持 3 分钟、5 分钟、10 分钟、30 分钟、1 小时、24 小时或永久拉黑', 400);
  }

  const before = await getDeviceStatus(deviceId);
  const after = await blockDevice(deviceId, {
    duration_minutes: duration.durationMinutes,
    is_permanent: duration.isPermanent,
    reason: pickReason(req.body),
    remark: pickRemark(req.body),
    source: req.body?.source || before.source || null,
    source_store_key: req.body?.source_store_key || before.source_store_key || null,
    operator: req.user,
  });

  const actionCode = duration.isPermanent ? 'devices.permanent_block' : 'devices.block';
  await writeOperationLog(req, {
    action: actionCode,
    detail: `${duration.isPermanent ? '永久拉黑' : '设备拉黑'}：${deviceId}`,
    target_type: 'device',
    target_id: deviceId,
    before,
    after,
  });

  return ok(res, after, duration.isPermanent ? '设备已永久拉黑' : '设备拉黑成功');
}

async function unblockDeviceProfile(req, res) {
  if (!canUnblockDevices(req.user)) {
    return fail(res, '权限不足', 403);
  }

  const { deviceId, isValid } = resolveDeviceId(req.params.deviceId);
  if (!isValid) {
    return fail(res, 'device_id 无效', 400);
  }

  const before = await getDeviceStatus(deviceId);
  if (before.exists && !before.is_blocked) {
    return ok(res, before, '设备当前为正常状态');
  }

  const after = await unblockDevice(deviceId, {
    reason: pickReason(req.body),
    remark: pickRemark(req.body),
    source: req.body?.source || before.source || null,
    operator: req.user,
  });

  const actionCode = before.is_permanent ? 'devices.revoke_permanent_block' : 'devices.unblock';
  await writeOperationLog(req, {
    action: actionCode,
    detail: `${before.is_permanent ? '撤回永久拉黑' : '解除设备封禁'}：${deviceId}`,
    target_type: 'device',
    target_id: deviceId,
    before,
    after,
  });

  return ok(res, after, '设备已解除封禁');
}

module.exports = {
  getDeviceOperationLogs,
  getDeviceProfile,
  getDeviceSourceOptions,
  listDeviceProfiles,
  blockDeviceProfile,
  unblockDeviceProfile,
};
