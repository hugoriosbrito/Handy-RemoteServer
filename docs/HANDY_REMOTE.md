# Handy Remote — Visão de Arquitetura

Fork do Handy que mantém o desktop original e adiciona acesso móvel remoto.

## Princípio

> O Handy desktop continua sendo o produto principal. O app móvel é uma nova interface remota para o mesmo processo, os mesmos modelos, as mesmas configurações e o mesmo histórico.

## Estrutura

```
handy-remote/
├── src/                    # UI desktop original
├── src-tauri/src/
│   ├── post_processing/    # Pipeline LLM compartilhado
│   └── remote/             # Servidor Axum in-process
├── mobile/                 # App React Native + Expo
├── packages/
│   ├── contracts/          # Schemas Zod da API
│   ├── api-client/         # Cliente HTTP tipado
│   ├── design-tokens/      # Tokens do design system Handy
│   └── i18n/               # Traduções compartilhadas
└── docs/HANDY_REMOTE.md
```

## Servidor remoto (`src-tauri/src/remote`)

Rodando dentro do processo Tauri (porta padrão `8765`):

| Método     | Rota                       | Auth                                  |
| ---------- | -------------------------- | ------------------------------------- |
| GET        | `/v1/health`               | público                               |
| GET        | `/v1/server`               | público                               |
| POST       | `/v1/pairing/sessions`     | desktop / local                       |
| POST       | `/v1/pairing/claim`        | secreto do QR                         |
| POST       | `/v1/pairing/approve`      | desktop                               |
| GET        | `/v1/pairing/sessions/:id` | público (credenciais só após approve) |
| GET/DELETE | `/v1/devices`              | Bearer                                |
| POST       | `/v1/transcriptions`       | Bearer (multipart WAV)                |
| GET        | `/v1/post-processing`      | Bearer (sem API keys)                 |
| GET/DELETE | `/v1/history`              | Bearer                                |

Compartilha `TranscriptionManager`, `ModelManager` e `HistoryManager` já inicializados.

## Desktop — Acesso móvel

Nova seção na sidebar: **Mobile Access / Acesso móvel**.

Configurações em `AppSettings`:

- `remote_server_enabled` (default: off)
- `remote_server_port` (8765)
- `remote_local_network_enabled`
- `remote_access_enabled`
- `remote_device_approval_required`

## Mobile (`mobile/`)

Expo Router + TypeScript, telas alinhadas ao design Handy (rosa `#da5893` / `#faa2ca`):

1. Boas-vindas
2. Escanear QR
3. Confirmar conexão
4. Permissão de microfone
5. Gravação / Reconexão
6. Resultado
7. Histórico / Computadores / Fila offline / Ajustes

## Pós-processamento

Extraído de `actions.rs` para `src-tauri/src/post_processing/`. Desktop e remote usam `process_transcription_output`. Chaves de API **nunca** são enviadas ao celular.

## Como testar

```bash
# Desktop
bun install
bun run tauri dev
# Em Configurações → Acesso móvel → ativar servidor
# curl http://127.0.0.1:8765/v1/health

# Mobile
cd mobile && bun install && bun run start
```

## Fases

- **Agora (fundação):** servidor health/pairing/upload, UI desktop, app móvel com telas, packages
- **MVP:** pareamento QR completo + upload WAV + histórico mínimo na LAN
- **Beta:** streaming PCM, fila offline, Tailscale
