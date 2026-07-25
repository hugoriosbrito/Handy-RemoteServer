# Handy Remote: Experimental Architecture

> **Unofficial proof of concept.** This document describes an experimental
> extension of [Handy](https://github.com/cjpais/Handy), not a supported mobile
> product or a public distribution.

## Principle

The original Handy desktop application remains the primary workflow. The mobile
client is an experimental remote interface to the same desktop process, local
models, settings, and history; it does not replace the desktop application.

## Structure

```text
src/                         Original desktop UI
src-tauri/src/
  post_processing/           Shared post-processing pipeline
  remote/                    Experimental in-process Axum server
mobile/                      Experimental Expo/React Native client
packages/
  contracts/                 Zod API schemas
  api-client/                Typed HTTP client
  design-tokens/             Shared design tokens
  i18n/                      Shared translations
```

## Remote server (`src-tauri/src/remote`)

The server runs inside the Tauri desktop process. Its development default port
is `8765`.

| Method           | Route                      | Access                                                               |
| ---------------- | -------------------------- | -------------------------------------------------------------------- |
| `GET`            | `/v1/health`               | Public                                                               |
| `GET`            | `/v1/server`               | Public                                                               |
| `POST`           | `/v1/pairing/sessions`     | Public, rate limited                                                 |
| `POST`           | `/v1/pairing/claim`        | QR secret, rate limited                                              |
| `GET`            | `/v1/pairing/sessions/:id` | Public, rate limited; credentials appear only after desktop approval |
| `POST`           | `/v1/auth/refresh`         | Refresh token, rate limited                                          |
| `GET`            | `/v1/auth/session`         | Bearer token                                                         |
| `GET` / `DELETE` | `/v1/devices`              | Bearer token                                                         |
| `POST`           | `/v1/transcriptions`       | Bearer token, multipart WAV                                          |
| `GET`            | `/v1/post-processing`      | Bearer token; API keys are never sent to the phone                   |
| `GET` / `DELETE` | `/v1/history`              | Bearer token                                                         |

Pairing approval is not an HTTP endpoint. The desktop performs it through the
`approve_remote_pairing_session` Tauri command, while the phone polls
`GET /v1/pairing/sessions/:id` for the result. The server shares the initialized
`TranscriptionManager`, `ModelManager`, and `HistoryManager` with the desktop.

## Desktop settings

The **Mobile Access** desktop settings expose these experimental options:

- `remote_server_enabled` (off by default)
- `remote_server_port` (default `8765`)
- `remote_local_network_enabled`
- `remote_access_enabled`
- `remote_device_approval_required`

Enabling the server does not make it suitable for public internet access. See
[FORK.md](../FORK.md#security-posture) before testing a connection.

## Mobile client (`mobile/`)

The companion client uses Expo Router and TypeScript. Its proof-of-concept flow
covers onboarding, QR scanning, desktop approval, microphone permission,
recording, reconnecting, results, history, paired computers, offline queueing,
and settings.

## Post-processing

Post-processing was extracted from `actions.rs` into
`src-tauri/src/post_processing/`. Desktop and remote paths share
`process_transcription_output`; provider API keys remain on the desktop.

## Local evaluation

```bash
# Desktop
bun install
bun run tauri dev

# Enable Mobile Access in Settings, then verify the loopback listener
curl http://127.0.0.1:8765/v1/health

# Mobile, in a second terminal
cd mobile
bun install
bun run start
```

Use only devices and networks you control. The transport is plain HTTP and no
TLS is provided by this extension.

## Versioning and distribution

The application metadata currently uses version `0.9.7`. This is an internal
development identifier, not a supported public release. The `v0.9.7` tag is
kept for historical traceability, while its GitHub Release was removed.

No GitHub Release, updater feed, signed package, or public download is
supported for this proof of concept. The repository contains release automation
from earlier development work, but it must not be dispatched or treated as
authorization to distribute artifacts.

For the complete compatibility, security, and upstream-sync rules, see
[FORK.md](../FORK.md).
