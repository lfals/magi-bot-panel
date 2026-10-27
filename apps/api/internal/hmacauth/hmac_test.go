package hmacauth

import (
	"strconv"
	"testing"
	"time"
)

func TestSignAndVerify(t *testing.T) {
	secret := "test-secret"
	body := []byte(`{"channel_type":"dm","from_agent_id":"a","body":"hi","dedupe_key":"abcdefgh","source":"emit","to_agent_id":"b"}`)
	ts := time.Now().Unix()
	sig := Sign(secret, ts, body)
	if err := Verify(secret, strconv.FormatInt(ts, 10), sig, body, time.Now()); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestRejectBadSignature(t *testing.T) {
	secret := "test-secret"
	body := []byte(`{"x":1}`)
	ts := time.Now().Unix()
	if err := Verify(secret, strconv.FormatInt(ts, 10), "deadbeef", body, time.Now()); err == nil {
		t.Fatal("expected error")
	}
}

func TestRejectSkew(t *testing.T) {
	secret := "test-secret"
	body := []byte(`{"x":1}`)
	ts := time.Now().Add(-10 * time.Minute).Unix()
	sig := Sign(secret, ts, body)
	if err := Verify(secret, strconv.FormatInt(ts, 10), sig, body, time.Now()); err == nil {
		t.Fatal("expected skew error")
	}
}

func TestRejectMissingHeaders(t *testing.T) {
	if err := Verify("sec", "", "", []byte("{}"), time.Now()); err == nil {
		t.Fatal("expected error")
	}
}
