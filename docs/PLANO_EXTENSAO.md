# Plano de Ajuste — Handy Remote Server como extensão do Handy

> Atualização do plano anterior, após auditoria do código do fork contra o upstream
> (`cjpais/Handy`). Objetivo declarado: **manter o fork como extensão aditiva, sem
> quebrar o código nem o fluxo original do Handy.**

## 1. Onde o fork está hoje

- Remotes: `origin` = `hugoriosbrito/Handy-RemoteServer`, `upstream` = `cjpais/Handy`.
- `merge-base` = `390729a`; o fork está **34 commits à frente e 0 atrás** — sincronizado.
- Diff `upstream/main...HEAD`, fora de `mobile/`: **110 arquivos, +6603 / −477**.
- App mobile (`mobile/`): **65 arquivos novos, +11025** — 100% aditivo, risco zero de conflito.
- Backend remoto (`src-tauri/src/remote/`): ~1.500 linhas Rust, 16 arquivos; maiores são
  `routes/transcriptions.rs` (437 l.), `auth.rs` (330 l.), `dto.rs` (213 l.).
- Pacotes novos compartilhados: `packages/contracts`, `packages/api-client`,
  `packages/design-tokens` — também aditivos.

**Conclusão:** a esmagadora maioria do fork já é extensão. O problema de compatibilidade
está concentrado em poucos arquivos do upstream que foram tocados.

## 2. Pegada em arquivos do upstream (risco de conflito no próximo sync)

| Arquivo upstream | Mudança do fork | Risco |
| --- | --- | --- |
| `src-tauri/src/actions.rs` | −399 linhas: post-processing extraído para `post_processing/service.rs` (+407) | **Alto** |
| `src/components/settings/HistorySettings.tsx` | Removeu `convertFileSrc`/`useOsType`; agora sempre blob URL | **Alto** (muda comportamento do desktop) |
| `src/components/Sidebar.tsx` | `truncate` → `break-words` no label de **todos** os itens, além do item `mobileAccess` | Médio (cosmético, mas não aditivo) |
| `src/components/UpdateChecker.tsx` | Releases apontam para o fork | Médio (divergência intencional) |
| `src-tauri/Cargo.toml` | `tokio` ampliado para `features = ["full"]`; +axum, tower-http, uuid; versão 0.9.4 → 0.9.6 | Médio |
| `.github/workflows/*` | +`ci-build.yml` (112 l.), paths `mobile/**` e `packages/**`, ajustes em `main-build.yml` | Médio |
| `src-tauri/src/settings.rs` | +5 campos remote, todos `#[serde(default)]`; `SoundTheme::as_str` virou `pub` | Baixo |
| `src-tauri/src/lib.rs` | `mod post_processing; mod remote;` + init + 10 comandos | Baixo |
| `src-tauri/src/audio_toolkit/audio/utils.rs` | +`decode_audio_to_samples`, `wav_duration_ms` | Baixo (aditivo) |
| `src-tauri/src/model_capabilities.rs` | +`"moss"` em `KNOWN_ARCHES` | Baixo |
| `src-tauri/src/commands/mod.rs` | +`pub mod remote;` | Baixo |

Nota positiva: os 5 testes unitários de post-processing que existiam em `actions.rs` no
upstream continuam em `actions.rs` no fork (via re-export de
`crate::post_processing::{is_blank_transcription, process_transcription_output}`), então a
extração não perdeu cobertura. Mas `post_processing/service.rs` não tem testes próprios.

## 3. O que já foi resolvido desde o plano anterior

- **Persistência de credenciais**: `AuthStore` grava devices + fingerprint em
  `remote_auth_store.json` (só hashes), via `portable::store_path`.
- **Rota de refresh**: `POST /v1/auth/refresh` e `GET /v1/auth/session` existem em
  `remote/routes/auth.rs`, registradas em `routes/mod.rs`.
- **Logging de requisições**: middleware `log_requests`.
- **Mobile**: refresh automático no `uploadWithRetry`, flag `needsRepair`, chave i18n
  `recording.pairingExpired`.

⚠️ **Esse trabalho ainda não foi commitado** (10 arquivos modificados + `routes/auth.rs`
e `routes/ws.rs` untracked).

## 4. Itens abertos, priorizados por risco de compatibilidade

### P0 — Divergências que alteram o comportamento do Handy original

1. **`HistorySettings.tsx`**: o caminho `convertFileSrc` foi removido, então o desktop
   agora sempre carrega áudio via blob URL, mesmo sem uso remoto. Ação: restaurar o
   comportamento upstream e adicionar o caminho blob apenas quando a origem for remota
   (ou por trás de uma checagem explícita), não como substituição.
2. **`Sidebar.tsx`**: a troca `truncate` → `break-words` afeta todos os itens de menu.
   Ação: reverter o estilo global e, se `mobileAccess` precisar de quebra de linha,
   aplicar só nesse item.
3. **`actions.rs`**: a extração de 399 linhas é a maior fonte de conflito futuro. Duas
   saídas aceitáveis:
   - (a) propor a extração como PR ao upstream (é refactor limpo e neutro), ou
   - (b) reduzir a pegada: manter as funções em `actions.rs` e fazer
     `post_processing/service.rs` apenas um wrapper fino consumido pelo remote.
   Enquanto não decidir, documentar a extração como divergência conhecida.

### P1 — Corretude do fork (funcionalidade prometida que não existe)

4. **Toggles de rede sem efeito** (confirmado):
   - `remote/server.rs:38` faz bind fixo em `SocketAddr::from(([0,0,0,0], port))`,
     ignorando `remote_local_network_enabled`.
   - `routes/pairing.rs::create_session` sempre popula `local` + `mdns` e
     `tailscale: None`, sem ler os flags.
   - `routes/pairing.rs::claim` sempre exige aprovação manual, ignorando
     `remote_device_approval_required`.
   - Em `commands/remote.rs`, `change_remote_{local_network,access,device_approval}_*`
     só gravam settings e retornam `Ok(())`; só a mudança de porta reinicia o servidor
     (com `sleep(150ms)` — substituir por espera do shutdown real).
   Ação: ou implementar o efeito, ou remover/desabilitar os toggles na UI. Toggle que
   não faz nada é pior que toggle ausente.
5. **`ws.rs` órfão**: 220 linhas untracked, sem `mod ws;` em `routes/mod.rs`, sem cliente
   no mobile. Ação: commitar como WIP atrás de flag, ou remover do worktree.
6. **`TRANSCRIPTION_CACHE`** (`routes/transcriptions.rs:16`): `static Lazy<Mutex<HashMap>>`
   sem cap nem TTL — cresce indefinidamente. Ação: LRU com limite + expiração.

### P2 — Qualidade e padrão de código

7. **`unwrap()`: 29 ocorrências** no módulo remote (o plano antigo contava 17; o fix de
   auth adicionou mais). Distribuição atual: `auth.rs` 19, `pairing.rs` 4,
   `transcriptions.rs` 4, `server.rs` 2. A maioria é `lock().unwrap()`. Ação: helper
   único que trata poison (`.lock().unwrap_or_else(|e| e.into_inner())`) e conversão para
   erro HTTP 500 nos casos restantes.
8. **`require_auth` duplicado em 5 arquivos** (`devices.rs:11`, `history.rs:11`,
   `models.rs:10`, `post_processing.rs:12`, `transcriptions.rs:19`). Ação: extrair para
   um extractor axum ou middleware `RequireAuth` único.
9. **Zero testes no módulo remote**: `src-tauri/src/remote/**` não tem nenhum `#[test]`,
   contra 102 no restante do backend. Ação mínima: testes de unidade para `AuthStore`
   (emissão, refresh, rotação, revogação) e para a máquina de estados de pairing.
10. **`tokio = features = ["full"]`**: ampliado em relação ao upstream. Ação: restringir
    às features realmente usadas (`rt-multi-thread`, `net`, `fs`, `sync`, `macros`, `time`)
    para não inflar build do desktop.
11. **Dívida de i18n**: as 24 locales receberam `sidebar.mobileAccess` e o bloco
    `settings.mobileAccess`; só `pt` está traduzido — as demais estão com texto em inglês.
12. **Higiene do repo**: `.tmp-release/`, `videos/` e `docs/assets/` estão untracked e
    **não** aparecem no `.gitignore`. Ação: ignorar `.tmp-release/` e `videos/`; decidir
    se `docs/assets/` deve ser versionado.

## 5. Regras para manter o fork como extensão

1. **Regra de ouro**: código novo vive em `src-tauri/src/remote/`, `mobile/`, `packages/`,
   `src/components/settings/MobileAccessSettings.tsx` e
   `src/remote-session-preview/`. Arquivo do upstream só é tocado com ponto de extensão
   mínimo (uma linha de `mod`, um item de menu, um campo com `#[serde(default)]`).
2. **Nunca alterar comportamento default do desktop.** Todo comportamento novo fica atrás
   de um setting remote, desligado por padrão.
3. **`FORK.md`**: documentar as divergências intencionais (UpdateChecker apontando para o
   fork, versionamento 0.9.6 vs 0.9.4 upstream, workflows de CI extras, extração de
   `actions.rs`), para serem reaplicadas conscientemente a cada sync.
4. **Sync periódico com upstream**: `git fetch upstream && git rebase upstream/main` como
   rotina; hoje o fork está 0 commits atrás, e essa é a hora barata de reduzir a pegada.
5. **Devolver ao upstream o que for neutro**: a extração de post-processing e os helpers
   `decode_audio_to_samples`/`wav_duration_ms` são candidatos naturais a PR — o que entra
   no upstream deixa de ser dívida de merge.

## 6. Plano de testes

- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` (backend).
- `bun run lint`, `bun run build`, `npx tsc --noEmit` em `mobile/`.
- Testes de unidade novos: `AuthStore` (emitir/refresh/rotacionar/revogar), pairing
  (claim → approve → expiração de TTL), cache de transcrição (cap/TTL).
- Teste manual E2E ainda pendente: pareamento → upload → transcrição → histórico, com
  reinício do desktop no meio para validar a persistência de credenciais.
- Regressão do fluxo original: gravação por atalho global, post-processing e histórico
  com o servidor remoto **desligado**.

## 7. Não-alvos

- Reescrever o app mobile ou os pacotes compartilhados.
- Trocar axum por outro framework.
- Alterar o pipeline de transcrição do upstream.
- Publicar release — nada disso exige tag nova.

## 8. Ordem sugerida de execução

1. Commitar o fix de autenticação já validado (persistência + refresh + logging).
2. P0: reverter `HistorySettings.tsx` e `Sidebar.tsx` para o comportamento upstream,
   isolando o que for remote-only.
3. P1: decidir toggles (implementar ou remover), resolver `ws.rs`, limitar o cache.
4. P2: `require_auth` único, varredura de `unwrap()`, testes do módulo remote,
   `.gitignore`, features do tokio, i18n.
5. Criar `FORK.md` e rebasear no upstream.
