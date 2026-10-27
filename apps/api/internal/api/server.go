package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/lfals/magi-bot-panel/apps/api/internal/config"
	"github.com/lfals/magi-bot-panel/apps/api/internal/hmacauth"
	"github.com/lfals/magi-bot-panel/apps/api/internal/hub"
	"github.com/lfals/magi-bot-panel/apps/api/internal/presence"
	"github.com/lfals/magi-bot-panel/apps/api/internal/ratelimit"
	"github.com/lfals/magi-bot-panel/apps/api/internal/store"
	"nhooyr.io/websocket"
)

type Server struct {
	cfg      config.Config
	store    *store.Store
	hub      *hub.Hub
	presence *presence.State
	limiter  *ratelimit.Limiter
	mux      *http.ServeMux
	now      func() time.Time
	stop     chan struct{}
}

func New(cfg config.Config, st *store.Store, h *hub.Hub) *Server {
	s := &Server{
		cfg:      cfg,
		store:    st,
		hub:      h,
		presence: presence.New(),
		limiter:  ratelimit.New(cfg.RateLimitPerMin),
		mux:      http.NewServeMux(),
		now:      time.Now,
		stop:     make(chan struct{}),
	}
	s.routes()
	go s.ttlLoop()
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) Close() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}

func (s *Server) routes() {
	// Panel read routes: Tailscale-only trust (L2S-43). Ingest keeps HMAC.
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("POST /v1/events", s.handleIngest)
	s.mux.HandleFunc("GET /v1/graph", s.handleGraph)
	s.mux.HandleFunc("GET /v1/agents", s.handleAgents)
	s.mux.HandleFunc("GET /v1/channels", s.handleListChannels)
	s.mux.HandleFunc("GET /v1/channels/{channelId}", s.handleGetChannel)
	s.mux.HandleFunc("GET /v1/channels/{channelId}/messages", s.handleListMessages)
	s.mux.HandleFunc("GET /v1/stream", s.handleStream)
}

func (s *Server) ttlLoop() {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-s.stop:
			return
		case now := <-t.C:
			for _, es := range s.presence.SweepExpiredSending(now) {
				payload, _ := json.Marshal(map[string]any{
					"type":       "edge.idle",
					"channel_id": es.ChannelID,
				})
				s.hub.Broadcast(payload)
			}
		}
	}
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type envelope struct {
	Type string `json:"type"`
}

func (s *Server) handleIngest(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "unable to read body")
		return
	}
	now := s.now()
	if err := hmacauth.Verify(s.cfg.HMACSecret, r.Header.Get("X-L2S-Timestamp"), r.Header.Get("X-L2S-Signature"), raw, now); err != nil {
		writeErr(w, http.StatusUnauthorized, "unauthorized", err.Error())
		return
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	typ := strings.TrimSpace(env.Type)
	if typ == "" {
		typ = "message" // legacy flat ingest without type
	}
	switch typ {
	case "message":
		s.ingestMessage(w, raw, now)
	case "edge.sending":
		s.ingestEdgeSending(w, raw, now)
	case "agent.status":
		s.ingestAgentStatus(w, raw, now)
	case "agent.heartbeat":
		s.ingestAgentHeartbeat(w, raw, now)
	default:
		writeErr(w, http.StatusBadRequest, "bad_request", "type must be message|edge.sending|agent.status|agent.heartbeat")
	}
}

func (s *Server) ingestMessage(w http.ResponseWriter, raw []byte, now time.Time) {
	var in store.IngestInput
	if err := json.Unmarshal(raw, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	ev, err := store.NormalizeMessage(in, now)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !s.cfg.Allowlisted(ev.FromAgentID) {
		writeErr(w, http.StatusForbidden, "forbidden", "from_agent_id not in allowlist")
		return
	}
	if !s.limiter.Allow(ev.FromAgentID, now) {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "rate limit exceeded")
		return
	}
	stored, dup, err := s.store.Insert(ev)
	if err != nil {
		log.Printf("insert: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal", "persist failed")
		return
	}
	name := ""
	if stored.FromName != nil {
		name = *stored.FromName
	}
	s.presence.Heartbeat(stored.FromAgentID, name, now)
	cleared, _ := s.presence.ClearSending(stored.ChannelID)
	if !dup {
		payload, _ := json.Marshal(map[string]any{
			"type":  "message",
			"event": eventJSON(stored),
		})
		s.hub.Broadcast(payload)
		if cleared {
			idle, _ := json.Marshal(map[string]any{
				"type":       "edge.idle",
				"channel_id": stored.ChannelID,
			})
			s.hub.Broadcast(idle)
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted":  true,
		"duplicate": dup,
		"type":      "message",
		"event":     eventJSON(stored),
	})
}

type edgeSendingIn struct {
	Type        string             `json:"type"`
	TS          string             `json:"ts"`
	ChannelID   string             `json:"channel_id"`
	ChannelType store.ChannelType  `json:"channel_type"`
	FromAgentID string             `json:"from_agent_id"`
	FromName    *string            `json:"from_name"`
	ToAgentID   *string            `json:"to_agent_id"`
	GroupID     *string            `json:"group_id"`
	DedupeKey   string             `json:"dedupe_key"`
}

func (s *Server) ingestEdgeSending(w http.ResponseWriter, raw []byte, now time.Time) {
	var in edgeSendingIn
	if err := json.Unmarshal(raw, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if strings.TrimSpace(in.FromAgentID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "from_agent_id required")
		return
	}
	if !s.cfg.Allowlisted(in.FromAgentID) {
		writeErr(w, http.StatusForbidden, "forbidden", "from_agent_id not in allowlist")
		return
	}
	if !s.limiter.Allow(in.FromAgentID, now) {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "rate limit exceeded")
		return
	}
	channelID := strings.TrimSpace(in.ChannelID)
	ct := in.ChannelType
	if channelID == "" {
		if ct == "" {
			if in.GroupID != nil && strings.TrimSpace(*in.GroupID) != "" {
				ct = store.ChannelGroup
			} else {
				ct = store.ChannelDM
			}
		}
		var err error
		channelID, err = store.DeriveChannelID(ct, in.FromAgentID, in.ToAgentID, in.GroupID)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
	}
	if ct == "" {
		ct = store.ChannelDM
		if strings.Contains(channelID, ":") {
			ct = store.ChannelDM
		} else if in.GroupID != nil {
			ct = store.ChannelGroup
		}
	}
	_ = s.store.EnsureChannel(channelID, ct, in.FromAgentID, in.ToAgentID, in.GroupID, "")
	name := ""
	if in.FromName != nil {
		name = *in.FromName
	}
	s.presence.Heartbeat(in.FromAgentID, name, now)
	es := s.presence.SetSending(channelID, in.FromAgentID, now)
	payload, _ := json.Marshal(map[string]any{
		"type":          "edge.sending",
		"channel_id":    es.ChannelID,
		"from_agent_id": es.FromAgentID,
	})
	s.hub.Broadcast(payload)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted": true,
		"type":     "edge.sending",
		"event": map[string]any{
			"type":          "edge.sending",
			"channel_id":    es.ChannelID,
			"from_agent_id": es.FromAgentID,
		},
	})
}

type agentStatusIn struct {
	Type       string  `json:"type"`
	TS         string  `json:"ts"`
	AgentID    string  `json:"agent_id"`
	FromName   *string `json:"from_name"`
	Name       *string `json:"name"`
	Status     string  `json:"status"`
	StatusText string  `json:"status_text"`
	DedupeKey  string  `json:"dedupe_key"`
}

func (s *Server) ingestAgentStatus(w http.ResponseWriter, raw []byte, now time.Time) {
	var in agentStatusIn
	if err := json.Unmarshal(raw, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if strings.TrimSpace(in.AgentID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "agent_id required")
		return
	}
	if !s.cfg.Allowlisted(in.AgentID) {
		writeErr(w, http.StatusForbidden, "forbidden", "agent_id not in allowlist")
		return
	}
	if !s.limiter.Allow(in.AgentID, now) {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "rate limit exceeded")
		return
	}
	st := strings.TrimSpace(in.Status)
	switch st {
	case presence.StatusIdle, presence.StatusBusy, presence.StatusOffline:
	default:
		writeErr(w, http.StatusBadRequest, "bad_request", "status must be idle|busy|offline")
		return
	}
	name := ""
	if in.Name != nil {
		name = *in.Name
	} else if in.FromName != nil {
		name = *in.FromName
	}
	a := s.presence.TouchAgent(in.AgentID, name, st, in.StatusText, now)
	payload, _ := json.Marshal(map[string]any{
		"type":        "agent.status",
		"agent_id":    a.AgentID,
		"status":      a.Status,
		"status_text": a.StatusText,
	})
	s.hub.Broadcast(payload)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted": true,
		"type":     "agent.status",
		"event": map[string]any{
			"type":        "agent.status",
			"agent_id":    a.AgentID,
			"status":      a.Status,
			"status_text": a.StatusText,
		},
	})
}

type agentHeartbeatIn struct {
	Type      string  `json:"type"`
	TS        string  `json:"ts"`
	AgentID   string  `json:"agent_id"`
	FromName  *string `json:"from_name"`
	Name      *string `json:"name"`
	DedupeKey string  `json:"dedupe_key"`
}

func (s *Server) ingestAgentHeartbeat(w http.ResponseWriter, raw []byte, now time.Time) {
	var in agentHeartbeatIn
	if err := json.Unmarshal(raw, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if strings.TrimSpace(in.AgentID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "agent_id required")
		return
	}
	if !s.cfg.Allowlisted(in.AgentID) {
		writeErr(w, http.StatusForbidden, "forbidden", "agent_id not in allowlist")
		return
	}
	if !s.limiter.Allow(in.AgentID, now) {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "rate limit exceeded")
		return
	}
	name := ""
	if in.Name != nil {
		name = *in.Name
	} else if in.FromName != nil {
		name = *in.FromName
	}
	prev, had := s.presence.GetAgent(in.AgentID, now)
	a := s.presence.Heartbeat(in.AgentID, name, now)
	if !had || prev.Status != a.Status || prev.StatusText != a.StatusText {
		payload, _ := json.Marshal(map[string]any{
			"type":        "agent.status",
			"agent_id":    a.AgentID,
			"status":      a.Status,
			"status_text": a.StatusText,
		})
		s.hub.Broadcast(payload)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted": true,
		"type":     "agent.heartbeat",
		"event": map[string]any{
			"type":         "agent.heartbeat",
			"agent_id":     a.AgentID,
			"status":       a.Status,
			"status_text":  a.StatusText,
			"last_seen_at": a.LastSeenAt.UTC().Format(time.RFC3339Nano),
		},
	})
}

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	now := s.now()
	agents, err := s.buildAgents(now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	edges, err := s.buildEdges(now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"agents": agents,
		"edges":  edges,
	})
}

func (s *Server) handleAgents(w http.ResponseWriter, r *http.Request) {
	now := s.now()
	agents, err := s.buildAgents(now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": agents})
}

func (s *Server) buildAgents(now time.Time) ([]map[string]any, error) {
	knownIDs, names, err := s.store.KnownAgentIDs()
	if err != nil {
		return nil, err
	}
	idSet := map[string]struct{}{}
	for _, id := range knownIDs {
		idSet[id] = struct{}{}
	}
	for id := range s.cfg.Allowlist {
		idSet[id] = struct{}{}
	}
	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	snap := s.presence.SnapshotAgents(ids, names, now)
	out := make([]map[string]any, 0, len(snap))
	for _, a := range snap {
		m := map[string]any{
			"agent_id":    a.AgentID,
			"name":        a.Name,
			"status":      a.Status,
			"status_text": a.StatusText,
		}
		if !a.LastSeenAt.IsZero() {
			m["last_seen_at"] = a.LastSeenAt.UTC().Format(time.RFC3339Nano)
		} else {
			m["last_seen_at"] = nil
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *Server) buildEdges(now time.Time) ([]map[string]any, error) {
	channels, _, err := s.store.ListChannels(200, "")
	if err != nil {
		return nil, err
	}
	sending := s.presence.AllSending(now)
	out := make([]map[string]any, 0, len(channels))
	for _, c := range channels {
		pids := make([]string, 0, len(c.Participants))
		for _, p := range c.Participants {
			pids = append(pids, p.AgentID)
		}
		m := map[string]any{
			"channel_id":      c.ChannelID,
			"channel_type":    c.ChannelType,
			"participant_ids": pids,
			"sending":         false,
		}
		if c.Label != "" {
			m["label"] = c.Label
		}
		if c.MessageCount > 0 {
			m["last_message_at"] = c.LastTS.UTC().Format(time.RFC3339Nano)
			if c.LastPreview != "" {
				m["last_preview"] = c.LastPreview
			}
		} else {
			m["last_message_at"] = nil
		}
		if es, ok := sending[c.ChannelID]; ok {
			m["sending"] = true
			m["sending_from_agent_id"] = es.FromAgentID
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *Server) handleListChannels(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	cursor := r.URL.Query().Get("cursor")
	items, next, err := s.store.ListChannels(limit, cursor)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	out := map[string]any{"items": channelsJSON(items)}
	if next != "" {
		out["next_cursor"] = next
	} else {
		out["next_cursor"] = nil
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetChannel(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	c, ok, err := s.store.GetChannel(channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "channel not found")
		return
	}
	writeJSON(w, http.StatusOK, channelsJSON([]store.Channel{c})[0])
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	ok, err := s.store.ChannelExists(channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "channel not found")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	var since, before *time.Time
	if v := r.URL.Query().Get("since"); v != "" {
		t, err := parseTime(v)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "bad_request", "invalid since")
			return
		}
		since = &t
	}
	if v := r.URL.Query().Get("before"); v != "" {
		t, err := parseTime(v)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "bad_request", "invalid before")
			return
		}
		before = &t
	}
	items, nextBefore, err := s.store.ListMessages(channelID, since, before, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	out := map[string]any{
		"channel_id": channelID,
		"items":      eventsJSON(items),
	}
	if nextBefore != nil {
		out["next_before"] = nextBefore.UTC().Format(time.RFC3339Nano)
	} else {
		out["next_before"] = nil
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	ch := s.hub.Subscribe()
	defer s.hub.Unsubscribe(ch)

	ctx := r.Context()
	hello, _ := json.Marshal(map[string]any{"type": "hello", "ts": s.now().UTC().Format(time.RFC3339Nano)})
	if err := c.Write(ctx, websocket.MessageText, hello); err != nil {
		return
	}

	go func() {
		for {
			_, _, err := c.Read(ctx)
			if err != nil {
				return
			}
		}
	}()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ping, _ := json.Marshal(map[string]any{"type": "ping", "ts": s.now().UTC().Format(time.RFC3339Nano)})
			if err := c.Write(ctx, websocket.MessageText, ping); err != nil {
				return
			}
			if err := c.Ping(ctx); err != nil {
				return
			}
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if err := c.Write(ctx, websocket.MessageText, msg); err != nil {
				return
			}
		}
	}
}

func parseTime(v string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, detail string) {
	writeJSON(w, status, map[string]string{"error": code, "detail": detail})
}

func eventJSON(ev store.Event) map[string]any {
	m := map[string]any{
		"event_id":      ev.EventID,
		"ts":            ev.TS.UTC().Format(time.RFC3339Nano),
		"channel_type":  ev.ChannelType,
		"channel_id":    ev.ChannelID,
		"from_agent_id": ev.FromAgentID,
		"priority":      ev.Priority,
		"body":          ev.Body,
		"source":        ev.Source,
		"dedupe_key":    ev.DedupeKey,
	}
	if ev.FromName != nil {
		m["from_name"] = *ev.FromName
	}
	if ev.ToAgentID != nil {
		m["to_agent_id"] = *ev.ToAgentID
	}
	if ev.GroupID != nil {
		m["group_id"] = *ev.GroupID
	}
	return m
}

func eventsJSON(items []store.Event) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, e := range items {
		out = append(out, eventJSON(e))
	}
	return out
}

func channelsJSON(items []store.Channel) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, c := range items {
		m := map[string]any{
			"channel_id":    c.ChannelID,
			"channel_type":  c.ChannelType,
			"last_ts":       c.LastTS.UTC().Format(time.RFC3339Nano),
			"last_preview":  c.LastPreview,
			"message_count": c.MessageCount,
			"participants":  c.Participants,
		}
		if c.GroupID != nil {
			m["group_id"] = *c.GroupID
		}
		if c.Label != "" {
			m["label"] = c.Label
		}
		out = append(out, m)
	}
	return out
}
