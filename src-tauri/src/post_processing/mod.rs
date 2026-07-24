//! Shared post-processing pipeline used by desktop shortcuts and the remote server.
//!
//! Extracted from `actions.rs` so both paths call the same service without
//! duplicating LLM / OpenCC logic.

pub mod service;
mod types;

pub use service::process_transcription_output;

pub(crate) use service::is_blank_transcription;
