#!/usr/bin/env bun
/**
 * End-to-end pairing smoke test against a running Handy remote server.
 * Simulates what the mobile app does after scanning a QR code.
 */
const BASE = process.env.HANDY_REMOTE_URL ?? 'http://127.0.0.1:8765';

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log('== Handy Remote E2E pairing ==');
  console.log('health', await json('/v1/health'));
  console.log('server', await json('/v1/server'));

  const session = await json('/v1/pairing/sessions', { method: 'POST' });
  console.log('session', {
    sessionId: session.sessionId,
    code: session.code,
    endpoints: session.qr?.endpoints,
  });

  const claim = await json('/v1/pairing/claim', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: session.sessionId,
      secret: session.qr.secret,
      deviceName: 'E2E Emulator',
      platform: 'android',
    }),
  });
  console.log('claim', claim);

  const pending = await json(`/v1/pairing/sessions/${session.sessionId}`);
  console.log('status(before approve)', pending.status);

  const approved = await json('/v1/pairing/approve', {
    method: 'POST',
    body: JSON.stringify({ sessionId: session.sessionId, approve: true }),
  });
  console.log('approve', {
    status: approved.status,
    deviceId: approved.credentials?.deviceId,
  });

  const token = approved.credentials.accessToken;
  const devices = await json('/v1/devices', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('devices', devices);

  const history = await json('/v1/history', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('history count', Array.isArray(history) ? history.length : history);

  const pp = await json('/v1/post-processing', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('post-processing', {
    available: pp.available,
    configured: pp.configured,
    prompts: pp.prompts?.length,
  });

  // Emit QR payload for emulator deep-link injection
  const payload = JSON.stringify(session.qr);
  console.log('QR_PAYLOAD=' + payload);
  console.log('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
