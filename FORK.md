# Handy Remote Server — divergências em relação ao upstream

Este repositório é um fork de [`cjpais/Handy`](https://github.com/cjpais/Handy).
A intenção declarada é que ele seja uma **extensão aditiva**: o Handy original
continua funcionando exatamente como antes quando o servidor remoto está
desligado, que é o padrão.

Este arquivo existe para que cada sincronização com o upstream seja uma decisão
consciente e não uma arqueologia de diffs.

## Regra de ouro

Código novo vive em:

- `src-tauri/src/remote/` — servidor HTTP em processo
- `src-tauri/src/post_processing/` — pós-processamento compartilhado
- `mobile/` — app companion
- `packages/` — contratos, cliente de API e design tokens compartilhados
- `src/components/settings/MobileAccessSettings.tsx` e `src/remote-session-preview/`

Arquivo do upstream só é tocado com o **ponto de extensão mínimo**: uma linha de
`mod`, um item de menu, um campo com `#[serde(default)]`. Nenhum comportamento
padrão do desktop muda: todo comportamento novo fica atrás de um setting remote,
desligado por padrão.

## Divergências intencionais

| Área | Divergência | Motivo |
| --- | --- | --- |
| `src/components/UpdateChecker.tsx` | Verifica releases do fork, não do upstream | O fork publica seus próprios binários; apontar para o upstream ofereceria um downgrade ao usuário |
| `src-tauri/tauri.conf.json`, `Cargo.toml` | Versão `0.9.6` contra `0.9.4` do upstream | Linha de versão própria do fork |
| `.github/workflows/` | `ci-build.yml` novo; paths `mobile/**` e `packages/**` em `main-build.yml` | O upstream não tem app mobile nem workspaces a construir |
| `src-tauri/src/actions.rs` | ~399 linhas de pós-processamento extraídas para `post_processing/service.rs` | O servidor remoto precisa reusar o pipeline sem passar pelo caminho de UI. Os testes upstream continuam em `actions.rs` via re-export, então não houve perda de cobertura. **Maior fonte de conflito em rebase** — candidato a PR upstream, por ser refactor neutro |
| `src/components/settings/HistorySettings.tsx` | Áudio do histórico sempre via blob URL; `convertFileSrc`/`useOsType` removidos | Correção de bug real: o asset protocol servia áudio obsoleto ao alternar entre linhas do histórico. **Não reverter** sem reproduzir esse bug primeiro |
| `src-tauri/src/settings.rs` | +5 campos `remote_*`, todos `#[serde(default)]`; `SoundTheme::as_str` virou `pub` | Aditivo; um store do upstream continua desserializando |
| `src-tauri/src/audio_toolkit/audio/utils.rs` | +`decode_audio_to_samples`, `wav_duration_ms` | Aditivo; candidato a PR upstream |
| `src-tauri/src/model_capabilities.rs` | +`"moss"` em `KNOWN_ARCHES` | Aditivo; candidato a PR upstream |
| `src-tauri/Cargo.toml` | +axum, tower-http, uuid, qrcode | Dependências do servidor remoto |

## O que deve voltar ao upstream

O que entra no upstream deixa de ser dívida de merge. Candidatos naturais:

1. A extração de pós-processamento de `actions.rs` (refactor neutro, sem mudança
   de comportamento).
2. `decode_audio_to_samples` e `wav_duration_ms`.
3. `"moss"` em `KNOWN_ARCHES`.

Ver [AGENTS.md](AGENTS.md) para o workflow de PR exigido pelo upstream — o
projeto está em feature freeze e exige discussão prévia em Discussions.

## Rotina de sincronização

```bash
git fetch upstream
git rebase upstream/main
```

Depois de rebasear, reconferir cada linha da tabela acima. Conflitos são
esperados em `actions.rs`, `HistorySettings.tsx` e `Cargo.toml`; nos demais
arquivos, um conflito é sinal de que a pegada do fork cresceu além do ponto de
extensão mínimo e deve ser reduzida.

## Validação antes de commitar

```bash
cd src-tauri && cargo fmt && cargo clippy && cargo test --lib
bun run lint
```

Regressão obrigatória do fluxo original, com o servidor remoto **desligado**:
gravação por atalho global, pós-processamento e histórico.

> Nota de ambiente (Windows/x86_64): a feature `vulkan` de `transcribe-cpp` pode
> falhar no link com `LNK2019: dequant_iq4_nl_*`. É uma falha do backend gráfico,
> não do código deste repositório; para rodar `cargo check`/`clippy`/`test`,
> desabilite a feature temporariamente em `src-tauri/Cargo.toml` e **restaure em
> seguida**.
