package hmacauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

const MaxSkewSeconds = 300

// Sign returns hex(HMAC-SHA256(secret, "{timestamp}.{rawBody}")).
func Sign(secret string, timestamp int64, rawBody []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = fmt.Fprintf(mac, "%d.", timestamp)
	_, _ = mac.Write(rawBody)
	return hex.EncodeToString(mac.Sum(nil))
}

// Verify checks X-L2S-Timestamp + X-L2S-Signature against the raw body.
func Verify(secret, tsHeader, sigHeader string, rawBody []byte, now time.Time) error {
	if secret == "" {
		return fmt.Errorf("hmac secret not configured")
	}
	if tsHeader == "" || sigHeader == "" {
		return fmt.Errorf("missing HMAC headers")
	}
	ts, err := strconv.ParseInt(tsHeader, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid timestamp")
	}
	skew := now.Unix() - ts
	if skew < 0 {
		skew = -skew
	}
	if skew > MaxSkewSeconds {
		return fmt.Errorf("timestamp skew too large")
	}
	expected := Sign(secret, ts, rawBody)
	if !hmacEqualHex(expected, sigHeader) {
		return fmt.Errorf("invalid signature")
	}
	return nil
}

func hmacEqualHex(a, b string) bool {
	ab, errA := hex.DecodeString(a)
	bb, errB := hex.DecodeString(b)
	if errA != nil || errB != nil || len(ab) != len(bb) {
		return false
	}
	return hmac.Equal(ab, bb)
}
