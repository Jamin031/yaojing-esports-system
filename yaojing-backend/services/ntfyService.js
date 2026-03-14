const axios = require('axios');

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const ONLINE_SOURCE = 'online';

function normalizeSource(source) {
  return String(source || '').trim().toLowerCase();
}

function isValidSource(source) {
  return SOURCE_PATTERN.test(normalizeSource(source));
}

function getNtfyBaseUrl() {
  return String(process.env.NTFY_BASE_URL || '').trim().replace(/\/+$/, '');
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

async function sendNtfyNotification({ topic, title, message, tags = [], priority = 'default' } = {}) {
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

  const payload = {
    topic,
    title: String(title || '').trim(),
    message: String(message || '').trim(),
    priority: normalizePriority(priority),
  };

  if (Array.isArray(tags) && tags.length) {
    payload.tags = tags;
  }

  try {
    await axios.post(`${baseUrl}/`, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: Number(process.env.NTFY_TIMEOUT_MS || 5000),
      validateStatus: (status) => status >= 200 && status < 400,
    });

    return { sent: true, skipped: false, topic };
  } catch (error) {
    console.error('[ntfy] publish failed', {
      topic,
      title: payload.title,
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

module.exports = {
  ONLINE_SOURCE,
  normalizeSource,
  isValidSource,
  getAdminLiveTopic,
  getOwnerFinishedTopic,
  sendNtfyNotification,
  normalizeStoreKey: normalizeSource,
  isValidStoreKey: isValidSource,
};
