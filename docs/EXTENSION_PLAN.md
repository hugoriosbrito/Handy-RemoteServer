# Adjustment Plan — Handy Remote Server as an extension of Handy

> Update of the earlier plan, after auditing the fork's code against upstream
> (`cjpais/Handy`). Stated goal: **keep the fork an additive extension, without
> breaking Handy's original code or flow.**

## 1. Where the fork stands today

- Remotes: `origin` = `hugoriosbrito/Handy-RemoteServer`, `upstream` = `cjpais/Handy`.
- `merge-base` = `390729a`; the fork is **ahead of upstream and 0 commits behind** — in sync.
- Diff `upstream/main...HEAD`, excluding `mobile/`: **110 files, +6603 / −477**.
- Mobile app (`mobile/`): **65 new files, +11025** — 100% additive, zero conflict risk.
- Remote backend (`src-tauri/src/remote/`): ~1,500 Rust lines across 16 files; the largest
  are `routes/transcriptions.rs` (437 l.), `auth.rs` (330 l.), `dto.rs` (213 l.).
- New shared packages: `packages/contracts`, `packages/api-client`,
  `packages/design-tokens` — also additive.

**Conclusion:** the overwhelming majority of the fork is already an extension. The
compatibility problem is concentrated in the few upstream files that were touched.

## 2. Footprint in upstream files (conflict risk at the next sync)

| Upstream file | Fork change | Risk |
| --- | --- | --- |
| `src-tauri/src/actions.rs` | −399 lines: post-processing extracted into `post_processing/service.rs` (+407) | **High** |
| `src/components/settings/HistorySettings.tsx` | Dropped `convertFileSrc`/`useOsType`; always a blob URL now | Medium (intentional bug fix — see `FORK.md`) |
| `src/components/UpdateChecker.tsx` | Releases point at the fork | Medium (intentional divergence) |
| `src-tauri/Cargo.toml` | +axum, tower-http, uuid, qrcode; version 0.9.4 → 0.9.6 | Medium |
| `.github/workflows/*` | +`ci-build.yml` (112 l.), `mobile/**` and `packages/**` paths, tweaks in `main-build.yml` | Medium |
| `src-tauri/src/settings.rs` | +5 remote fields, all `#[serde(default)]`; `SoundTheme::as_str` became `pub` | Low |
| `src-tauri/src/lib.rs` | `mod post_processing; mod remote;` + init + 10 commands | Low |
| `src-tauri/src/audio_toolkit/audio/utils.rs` | +`decode_audio_to_samples`, `wav_duration_ms` | Low (additive) |
| `src-tauri/src/model_capabilities.rs` | +`"moss"` in `KNOWN_ARCHES` | Low |
| `src-tauri/src/commands/mod.rs` | +`pub mod remote;` | Low |

Positive note: the 5 post-processing unit tests that upstream keeps in `actions.rs` still
live in `actions.rs` in the fork (via a re-export of
`crate::post_processing::{is_blank_transcription, process_transcription_output}`), so the
extraction lost no coverage. `post_processing/service.rs` still has no tests of its own.

## 3. Already resolved

- **Credential persistence**: `AuthStore` writes devices + fingerprint to
  `remote_auth_store.json` (hashes only), via `portable::store_path`, and paired
  sessions now survive a desktop restart.
- **Refresh route**: `POST /v1/auth/refresh` and `GET /v1/auth/session` in
  `remote/routes/auth.rs`, registered in `routes/mod.rs`.
- **Request logging**: `log_requests` middleware.
- **Mobile**: automatic refresh in `uploadWithRetry`, `needsRepair` flag, `recording.pairingExpired` i18n key.
- **Network toggles now take effect**: bind address, session hints and manual approval
  read the corresponding settings instead of being hardcoded.
- **Transcription cache**: bounded by size and age instead of growing forever.
- **`require_auth`**: single definition shared by all routes, no longer copied across 5 files.
- **Poisoned mutexes**: tolerated via `unwrap_or_else(|e| e.into_inner())` instead of panicking.
- **`Sidebar.tsx`**: original upstream item styling restored.
- **`tokio`**: back to the specific features actually used, instead of `features = ["full"]`.
- **Repo hygiene**: local fork artifacts ignored; dead re-exports left by the extraction removed.
- **`FORK.md`**: intentional divergences documented.
- **`AuthStore` is testable and tested.** Persistence sits behind a `DeviceStorage`
  trait (`InMemoryStorage` for tests, `TauriStorage` for production), so the token
  logic no longer drags an `AppHandle` into the test binary.

## 4. Open items, ordered by risk

### P0 — none open

`HistorySettings.tsx` was re-examined and kept: the blob-URL path fixes a real bug where
the asset protocol served stale audio when switching history rows. It is recorded in
`FORK.md` as an intentional divergence rather than reverted.

### P1 — fork correctness

1. **`actions.rs` extraction** is still the largest future conflict source. Two acceptable
   outcomes: (a) propose the extraction as an upstream PR (it is a clean, neutral
   refactor), or (b) shrink the footprint by keeping the functions in `actions.rs` and
   making `post_processing/service.rs` a thin wrapper consumed by the remote module.
2. **Orphan `ws.rs`**: untracked, no `mod ws;` in `routes/mod.rs`, no mobile client.
   Commit it as WIP behind a flag, or drop it from the worktree.

### P2 — quality and code standards

3. **Remote module test coverage — resolved.** The module now carries unit tests for the
   pairing state machine, the transcription cache, the QR endpoint builder, the
   credential primitives (`hash_token`, `random_token`, `six_digit_code`) and the full
   `AuthStore` lifecycle: issue, authorize, refresh rotation, refresh replay rejection,
   revocation and cross-restart persistence. The backend suite went from 140 to **161**
   tests.

   Historical note: `AuthStore` used to own an `AppHandle`, and any test that merely
   instantiated it made the test binary abort at load time on Windows with
   `STATUS_ENTRYPOINT_NOT_FOUND` (exit `0xc0000139`), before a single test ran. The fix
   was to put persistence behind the `DeviceStorage` trait, which also let a fake backend
   prove that paired devices and revocations survive a restart.

   `post_processing/service.rs` still has no tests of its own (covered indirectly through
   the re-export in `actions.rs`).
4. **i18n debt**: all 24 locales carry `sidebar.mobileAccess` and the `settings.mobileAccess`
   block; only `pt` is translated — the others still hold English text. No keys are
   missing, so this is translation debt, not a bug.
5. **`docs/assets/`** — resolved: the documentation screenshots are versioned.

## 5. Rules for keeping the fork an extension

1. **Golden rule**: new code lives in `src-tauri/src/remote/`, `mobile/`, `packages/`,
   `src/components/settings/MobileAccessSettings.tsx` and `src/remote-session-preview/`.
   An upstream file is only touched through the smallest extension point (one `mod` line,
   one menu entry, one field with `#[serde(default)]`).
2. **Never change desktop default behavior.** Every new behavior sits behind a remote
   setting that is off by default.
3. **`FORK.md`** records the intentional divergences so they are reapplied deliberately at
   each sync.
4. **Periodic upstream sync**: `git fetch upstream && git rebase upstream/main` as routine;
   while the fork is 0 commits behind, shrinking the footprint is cheap.
5. **Send neutral work upstream**: the post-processing extraction and the
   `decode_audio_to_samples`/`wav_duration_ms` helpers are natural PR candidates — anything
   merged upstream stops being merge debt.

## 6. Test plan

- `cargo fmt --check`, `cargo clippy`, `cargo test --lib` (backend).
- `bun run lint`, `bun run build`, `npx tsc --noEmit` in `mobile/`.
- Unit tests in place: `AuthStore` (issue/refresh/rotate/revoke/persistence), pairing
  (claim → approve → TTL expiry), transcription cache (cap/TTL).
- Manual E2E still pending: pairing → upload → transcription → history, restarting the
  desktop mid-flow to validate credential persistence.
- Original-flow regression: global shortcut recording, post-processing and history with
  the remote server **off**.

## 7. Non-goals

- Rewriting the mobile app or the shared packages.
- Replacing axum with another framework.
- Changing the upstream transcription pipeline.
- Publishing a release — none of this requires a new tag.

## 8. Suggested execution order

1. Decide the fate of the `actions.rs` extraction (upstream PR or thin wrapper).
2. Resolve `ws.rs`: commit as WIP behind a flag, or remove it.
3. Run the manual E2E pass (pairing → upload → transcription → history, with a desktop
   restart mid-flow).
4. Work down the i18n debt.
5. Rebase on upstream and re-check every row of the `FORK.md` table.
