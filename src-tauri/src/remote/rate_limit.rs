//! Request throttling for the unauthenticated remote endpoints.
//!
//! Pairing and token refresh are the only routes that can be called without a
//! credential, which makes them the ones worth guessing at: a six digit pairing
//! code or a refresh token can be brute forced from the LAN at whatever rate the
//! desktop can answer. Every other route is already behind `require_auth`.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Attempts allowed per client within one window.
const DEFAULT_MAX_REQUESTS: u32 = 30;

/// Length of the window the attempts are counted over.
const DEFAULT_WINDOW: Duration = Duration::from_secs(60);

/// Budget for endpoints a paired phone polls in a loop.
///
/// While waiting for the user to approve a pairing, the mobile app asks for the
/// session status every 1.5s, so the guessing budget used for claim/refresh
/// would cut a legitimate pairing short.
const POLL_MAX_REQUESTS: u32 = 120;

struct Window {
    started_at: Instant,
    count: u32,
}

/// Fixed-window counter, keyed by client address.
///
/// Deliberately simple: this guards a handful of routes on a LAN server, so a
/// per-key counter that resets every window is enough, and it cannot grow
/// without bound because stale keys are dropped as they are visited.
pub struct RateLimiter {
    windows: Mutex<HashMap<IpAddr, Window>>,
    max_requests: u32,
    window: Duration,
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::with_limits(DEFAULT_MAX_REQUESTS, DEFAULT_WINDOW)
    }

    /// Limiter sized for a client that polls on a timer rather than one that
    /// could be guessing a secret.
    pub fn for_polling() -> Self {
        Self::with_limits(POLL_MAX_REQUESTS, DEFAULT_WINDOW)
    }

    pub fn with_limits(max_requests: u32, window: Duration) -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            max_requests,
            window,
        }
    }

    /// Record an attempt from `client`, returning false when it must be
    /// rejected. A poisoned lock is absorbed rather than unwrapped: a panic
    /// elsewhere must not turn pairing into a permanent 500.
    pub fn check(&self, client: IpAddr) -> bool {
        let now = Instant::now();
        let mut windows = self.windows.lock().unwrap_or_else(|e| e.into_inner());
        windows.retain(|_, w| now.duration_since(w.started_at) < self.window);

        let entry = windows.entry(client).or_insert(Window {
            started_at: now,
            count: 0,
        });
        if entry.count >= self.max_requests {
            return false;
        }
        entry.count += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> IpAddr {
        "192.168.0.10".parse().unwrap()
    }

    #[test]
    fn allows_requests_up_to_the_limit() {
        let limiter = RateLimiter::with_limits(3, Duration::from_secs(60));
        assert!(limiter.check(client()));
        assert!(limiter.check(client()));
        assert!(limiter.check(client()));
        assert!(
            !limiter.check(client()),
            "the fourth attempt in the window must be rejected"
        );
    }

    #[test]
    fn clients_are_counted_independently() {
        let limiter = RateLimiter::with_limits(1, Duration::from_secs(60));
        assert!(limiter.check(client()));
        assert!(
            limiter.check("192.168.0.11".parse().unwrap()),
            "one noisy phone must not lock out the rest of the LAN"
        );
    }

    #[test]
    fn the_window_expires() {
        let limiter = RateLimiter::with_limits(1, Duration::from_millis(20));
        assert!(limiter.check(client()));
        assert!(!limiter.check(client()));
        std::thread::sleep(Duration::from_millis(30));
        assert!(
            limiter.check(client()),
            "a client must recover once its window has passed"
        );
    }

    #[test]
    fn expired_windows_are_dropped() {
        let limiter = RateLimiter::with_limits(5, Duration::from_millis(20));
        for octet in 0..10u8 {
            limiter.check(IpAddr::from([10, 0, 0, octet]));
        }
        std::thread::sleep(Duration::from_millis(30));
        limiter.check(client());

        let retained = limiter
            .windows
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .len();
        assert_eq!(retained, 1, "stale per-client counters must not accumulate");
    }
}
