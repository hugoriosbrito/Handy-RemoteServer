# Handy Remote Server — divergences from upstream

This repository is a fork of [`cjpais/Handy`](https://github.com/cjpais/Handy).
The stated intent is for it to be an **additive extension**: original Handy keeps
behaving exactly as before whenever the remote server is off, which is the
default.

This file exists so that every sync with upstream is a deliberate decision rather
than diff archaeology.

## Golden rule

New code lives in:

- `src-tauri/src/remote/` — in-process HTTP server
- `src-tauri/src/post_processing/` — shared post-processing
- `mobile/` — companion app
- `packages/` — shared contracts, API client and design tokens
- `src/components/settings/MobileAccessSettings.tsx` and `src/remote-session-preview/`

An upstream file is only touched through the **smallest possible extension
point**: one `mod` line, one menu entry, one field with `#[serde(default)]`. No
desktop default behavior changes: every new behavior sits behind a remote
setting that is off by default.

## Intentional divergences

| Area | Divergence | Reason |
| --- | --- | --- |
| `src/components/UpdateChecker.tsx` | Checks fork releases, not upstream ones | The fork ships its own binaries; pointing at upstream would offer users a downgrade |
| `src-tauri/tauri.conf.json`, `Cargo.toml` | Version `0.9.7` against upstream `0.9.4` | The fork keeps its own version line |
| `.github/workflows/` | New `ci-build.yml`; `mobile/**` and `packages/**` paths in `main-build.yml` | Upstream has neither a mobile app nor workspaces to build |
| `src-tauri/src/actions.rs` | ~399 post-processing lines extracted into `post_processing/service.rs` | The remote server has to reuse the pipeline without going through the UI path. Upstream tests still live in `actions.rs` via re-export, so no coverage was lost. **Largest source of rebase conflict** — an upstream PR candidate, since it is a behavior-neutral refactor |
| `src/components/settings/HistorySettings.tsx` | History audio always served through a blob URL; `convertFileSrc`/`useOsType` removed | Fix for a real bug: the asset protocol served stale audio when switching between history rows. **Do not revert** without reproducing that bug first |
| `src-tauri/src/settings.rs` | +5 `remote_*` fields, all `#[serde(default)]`; `SoundTheme::as_str` became `pub` | Additive; an upstream store still deserializes |
| `src-tauri/src/audio_toolkit/audio/utils.rs` | +`decode_audio_to_samples`, `wav_duration_ms` | Additive; upstream PR candidate |
| `src-tauri/src/model_capabilities.rs` | +`"moss"` in `KNOWN_ARCHES` | Additive; upstream PR candidate |
| `src-tauri/Cargo.toml` | +axum, tower-http, uuid, qrcode | Remote server dependencies |

## Security posture

The remote server is designed for a LAN or a private tunnel, and that assumption is
load-bearing:

- **Plain HTTP, no TLS.** Bearer tokens and transcription payloads cross the wire in the
  clear. On a trusted LAN that is the intended trade-off, and over Tailscale the tunnel
  supplies the encryption. **Do not expose the port to an untrusted network.** The
  "allow local network" toggle, off by default, is what binds the listener to `0.0.0.0`
  instead of loopback.
- **Approval never travels over HTTP.** Device credentials are only minted by the desktop
  (`approve_remote_pairing_session`), or automatically on a valid claim when the user has
  explicitly turned "require device approval" off. There is deliberately no
  `POST /v1/pairing/approve`; an earlier revision had one and it let any LAN client
  approve a claimed session for itself.
- **Tokens are stored hashed and expire.** `remote_auth_store.json` only ever holds
  SHA-256 hashes. Access tokens carry an expiry and the phone rotates transparently
  through `POST /v1/auth/refresh`, which also rotates the refresh token so a leaked one
  cannot be replayed.
- **Unauthenticated routes are rate limited** per peer address: pairing session creation,
  claim and token refresh share a guessing budget, and the status endpoint the phone polls
  has its own larger one.
- **No live streaming channel.** The WebSocket preview sketch was removed rather than
  shipped half-wired; the `ws` axum feature is off.

## What should go back upstream

Anything merged upstream stops being merge debt. Natural candidates:

1. The post-processing extraction out of `actions.rs` (behavior-neutral refactor).
2. `decode_audio_to_samples` and `wav_duration_ms`.
3. `"moss"` in `KNOWN_ARCHES`.

See [AGENTS.md](AGENTS.md) for the PR workflow upstream requires — the project is
under a feature freeze and requires prior discussion in Discussions.

## Sync routine

```bash
git fetch upstream
git rebase upstream/main
```

After rebasing, re-check every row of the table above. Conflicts are expected in
`actions.rs`, `HistorySettings.tsx` and `Cargo.toml`; in any other file, a
conflict means the fork's footprint has grown past the minimal extension point
and should be shrunk back.

## Validation before committing

```bash
cd src-tauri && cargo fmt && cargo clippy && cargo test --lib
bun run lint
```

Mandatory regression of the original flow, with the remote server **off**: global
shortcut recording, post-processing and history.

> Environment note (Windows/x86_64): the `vulkan` feature of `transcribe-cpp` may
> fail to link with `LNK2019: dequant_iq4_nl_*`. That is a graphics backend
> failure, not a problem in this repository's code; to run
> `cargo check`/`clippy`/`test`, disable the feature temporarily in
> `src-tauri/Cargo.toml` and **restore it afterwards**.
