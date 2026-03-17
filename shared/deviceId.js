const DEVICE_ID_HEADER = 'x-device-id';
const DEVICE_ID_BODY_FIELD = 'device_id';
const DEVICE_ID_STORAGE_KEY = 'yaojing_device_id';
const DEVICE_ID_MAX_LENGTH = 120;
const DEVICE_ID_REGEX = /^yd-[a-z0-9](?:[a-z0-9-]{14,117})$/i;

function normalizeDeviceId(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, DEVICE_ID_MAX_LENGTH);
}

function isValidDeviceId(value) {
  const normalized = normalizeDeviceId(value);
  return DEVICE_ID_REGEX.test(normalized);
}

module.exports = {
  DEVICE_ID_BODY_FIELD,
  DEVICE_ID_HEADER,
  DEVICE_ID_MAX_LENGTH,
  DEVICE_ID_REGEX,
  DEVICE_ID_STORAGE_KEY,
  isValidDeviceId,
  normalizeDeviceId,
};
