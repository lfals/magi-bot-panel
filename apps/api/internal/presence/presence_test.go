package presence

import (
	"testing"
	"time"
)

func TestSendingTTL(t *testing.T) {
	s := New()
	s.SetSendingTTL(30 * time.Millisecond)
	now := time.Now()
	s.SetSending("ch1", "a", now)
	if _, ok := s.GetSending("ch1", now); !ok {
		t.Fatal("expected active")
	}
	expired := s.SweepExpiredSending(now.Add(time.Second))
	if len(expired) != 1 || expired[0].ChannelID != "ch1" {
		t.Fatalf("expired %#v", expired)
	}
	if _, ok := s.GetSending("ch1", now.Add(time.Second)); ok {
		t.Fatal("should be gone")
	}
}

func TestClearSending(t *testing.T) {
	s := New()
	s.SetSending("ch", "a", time.Now())
	ok, from := s.ClearSending("ch")
	if !ok || from != "a" {
		t.Fatalf("%v %v", ok, from)
	}
}
