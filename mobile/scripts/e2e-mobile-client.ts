#!/usr/bin/env bun
/**
 * Simulates the mobile app pairing client against a live Handy remote server.
 * Mirrors mobile/src/api/client.ts claim + poll + history flow.
 */
const HOST_BASE = process.env.HANDY_REMOTE_URL ?? 'http://127.0.0.1:8765';

function rewriteForAndroid(base: string): string {
  // Same rewrite the mobile client applies inside the emulator.
  const url = new URL(base);
  return `http://10.0.2.2:${url.port || '8765'}`;
}

async function json(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${path} ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log('== Mobile client simulation ==');

  // Desktop creates session (as MobileAccessSettings does)
  const session = await json(HOST_BASE, '/v1/pairing/sessions', { method: 'POST' });
  const qr = session.qr;
  console.log('desktop session', { code: session.code, local: qr.endpoints.local });

  // Mobile resolves base URL like Android emulator does
  const mobileBase = rewriteForAndroid(`http://${qr.endpoints.local}`);
  console.log('mobile baseUrl', mobileBase);

  // Verify emulator-alias health via host loopback (same port after reverse)
  // For this sim we still hit HOST_BASE because 10.0.2.2 is only valid inside the guest.
  const health = await json(HOST_BASE, '/v1/health');
  console.log('health', health);

  const claim = await json(HOST_BASE, '/v1/pairing/claim', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: qr.sessionId,
      secret: qr.secret,
      deviceName: 'Android',
      platform: 'android',
    }),
  });
  console.log('claim', claim);

  // Poll like confirm.tsx
  let credentials = null;
  for (let i = 0; i < 5; i++) {
    const status = await json(HOST_BASE, `/v1/pairing/sessions/${qr.sessionId}`);
    console.log('poll', i, status.status);
    if (status.status === 'awaiting_approval' && i === 0) {
      // Desktop approves (commands.approveRemotePairingSession)
      const approved = await json(HOST_BASE, '/v1/pairing/approve', {
        method: 'POST',
        body: JSON.stringify({ sessionId: qr.sessionId, approve: true }),
      });
      console.log('desktop approve', approved.status);
    }
    if (status.status === 'approved' && status.credentials) {
      credentials = status.credentials;
      break;
    }
    // after approve, poll again
    if (i === 0) continue;
    await new Promise((r) => setTimeout(r, 200));
  }

  // One more status fetch after approve
  if (!credentials) {
    const status = await json(HOST_BASE, `/v1/pairing/sessions/${qr.sessionId}`);
    credentials = status.credentials;
    console.log('final status', status.status);
  }

  if (!credentials?.accessToken) {
    throw new Error('no credentials after approval');
  }

  const history = await json(HOST_BASE, '/v1/history', {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });
  const devices = await json(HOST_BASE, '/v1/devices', {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });
  const pp = await json(HOST_BASE, '/v1/post-processing', {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });

  console.log('connected device', credentials.deviceId);
  console.log('history', Array.isArray(history) ? history.length : history);
  console.log('devices', devices.map((d: { name: string }) => d.name));
  console.log('postProcessing.available', pp.available);
  console.log('QR_FOR_INJECT=' + encodeURIComponent(JSON.stringify(qr)));
  console.log('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
