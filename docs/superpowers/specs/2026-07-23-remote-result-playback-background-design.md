# Design: Result screen + audio playback + reprocessing + Android background recording

Date: 2026-07-23
Scope: Handy Remote mobile app (`mobile/`) + desktop remote server (`src-tauri/src/remote/`)

## Problem

Follow-up bugs/requests on the Handy Remote mobile client:

1. **Result screen** shows the raw model file path instead of a friendly name, the
   transcript box can't be scrolled (long text is clipped), and the audio time shows
   `00:00`.
2. **Audio playback doesn't work.** In streaming mode the recorder rotates and
   discards 4s chunks, so no full audio file survives locally. The desktop already
   saves the full 16 kHz WAV per history entry, but there is no endpoint to fetch it.
3. **The "Mais" (…) button** duplicates Copy/Share. The user wants it to hold two
   real actions: **Re-transcrever** and **Reprocessar (pós-processamento)**.
4. **Android background recording.** The user wants to turn the screen off / send the
   app to the background and keep recording. This is impossible from JS alone — Android
   freezes the process without a foreground service.

## Components

### A. Result screen polish — pure JS, no rebuild

File: `mobile/app/result.tsx`

- Wrap the transcript in a `ScrollView` (nested-scroll enabled) so it's fully readable.
- Show a friendly model name: map the returned model id to the `name` from the
  `/v1/models` list; fall back to a cleaned basename (last path segment, drop
  `.gguf`/quant suffix).
- Drive the audio time + progress bar from real playback status
  (`positionMillis` / `durationMillis`) instead of `lastDurationMs`.

### B. Audio playback from the PC — mobile + desktop Rust

- **Server:** `GET /v1/transcriptions/{id}/audio` (auth) streams the stored WAV for
  that history entry (`recordings_dir()/file_name`), `Content-Type: audio/wav`.
- **Mobile:** the player loads from that URL with the bearer token
  (`Audio.Sound.createAsync({ uri, headers })`), resetting the audio mode to playback
  (`allowsRecordingIOS: false`). Store `lastId` in the recording store. Works for
  streaming recordings and from History.

### C. Re-transcrever + Reprocessar — mobile + desktop Rust

- **Server:**
  - `POST /v1/transcriptions/{id}/retranscribe` — reads the stored WAV, re-runs STT,
    updates the history entry, returns `TranscriptionResponse`.
  - `POST /v1/transcriptions/{id}/reprocess` — re-runs AI post-processing on the stored
    text, updates the entry, returns `TranscriptionResponse`.
- **Mobile:** the "Mais" ActionSheet offers "Re-transcrever" and
  "Reprocessar (pós-processamento)", shows a spinner, and updates the result +
  history on success.

### D. True Android background recording — mobile + EAS rebuild

File: `mobile/app/recording.tsx` + config + new dependency.

- Add `react-native-background-actions`: runs a foreground service with a persistent
  "Handy está gravando" notification, keeping the JS thread + expo-av capture + the
  4s chunk timers alive with the screen off / app backgrounded.
- Start the service when recording begins (Android), stop on finish/cancel; declare
  the `microphone` foreground-service type.
- The Android auto-pause-on-background logic becomes a **fallback** only (used when the
  service fails to start). iOS keeps working via `UIBackgroundModes: ['audio']`.

## Delivery order

A (instant) → D (top priority, one EAS APK build) → B + C (batched, one desktop rebuild).

## Risks

- B & C require a desktop (Rust) rebuild; D requires a new APK (EAS). A is testable now.
- `react-native-background-actions` mic-type FGS on Android 14+ needs the correct
  service type; validated during implementation.
- Re-transcribe/reprocess reuse the stored WAV, so they only work within the 24h
  retention window.
