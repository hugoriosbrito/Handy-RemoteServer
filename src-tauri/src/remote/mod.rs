//! In-process Handy Remote HTTP server.
//!
//! Shares the desktop `TranscriptionManager`, `ModelManager`, and `HistoryManager`
//! rather than spawning a separate Handy process.

pub mod auth;
pub mod cache;
pub mod dto;
pub mod pairing;
mod routes;
pub mod server;
pub mod state;

pub use server::{init_remote_server, maybe_start_remote_server, RemoteServer};
pub use state::RemoteServerState;

/// Shared QR endpoint builder, so the Tauri command path and the HTTP pairing
/// route advertise exactly the same endpoints.
pub(crate) use routes::build_pairing_endpoints;
