//! In-process Handy Remote HTTP server.
//!
//! Shares the desktop `TranscriptionManager`, `ModelManager`, and `HistoryManager`
//! rather than spawning a separate Handy process.

pub mod auth;
pub mod dto;
pub mod pairing;
mod routes;
pub mod server;
pub mod state;

pub use server::{init_remote_server, maybe_start_remote_server, RemoteServer};
pub use state::RemoteServerState;
