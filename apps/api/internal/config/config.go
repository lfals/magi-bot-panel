package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	BindAddr       string
	DatabasePath   string
	HMACSecret     string
	Allowlist      map[string]struct{}
	PanelToken     string
	RateLimitPerMin int
	DevMode        bool
}

func Load() (Config, error) {
	cfg := Config{
		BindAddr:        getenv("BIND_ADDR", "0.0.0.0:8787"),
		DatabasePath:    getenv("DATABASE_PATH", "/data/events.sqlite"),
		HMACSecret:      strings.TrimSpace(os.Getenv("L2S_BUS_HMAC_SECRET")),
		PanelToken:      strings.TrimSpace(os.Getenv("MAGI_PANEL_TOKEN")),
		RateLimitPerMin: 120,
		DevMode:         strings.EqualFold(os.Getenv("MAGI_DEV"), "1") || strings.EqualFold(os.Getenv("MAGI_DEV"), "true"),
	}
	if v := strings.TrimSpace(os.Getenv("RATE_LIMIT_PER_MIN")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return cfg, fmt.Errorf("RATE_LIMIT_PER_MIN invalid: %q", v)
		}
		cfg.RateLimitPerMin = n
	}
	cfg.Allowlist = parseAllowlist(os.Getenv("L2S_BUS_ALLOWLIST"))
	if cfg.HMACSecret == "" && !cfg.DevMode {
		return cfg, fmt.Errorf("L2S_BUS_HMAC_SECRET is required (set MAGI_DEV=1 only for local tests)")
	}
	return cfg, nil
}

func (c Config) Allowlisted(agentID string) bool {
	_, ok := c.Allowlist[agentID]
	return ok
}

func parseAllowlist(raw string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		id := strings.TrimSpace(part)
		if id == "" {
			continue
		}
		out[id] = struct{}{}
	}
	return out
}

func getenv(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}
