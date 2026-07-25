# Remote Server Extension for Handy (Proof of Concept)

> **Unofficial proof of concept**
>
> This repository is an experimental, unofficial proof of concept built on top of the open-source [Handy](https://github.com/cjpais/Handy) project. It is not affiliated with, endorsed by, or maintained by the Handy project or its creator.

This repository explores whether Handy's local desktop transcription workflow can be extended with an in-process remote server and a companion mobile client. It is a technical evaluation repository, not an independent product distribution.

For the complete record of intentional differences, extension architecture, compatibility decisions, security posture, and upstream synchronization policy, read [FORK.md](FORK.md).

## Project status

This project is experimental and under active evaluation. It is **not production-ready**, and there is no supported stable public release.

- Historical tags and pre-release artifacts are development snapshots kept for traceability only.
- Do not rely on those snapshots for regular, security-sensitive, or production use.
- The remote functionality may change substantially or be removed as the technical and product evaluation continues.
- Local checks and CI builds do not replace end-to-end validation on real desktop and mobile devices.

## Purpose of this proof of concept

The work in this repository is intended to:

- explore controlling a local Handy desktop instance from a mobile device;
- test an in-process remote HTTP server and companion mobile client;
- gather technical and product feedback about the approach; and
- evaluate whether parts of the implementation could eventually be contributed upstream or developed as an official Handy feature.

That possible future contribution or adoption is not an established plan or a promise of support.

## Relationship to Handy

[Handy](https://github.com/cjpais/Handy) is the original cross-platform, local speech-to-text application created and maintained by [cjpais](https://github.com/cjpais). Its desktop workflow remains the foundation of this repository:

1. Press a configurable shortcut to begin or stop recording.
2. Speak while Handy records locally.
3. Handy processes speech with local models and voice activity detection.
4. The transcription is pasted into the active application and stored in local history.

The desktop transcription flow, audio pipeline, models, settings, and history originate from Handy. The remote server and mobile client in this repository are experimental additions, designed to stay inactive unless the remote server is explicitly enabled.

## Experimental functionality

The proof of concept currently includes:

- an **experimental remote server** running inside the Tauri desktop process;
- an **experimental mobile companion** built with Expo and React Native;
- a **proof-of-concept pairing flow** for authorizing a mobile device from the desktop;
- a **prototype remote transcription workflow** that uploads audio to the desktop instance for local processing; and
- shared contracts, API-client code, design tokens, and post-processing support for the extension.

These components are for development and evaluation. Their behavior, API surface, and storage format are not compatibility commitments.

## Architecture overview

```text
src/                         Desktop settings UI (React and TypeScript)
src-tauri/src/               Desktop application backend (Rust and Tauri)
src-tauri/src/remote/        Experimental in-process Axum server
src-tauri/src/post_processing/ Shared desktop and remote post-processing
mobile/                      Experimental Expo/React Native client
packages/                    Shared contracts, API client, design tokens, and i18n
```

The remote server reuses the desktop application's initialized transcription, model, and history managers. It does not replace Handy's original local shortcut-to-transcription workflow.

Remote settings are stored alongside Handy settings. New remote behavior is intended to remain behind settings so it does not alter the original desktop behavior when disabled. See [FORK.md](FORK.md) for the compatibility rules and known divergence points.

## Running the proof of concept locally

These instructions are for developers and technical evaluators. Build from source rather than treating repository artifacts as a supported installation channel.

### Prerequisites

- [Rust](https://rustup.rs/)
- [Bun](https://bun.sh/)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for the target platform

For platform-specific packages and build troubleshooting, see [BUILD.md](BUILD.md).

### Desktop application

```bash
bun install

# Required for development when the VAD model is not already present
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx \
  https://blob.handy.computer/silero_vad_v4.onnx

bun run tauri dev
```

On macOS, if CMake reports a policy-version error:

```bash
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev
```

Use **Settings → Mobile Access** to enable the experimental server. The default development health check is:

```bash
curl http://127.0.0.1:8765/v1/health
```

The server is disabled until enabled in the desktop settings. Confirm the listener address and port shown by the application before connecting a device.

### Mobile client

In a separate terminal:

```bash
cd mobile
bun install
bun run start
```

The mobile client is an evaluator tool, not a supported mobile application. Test it only against a desktop instance you control.

### Development checks and builds

```bash
# Desktop frontend
bun run lint
bun run build
bun run format:check

# Rust backend
cd src-tauri
cargo clippy
cargo test --lib

# Mobile TypeScript check
cd ../mobile
bun run lint
```

`bun run tauri build` can generate local platform bundles for technical evaluation. A successful build is not a supported public release and does not establish production readiness.

## Security limitations

The experimental remote server is intended only for a trusted local network or a private, encrypted tunnel controlled by the evaluator.

- The server uses plain HTTP and does not provide TLS; bearer credentials and transcription payloads can therefore be visible to network observers.
- Do not expose the server port to the public internet or an untrusted network.
- Review the listener/network settings before allowing a mobile device to connect.
- Pairing approval is performed from the desktop; this is not an authorization boundary suitable for hostile networks.
- Device credentials are stored as hashes and unauthenticated pairing-related routes are rate limited, but these measures do not make the proof of concept suitable for production deployment.

Read the full [security posture in FORK.md](FORK.md#security-posture) before enabling remote access.

## Upstream compatibility

The intended design is additive:

- new remote code is isolated under `src-tauri/src/remote/`, `mobile/`, and `packages/` where possible;
- desktop behavior should remain unchanged when the remote server is disabled;
- touched upstream files should use the smallest practical extension point; and
- upstream synchronization must re-evaluate every documented divergence.

The current extension plan, open risks, validation scope, and non-goals are documented in [docs/EXTENSION_PLAN.md](docs/EXTENSION_PLAN.md). The more detailed remote architecture and API outline are in [docs/HANDY_REMOTE.md](docs/HANDY_REMOTE.md).

## Contributing and upstream discussion

Changes to this proof of concept should preserve the original desktop workflow and keep the extension boundary narrow. Before proposing any upstream contribution, follow Handy's contribution process in [CONTRIBUTING.md](CONTRIBUTING.md) and its repository guidance in [AGENTS.md](AGENTS.md).

Upstream Handy is in feature freeze and new feature work requires community discussion. Contributions from this repository should therefore be treated as proposals for discussion, not as pending upstream work.

## Branding and affiliation

Handy is the original project created and maintained by cjpais. This repository is an unofficial fork and proof of concept.

The Handy name, logo, icon, and brand assets belong to their respective owner. Their presence in this experimental repository must not be interpreted as endorsement, sponsorship, affiliation, or authorization for an independent redistribution. Any future independent distribution would require separate branding unless the Handy maintainers explicitly grant permission.

## Further documentation

- [FORK.md](FORK.md) — intentional differences, architecture, security posture, and upstream synchronization policy
- [docs/HANDY_REMOTE.md](docs/HANDY_REMOTE.md) — experimental remote architecture and API outline
- [docs/EXTENSION_PLAN.md](docs/EXTENSION_PLAN.md) — compatibility and quality plan
- [BUILD.md](BUILD.md) — platform-specific local development and build instructions
- [Original Handy repository](https://github.com/cjpais/Handy) — source and documentation for the upstream desktop application

## License

This repository retains the [MIT License](LICENSE) of the upstream project. License terms do not grant rights to Handy trademarks, logos, icons, or other brand assets.
