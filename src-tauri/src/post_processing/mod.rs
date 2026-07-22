//! Shared post-processing pipeline used by desktop shortcuts and the remote server.
//!
//! Extracted from `actions.rs` so both paths call the same service without
//! duplicating LLM / OpenCC logic.

pub mod service;
mod types;

pub use service::{
    post_process_transcription, process_transcription_output, resolve_effective_language,
};
pub use types::ProcessedTranscription;

pub(crate) use service::is_blank_transcription;
