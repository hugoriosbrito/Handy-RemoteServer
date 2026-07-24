//! Bounded, expiring cache for freshly produced remote responses.
//!
//! The remote server answers `GET /v1/transcriptions/{id}` from history, but a
//! transcription that was just created is only fully described (post-processed
//! text, prompt, duration) in memory. A plain `HashMap` served that purpose and
//! grew for the whole lifetime of the desktop process: every recording sent
//! from a phone leaked one entry, forever. This wraps the same lookup with a
//! capacity bound and a TTL so the fast path stays fast without unbounded
//! memory growth.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Entries older than this are treated as absent. The cache only exists to
/// bridge the gap between "just transcribed" and "readable from history", so a
/// short window is enough.
const DEFAULT_TTL: Duration = Duration::from_secs(30 * 60);

/// Hard upper bound on retained entries. Reaching it evicts the oldest ones.
const DEFAULT_CAPACITY: usize = 128;

struct Entry<V> {
    value: V,
    stored_at: Instant,
}

/// A `String`-keyed cache with a TTL and a maximum number of entries.
pub struct BoundedCache<V> {
    entries: Mutex<HashMap<String, Entry<V>>>,
    ttl: Duration,
    capacity: usize,
}

impl<V: Clone> BoundedCache<V> {
    /// Cache with the default 30 minute TTL and 128 entry capacity.
    pub fn new() -> Self {
        Self::with_limits(DEFAULT_TTL, DEFAULT_CAPACITY)
    }

    pub fn with_limits(ttl: Duration, capacity: usize) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            ttl,
            capacity,
        }
    }
}

impl<V: Clone> Default for BoundedCache<V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<V: Clone> BoundedCache<V> {
    /// Lock the map, recovering from a poisoned mutex.
    ///
    /// A panic in an unrelated request must not turn this cache into a
    /// permanent 500 for every later request, so poisoning is absorbed instead
    /// of unwrapped.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Entry<V>>> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn insert(&self, key: String, value: V) {
        let now = Instant::now();
        let mut entries = self.lock();
        entries.retain(|_, entry| now.duration_since(entry.stored_at) < self.ttl);

        // Still full after dropping expired entries: evict oldest first.
        while entries.len() >= self.capacity {
            let oldest = entries
                .iter()
                .min_by_key(|(_, entry)| entry.stored_at)
                .map(|(k, _)| k.clone());
            match oldest {
                Some(k) => {
                    entries.remove(&k);
                }
                None => break,
            }
        }

        entries.insert(
            key,
            Entry {
                value,
                stored_at: now,
            },
        );
    }

    pub fn get(&self, key: &str) -> Option<V> {
        let now = Instant::now();
        let mut entries = self.lock();
        match entries.get(key) {
            Some(entry) if now.duration_since(entry.stored_at) < self.ttl => {
                Some(entry.value.clone())
            }
            Some(_) => {
                entries.remove(key);
                None
            }
            None => None,
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.lock().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_stored_value() {
        let cache: BoundedCache<String> = BoundedCache::new();
        cache.insert("a".to_string(), "one".to_string());
        assert_eq!(cache.get("a"), Some("one".to_string()));
        assert_eq!(cache.get("missing"), None);
    }

    #[test]
    fn evicts_when_capacity_is_reached() {
        let cache: BoundedCache<u32> = BoundedCache::with_limits(DEFAULT_TTL, 3);
        for i in 0..10 {
            cache.insert(format!("k{i}"), i);
            // Instant has coarse resolution on Windows; keep insert order strict.
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(cache.len() <= 3, "cache grew past its capacity");
        assert_eq!(cache.get("k9"), Some(9), "most recent entry must survive");
        assert_eq!(cache.get("k0"), None, "oldest entry must be evicted");
    }

    #[test]
    fn expired_entries_are_not_returned() {
        let cache: BoundedCache<u32> = BoundedCache::with_limits(Duration::from_millis(5), 8);
        cache.insert("a".to_string(), 1);
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(cache.get("a"), None);
        assert_eq!(cache.len(), 0, "expired entry must be dropped on read");
    }

    #[test]
    fn insert_prunes_expired_entries() {
        let cache: BoundedCache<u32> = BoundedCache::with_limits(Duration::from_millis(5), 8);
        cache.insert("old".to_string(), 1);
        std::thread::sleep(Duration::from_millis(20));
        cache.insert("new".to_string(), 2);
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get("new"), Some(2));
    }
}
