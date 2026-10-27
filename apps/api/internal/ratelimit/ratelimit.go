package ratelimit

import (
	"sync"
	"time"
)

// Limiter is a simple per-key sliding window (1 minute) counter.
type Limiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	buckets map[string]*bucket
}

type bucket struct {
	count  int
	reset  time.Time
}

func New(perMinute int) *Limiter {
	if perMinute < 1 {
		perMinute = 120
	}
	return &Limiter{
		limit:   perMinute,
		window:  time.Minute,
		buckets: make(map[string]*bucket),
	}
}

// Allow returns true if the key is under the limit.
func (l *Limiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok || now.After(b.reset) {
		l.buckets[key] = &bucket{count: 1, reset: now.Add(l.window)}
		return true
	}
	if b.count >= l.limit {
		return false
	}
	b.count++
	return true
}
