'use strict';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 50;
const MAX_METADATA_KEYS = 50;
const MAX_STRING_LENGTH = 500;
const SENSITIVE_KEY_PATTERN = /(access|authorization|bearer|client_secret|credential|email|filename|file_name|mediaitemid|password|path|producturl|refresh|secret|source_uri|token)/i;

function readRequestBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('log payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safeString(value) {
  return String(value).slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 3) return '[max-depth]';
  if (value == null) return value;
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const sanitized = {};
    for (const [key, nested] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[redacted]';
      } else {
        sanitized[key] = sanitizeValue(nested, depth + 1);
      }
    }
    return sanitized;
  }
  return safeString(value);
}

function sanitizeEvent(event) {
  const raw = event && typeof event === 'object' ? event : {};
  return {
    timestamp: safeString(raw.timestamp || new Date().toISOString()),
    level: ['debug', 'info', 'warn', 'error'].includes(raw.level) ? raw.level : 'info',
    event: safeString(raw.event || 'client.unknown'),
    message: raw.message ? safeString(raw.message) : undefined,
    component: raw.component ? safeString(raw.component) : undefined,
    sessionId: raw.sessionId ? safeString(raw.sessionId) : undefined,
    page: raw.page ? sanitizeValue(raw.page) : undefined,
    metadata: raw.metadata ? sanitizeValue(raw.metadata) : undefined,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const events = Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_EVENTS) : [parsed];
    const sanitizedEvents = events.map(sanitizeEvent);

    console.log(JSON.stringify({
      marker: 'client_telemetry',
      receivedAt: new Date().toISOString(),
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
      deploymentUrl: process.env.VERCEL_URL || 'unknown',
      eventCount: sanitizedEvents.length,
      events: sanitizedEvents,
    }));

    res.status(202).json({ ok: true, accepted: sanitizedEvents.length });
  } catch (error) {
    console.error(JSON.stringify({
      marker: 'client_telemetry_error',
      receivedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    }));
    res.status(400).json({ ok: false, error: 'invalid_log_payload' });
  }
};
