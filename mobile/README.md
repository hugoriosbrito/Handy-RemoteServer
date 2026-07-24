# Handy Remote — Mobile

React Native mobile companion for [Handy](https://github.com/cjpais/Handy) desktop speech-to-text. Record audio on your phone and stream transcription to a paired computer.

## Tech stack

- **Expo SDK 53** with **Expo Router** (file-based routing)
- **TypeScript**
- **Zustand** — local state (connection, settings, recording)
- **TanStack Query** — server state (history mock)
- **Zod** — API response validation
- **i18next** — Portuguese (pt-BR) primary, English fallback
- **expo-secure-store** — persisted auth & settings
- **expo-camera** — QR pairing
- **expo-av** — audio recording (MVP placeholder)
- **react-native-svg** — Handy logo

## Design

Matches the Handy desktop palette:

| Token       | Value                 |
| ----------- | --------------------- |
| Primary     | `#da5893`             |
| Logo light  | `#faa2ca`             |
| Logo stroke | `#382731`             |
| Text        | `#0f0f0f`             |
| Background  | `#FFFFFF` / `#fbfbfb` |
| Soft pink   | `#FDF2F7`             |

## Getting started

```bash
cd mobile
bun install
bun run start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` / `a` for simulators.

### Environment

```bash
# Optional — remote API base URL (defaults to stub/mock)
EXPO_PUBLIC_API_URL=https://api.handy.remote
```

## Navigation map

| Route                    | Screen                                 |
| ------------------------ | -------------------------------------- |
| `/`                      | Welcome — "Transcreva pelo celular"    |
| `/pair/scan`             | QR scanner                             |
| `/pair/confirm`          | Pairing confirmation                   |
| `/onboarding/microphone` | Microphone permission                  |
| `/(tabs)`                | Main tabs (Gravar, Histórico, Ajustes) |
| `/recording`             | Active recording UI                    |
| `/recording-reconnect`   | Reconnecting state                     |
| `/result`                | Transcription result                   |
| `/computers`             | Paired computers                       |
| `/offline-queue`         | Offline upload queue                   |

## Project structure

```
mobile/
├── app/                    # Expo Router screens
├── src/
│   ├── api/client.ts       # Typed fetch + Zod + mocks
│   ├── components/ui/      # Button, Input, Toggle, Card, etc.
│   ├── i18n/               # pt-BR + en translations
│   ├── stores/             # Zustand stores
│   └── theme/tokens.ts     # Design tokens
├── app.config.ts
└── package.json
```

## Development notes

- Stores use **mock data** — pairing, recording, and history work offline for UI browsing.
- Replace `api.pairMock` / `api.getHistoryMock` with real endpoints when the remote API is ready.
- Camera and microphone permissions are declared in `app.config.ts`.

## License

Same as the parent Handy project.
