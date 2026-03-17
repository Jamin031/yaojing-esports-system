const FINGERPRINT_HASH_HEADER = 'x-fingerprint-hash';
const FINGERPRINT_HASH_BODY_FIELD = 'fingerprint_hash';
const FINGERPRINT_HASH_MAX_LENGTH = 128;
const FINGERPRINT_HASH_REGEX = /^[a-f0-9]{32,128}$/i;

function normalizeFingerprintHash(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .slice(0, FINGERPRINT_HASH_MAX_LENGTH);
}

function isValidFingerprintHash(value) {
  const normalized = normalizeFingerprintHash(value);
  return FINGERPRINT_HASH_REGEX.test(normalized);
}

function maskFingerprintHash(value, prefix = 8, suffix = 6) {
  const normalized = normalizeFingerprintHash(value);
  if (!normalized) {
    return '';
  }
  if (normalized.length <= prefix + suffix) {
    return normalized;
  }
  return `${normalized.slice(0, prefix)}...${normalized.slice(-suffix)}`;
}

module.exports = {
  FINGERPRINT_HASH_BODY_FIELD,
  FINGERPRINT_HASH_HEADER,
  FINGERPRINT_HASH_MAX_LENGTH,
  FINGERPRINT_HASH_REGEX,
  isValidFingerprintHash,
  maskFingerprintHash,
  normalizeFingerprintHash,
};
