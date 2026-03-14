const axios = require('axios');

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const ONLINE_SOURCE = 'online';

function normalizeSource(source) {
  return String(source || '').trim().toLowerCase();
}

function isValidSource(source) {
  return SOURCE_PATTERN.test(normalizeSource(source));
}

function normalizeSequenceId(sequenceId) {
  return String(sequenceId || '').trim();
}

function getNtfyBaseUrl() {
  return String(process.env.NTFY_BASE_URL || '').trim().replace(/\/+$/, '');
}

function getNtfyTimeoutMs() {
  const timeoutMs = Number(process.env.NTFY_TIMEOUT_MS || 5000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
}

function normalizePriority(priority) {
  const raw = String(priority ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'min') return 1;
  if (raw === '2' || raw === 'low') return 2;
  if (raw === '4' || raw === 'high') return 4;
  if (raw === '5' || raw === 'max' || raw === 'urgent') return 5;
  return 3;
}

function buildTopic(source, suffix) {
  const normalizedSource = normalizeSource(source);
  if (!isValidSource(normalizedSource)) {
    return '';
  }

  if (normalizedSource === ONLINE_SOURCE) {
    return `yaojing-online-${suffix}`;
  }

  return `yaojing-${normalizedSource}-${suffix}`;
}

function getAdminLiveTopic(source) {
  return buildTopic(source, 'admin-live');
}

function getOwnerFinishedTopic(source) {
  return buildTopic(source, 'owner-finished');
}

function clipLogValue(value) {
  if (typeof value === 'string') {
    return value.length > 280 ? `${value.slice(0, 277)}...` : value;
  }
  return value;
}

function buildAxiosConfig() {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: getNtfyTimeoutMs(),
    validateStatus: (status) => status >= 200 && status < 400,
  };
}

async function sendNtfyNotification({
  topic,
  title,
  message,
  tags = [],
  priority = 'default',
  sequenceId = '',
} = {}) {
  const baseUrl = getNtfyBaseUrl();
  if (!baseUrl) {
    console.warn('[ntfy] NTFY_BASE_URL is not configured, skipping notification', {
      topic,
      title,
    });
    return { sent: false, skipped: true, reason: 'base_url_missing' };
  }

  if (!topic) {
    console.warn('[ntfy] topic is empty, skipping notification', { title });
    return { sent: false, skipped: true, reason: 'topic_missing' };
  }

  const normalizedSequenceId = normalizeSequenceId(sequenceId);
  const payload = {
    topic,
    title: String(title || '').trim(),
    message: String(message || '').trim(),
    priority: normalizePriority(priority),
  };

  if (Array.isArray(tags) && tags.length) {
    payload.tags = tags;
  }

  if (normalizedSequenceId) {
    payload.sequence_id = normalizedSequenceId;
  }

  try {
    await axios.post(`${baseUrl}/`, payload, buildAxiosConfig());
    return {
      sent: true,
      skipped: false,
      topic,
      sequence_id: normalizedSequenceId || null,
    };
  } catch (error) {
    console.error('[ntfy] publish failed', {
      topic,
      title: payload.title,
      sequence_id: normalizedSequenceId || null,
      status: error?.response?.status || null,
      message: error?.message || 'unknown_error',
      response: clipLogValue(
        typeof error?.response?.data === 'string'
          ? error.response.data
          : JSON.stringify(error?.response?.data || {})
      ),
    });
    return { sent: false, skipped: false, reason: 'request_failed' };
  }
}

async function deleteNtfyNotification({ topic, sequenceId } = {}) {
  const baseUrl = getNtfyBaseUrl();
  if (!baseUrl) {
    console.warn('[ntfy] NTFY_BASE_URL is not configured, skipping delete', {
      topic,
      sequence_id: normalizeSequenceId(sequenceId) || null,
    });
    return { deleted: false, skipped: true, reason: 'base_url_missing' };
  }

  if (!topic) {
    console.warn('[ntfy] topic is empty, skipping delete', {
      sequence_id: normalizeSequenceId(sequenceId) || null,
    });
    return { deleted: false, skipped: true, reason: 'topic_missing' };
  }

  const normalizedSequenceId = normalizeSequenceId(sequenceId);
  if (!normalizedSequenceId) {
    console.warn('[ntfy] sequence_id is empty, skipping delete', { topic });
    return { deleted: false, skipped: true, reason: 'sequence_id_missing' };
  }

  try {
    await axios.delete(
      `${baseUrl}/${encodeURIComponent(topic)}/${encodeURIComponent(normalizedSequenceId)}`,
      buildAxiosConfig()
    );
    return {
      deleted: true,
      skipped: false,
      topic,
      sequence_id: normalizedSequenceId,
    };
  } catch (error) {
    console.error('[ntfy] delete failed', {
      topic,
      sequence_id: normalizedSequenceId,
      status: error?.response?.status || null,
      message: error?.message || 'unknown_error',
      response: clipLogValue(
        typeof error?.response?.data === 'string'
          ? error.response.data
          : JSON.stringify(error?.response?.data || {})
      ),
    });
    return { deleted: false, skipped: false, reason: 'request_failed' };
  }
}

module.exports = {
  ONLINE_SOURCE,
  normalizeSource,
  isValidSource,
  normalizeSequenceId,
  getAdminLiveTopic,
  getOwnerFinishedTopic,
  sendNtfyNotification,
  deleteNtfyNotification,
  normalizeStoreKey: normalizeSource,
  isValidStoreKey: isValidSource,
};
