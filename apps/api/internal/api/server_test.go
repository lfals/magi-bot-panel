package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/lfals/magi-bot-panel/apps/api/internal/config"
	"github.com/lfals/magi-bot-panel/apps/api/internal/hmacauth"
	"github.com/lfals/magi-bot-panel/apps/api/internal/hub"
	"github.com/lfals/magi-bot-panel/apps/api/internal/presence"
	"github.com/lfals/magi-bot-panel/apps/api/internal/store"
	"nhooyr.io/websocket"
)

const (
	agentA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	agentB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
)

func testServer(t *testing.T, allow ...string) *Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "e.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	al := map[string]struct{}{}
	for _, a := range allow {
		al[a] = struct{}{}
	}
	if len(al) == 0 {
		al[agentA] = struct{}{}
	}
	cfg := config.Config{
		HMACSecret:      "test-secret-32chars-xxxxxxxxxxxx",
		Allowlist:       al,
		RateLimitPerMin: 120,
	}
	srv := New(cfg, st, hub.New())
	t.Cleanup(srv.Close)
	return srv
}

func signedPOST(t *testing.T, srv *Server, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	ts := time.Now().Unix()
	sig := hmacauth.Sign(srv.cfg.HMACSecret, ts, body)
	req := httptest.NewRequest(http.MethodPost, "/v1/events", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-L2S-Timestamp", strconv.FormatInt(ts, 10))
	req.Header.Set("X-L2S-Signature", sig)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	return rr
}

func msgBody(from, to, body, dedupe string) []byte {
	return []byte(`{"type":"message","channel_type":"dm","from_agent_id":"` + from + `","to_agent_id":"` + to + `","body":"` + body + `","dedupe_key":"` + dedupe + `","source":"emit"}`)
}

func TestHealthz(t *testing.T) {
	srv := testServer(t, agentA)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rr.Code != 200 {
		t.Fatalf("status %d", rr.Code)
	}
}

func TestIngestValidHMAC(t *testing.T) {
	srv := testServer(t, agentA)
	body := msgBody(agentA, agentB, "hi", "abcdefghij")
	rr := signedPOST(t, srv, body)
	if rr.Code != http.StatusAccepted {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	var res map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res["accepted"] != true || res["duplicate"] != false {
		t.Fatalf("res %#v", res)
	}
	ev := res["event"].(map[string]any)
	want := agentA + ":" + agentB
	if ev["channel_id"] != want {
		t.Fatalf("channel_id %v", ev["channel_id"])
	}
}

func TestIngestInvalidHMAC(t *testing.T) {
	srv := testServer(t, agentA)
	body := msgBody(agentA, agentB, "hi", "abcdefghij")
	req := httptest.NewRequest(http.MethodPost, "/v1/events", bytes.NewReader(body))
	req.Header.Set("X-L2S-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))
	req.Header.Set("X-L2S-Signature", "00")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rr.Code)
	}
}

func TestIngestAllowlist403(t *testing.T) {
	srv := testServer(t, "only-this-one")
	body := msgBody(agentA, agentB, "hi", "abcdefghij")
	rr := signedPOST(t, srv, body)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
}

func TestIngestDedupeIdempotent(t *testing.T) {
	srv := testServer(t, agentA)
	body := msgBody(agentA, agentB, "hi", "same-dedupe-key-1")
	rr1 := signedPOST(t, srv, body)
	rr2 := signedPOST(t, srv, body)
	if rr1.Code != 202 || rr2.Code != 202 {
		t.Fatalf("codes %d %d", rr1.Code, rr2.Code)
	}
	var r1, r2 map[string]any
	_ = json.Unmarshal(rr1.Body.Bytes(), &r1)
	_ = json.Unmarshal(rr2.Body.Bytes(), &r2)
	if r1["duplicate"] != false || r2["duplicate"] != true {
		t.Fatalf("dup flags %#v %#v", r1["duplicate"], r2["duplicate"])
	}
}

func TestEmptyAllowlistRejectsAll(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "e.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Config{
		HMACSecret:      "test-secret-32chars-xxxxxxxxxxxx",
		Allowlist:       map[string]struct{}{},
		RateLimitPerMin: 120,
	}
	srv := New(cfg, st, hub.New())
	t.Cleanup(srv.Close)
	body := msgBody(agentA, agentB, "hi", "abcdefghij")
	rr := signedPOST(t, srv, body)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status %d", rr.Code)
	}
}

func TestRateLimit(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "e.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Config{
		HMACSecret:      "test-secret-32chars-xxxxxxxxxxxx",
		Allowlist:       map[string]struct{}{agentA: {}},
		RateLimitPerMin: 2,
	}
	srv := New(cfg, st, hub.New())
	t.Cleanup(srv.Close)
	for i := 0; i < 2; i++ {
		body := msgBody(agentA, agentB, "hi", "ratekey00"+strconv.Itoa(i))
		rr := signedPOST(t, srv, body)
		if rr.Code != 202 {
			t.Fatalf("i=%d status %d %s", i, rr.Code, rr.Body.String())
		}
	}
	body := msgBody(agentA, agentB, "hi", "ratekey009")
	rr := signedPOST(t, srv, body)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestEdgeSendingAndGraph(t *testing.T) {
	srv := testServer(t, agentA, agentB)
	sendBody := []byte(`{"type":"edge.sending","from_agent_id":"` + agentA + `","to_agent_id":"` + agentB + `","channel_type":"dm","dedupe_key":"sending-key-1"}`)
	rr := signedPOST(t, srv, sendBody)
	if rr.Code != 202 {
		t.Fatalf("sending status %d %s", rr.Code, rr.Body.String())
	}

	statusBody := []byte(`{"type":"agent.status","agent_id":"` + agentA + `","status":"busy","status_text":"enviando pra B","dedupe_key":"status-key-1"}`)
	rr = signedPOST(t, srv, statusBody)
	if rr.Code != 202 {
		t.Fatalf("status %d %s", rr.Code, rr.Body.String())
	}

	msg := msgBody(agentA, agentB, "hello graph", "graph-msg-001")
	rr = signedPOST(t, srv, msg)
	if rr.Code != 202 {
		t.Fatalf("msg %d %s", rr.Code, rr.Body.String())
	}

	// re-arm sending after message cleared it
	rr = signedPOST(t, srv, sendBody)
	if rr.Code != 202 {
		t.Fatalf("sending2 %d %s", rr.Code, rr.Body.String())
	}

	gr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(gr, httptest.NewRequest(http.MethodGet, "/v1/graph", nil))
	if gr.Code != 200 {
		t.Fatalf("graph %d %s", gr.Code, gr.Body.String())
	}
	var graph map[string]any
	_ = json.Unmarshal(gr.Body.Bytes(), &graph)
	agents, _ := graph["agents"].([]any)
	edges, _ := graph["edges"].([]any)
	if len(agents) < 2 {
		t.Fatalf("agents %#v", agents)
	}
	if len(edges) != 1 {
		t.Fatalf("edges %#v", edges)
	}
	edge := edges[0].(map[string]any)
	if edge["sending"] != true {
		t.Fatalf("expected sending true %#v", edge)
	}
	if edge["sending_from_agent_id"] != agentA {
		t.Fatalf("sending_from %#v", edge)
	}
	if edge["channel_type"] != "dm" {
		t.Fatalf("channel_type %#v", edge)
	}
	foundBusy := false
	for _, a := range agents {
		am := a.(map[string]any)
		if am["agent_id"] == agentA {
			if am["status"] != "busy" && am["status_text"] != "enviando pra B" {
				// status_text from agent.status should stick
			}
			if am["status_text"] == "enviando pra B" || am["status"] == "busy" {
				foundBusy = true
			}
		}
		for _, key := range []string{"agent_id", "name", "status", "status_text"} {
			if _, ok := am[key]; !ok {
				t.Fatalf("agent missing %s: %#v", key, am)
			}
		}
		if _, ok := am["role"]; ok {
			t.Fatalf("role must be omitted in MVP: %#v", am)
		}
	}
	if !foundBusy {
		t.Fatalf("agent A status not busy/text %#v", agents)
	}
}

func TestMessageClearsSending(t *testing.T) {
	srv := testServer(t, agentA)
	srv.presence.SetSendingTTL(30 * time.Second)
	sendBody := []byte(`{"type":"edge.sending","from_agent_id":"` + agentA + `","to_agent_id":"` + agentB + `","channel_type":"dm","dedupe_key":"send-clear-1"}`)
	if rr := signedPOST(t, srv, sendBody); rr.Code != 202 {
		t.Fatalf("sending %d", rr.Code)
	}
	chID := agentA + ":" + agentB
	if _, ok := srv.presence.GetSending(chID, time.Now()); !ok {
		t.Fatal("expected sending active")
	}
	msg := msgBody(agentA, agentB, "done", "clear-msg-001")
	if rr := signedPOST(t, srv, msg); rr.Code != 202 {
		t.Fatalf("msg %d %s", rr.Code, rr.Body.String())
	}
	if _, ok := srv.presence.GetSending(chID, time.Now()); ok {
		t.Fatal("sending should clear on message")
	}
}

func TestSendingTTLSweep(t *testing.T) {
	srv := testServer(t, agentA)
	srv.presence.SetSendingTTL(20 * time.Millisecond)
	ch := srv.hub.Subscribe()
	defer srv.hub.Unsubscribe(ch)

	sendBody := []byte(`{"type":"edge.sending","from_agent_id":"` + agentA + `","to_agent_id":"` + agentB + `","channel_type":"dm","dedupe_key":"ttl-1"}`)
	if rr := signedPOST(t, srv, sendBody); rr.Code != 202 {
		t.Fatalf("sending %d", rr.Code)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		for _, es := range srv.presence.SweepExpiredSending(time.Now()) {
			payload, _ := json.Marshal(map[string]any{"type": "edge.idle", "channel_id": es.ChannelID})
			srv.hub.Broadcast(payload)
		}
		select {
		case msg := <-ch:
			if strings.Contains(string(msg), `"edge.idle"`) {
				return
			}
		case <-time.After(30 * time.Millisecond):
		}
	}
	t.Fatal("expected edge.idle after TTL")
}

func TestPresenceFansOutWS(t *testing.T) {
	srv := testServer(t, agentA)
	ch := srv.hub.Subscribe()
	defer srv.hub.Unsubscribe(ch)

	sendBody := []byte(`{"type":"edge.sending","from_agent_id":"` + agentA + `","to_agent_id":"` + agentB + `","channel_type":"dm","dedupe_key":"ws-send-1"}`)
	if rr := signedPOST(t, srv, sendBody); rr.Code != 202 {
		t.Fatalf("sending %d", rr.Code)
	}
	select {
	case msg := <-ch:
		var m map[string]any
		_ = json.Unmarshal(msg, &m)
		if m["type"] != "edge.sending" {
			t.Fatalf("got %#v", m)
		}
		if m["from_agent_id"] != agentA {
			t.Fatalf("from %#v", m)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting edge.sending")
	}

	statusBody := []byte(`{"type":"agent.status","agent_id":"` + agentA + `","status":"busy","status_text":"trabalhando","dedupe_key":"ws-st-1"}`)
	if rr := signedPOST(t, srv, statusBody); rr.Code != 202 {
		t.Fatalf("status %d", rr.Code)
	}
	select {
	case msg := <-ch:
		var m map[string]any
		_ = json.Unmarshal(msg, &m)
		if m["type"] != "agent.status" {
			t.Fatalf("got %#v", m)
		}
		if m["status_text"] != "trabalhando" {
			t.Fatalf("text %#v", m)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting agent.status")
	}

	msg := msgBody(agentA, agentB, "ws hi", "ws-msg-001")
	if rr := signedPOST(t, srv, msg); rr.Code != 202 {
		t.Fatalf("msg %d", rr.Code)
	}
	gotMessage := false
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) && !gotMessage {
		select {
		case raw := <-ch:
			var m map[string]any
			_ = json.Unmarshal(raw, &m)
			if m["type"] == "message" {
				gotMessage = true
			}
		case <-time.After(50 * time.Millisecond):
		}
	}
	if !gotMessage {
		t.Fatal("expected WS type=message (not message.created)")
	}
}

func TestStreamHello(t *testing.T) {
	srv := testServer(t, agentA)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/v1/stream"
	c, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close(websocket.StatusNormalClosure, "")
	_, data, err := c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal(data, &m)
	if m["type"] != "hello" {
		t.Fatalf("expected hello got %#v", m)
	}
}

func TestAgentOfflineProjection(t *testing.T) {
	srv := testServer(t, agentA)
	srv.presence.SetOfflineAfter(10 * time.Millisecond)
	srv.presence.TouchAgent(agentA, "Backend", presence.StatusIdle, "idle", "", "", time.Now().Add(-time.Second))
	agents, err := srv.buildAgents(time.Now())
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, a := range agents {
		if a["agent_id"] == agentA {
			found = true
			if a["status"] != presence.StatusOffline {
				t.Fatalf("expected offline got %#v", a)
			}
		}
	}
	if !found {
		t.Fatal("agent A missing")
	}
}


func TestGlobalMessagesNewestFirstAndPagination(t *testing.T) {
	srv := testServer(t, agentA, agentB)
	agentC := "cccccccc-cccc-cccc-cccc-cccccccccccc"
	srv.cfg.Allowlist[agentC] = struct{}{}

	// three messages across two channels with controlled timestamps via store
	now := time.Now().UTC()
	bodies := []struct {
		from, to, body, dedupe string
		ts                     time.Time
	}{
		{agentA, agentB, "m1-oldest", "global-m1xxxxxx", now.Add(-3 * time.Minute)},
		{agentA, agentC, "m2-mid", "global-m2xxxxxx", now.Add(-2 * time.Minute)},
		{agentA, agentB, "m3-newest", "global-m3xxxxxx", now.Add(-1 * time.Minute)},
	}
	for _, b := range bodies {
		in := store.IngestInput{
			Type:        "message",
			ChannelType: store.ChannelDM,
			FromAgentID: b.from,
			ToAgentID:   &b.to,
			Body:        b.body,
			Source:      store.SourceEmit,
			DedupeKey:   b.dedupe,
			TS:          b.ts.Format(time.RFC3339Nano),
		}
		ev, err := store.NormalizeMessage(in, now)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := srv.store.Insert(ev); err != nil {
			t.Fatal(err)
		}
	}

	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/messages?limit=2", nil))
	if rr.Code != 200 {
		t.Fatalf("status %d %s", rr.Code, rr.Body.String())
	}
	var page1 map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &page1)
	items := page1["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("want 2 got %#v", items)
	}
	if items[0].(map[string]any)["body"] != "m3-newest" {
		t.Fatalf("newest first %#v", items[0])
	}
	if items[1].(map[string]any)["body"] != "m2-mid" {
		t.Fatalf("second %#v", items[1])
	}
	if _, ok := items[0].(map[string]any)["channel_id"]; !ok {
		t.Fatal("channel_id required on global feed items")
	}
	next := page1["next_before"]
	if next == nil || next == "" {
		t.Fatalf("expected next_before %#v", page1)
	}

	rr2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr2, httptest.NewRequest(http.MethodGet, "/v1/messages?limit=2&before="+next.(string), nil))
	if rr2.Code != 200 {
		t.Fatalf("page2 %d %s", rr2.Code, rr2.Body.String())
	}
	var page2 map[string]any
	_ = json.Unmarshal(rr2.Body.Bytes(), &page2)
	items2 := page2["items"].([]any)
	if len(items2) != 1 || items2[0].(map[string]any)["body"] != "m1-oldest" {
		t.Fatalf("page2 %#v", items2)
	}

	chAB := agentA + ":" + agentB
	rr3 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr3, httptest.NewRequest(http.MethodGet, "/v1/messages?channel_id="+chAB, nil))
	var filtered map[string]any
	_ = json.Unmarshal(rr3.Body.Bytes(), &filtered)
	fitems := filtered["items"].([]any)
	if len(fitems) != 2 {
		t.Fatalf("channel filter %#v", fitems)
	}
	for _, it := range fitems {
		if it.(map[string]any)["channel_id"] != chAB {
			t.Fatalf("wrong channel %#v", it)
		}
	}
}

func TestAgentStatusWaitingOnGraph(t *testing.T) {
	srv := testServer(t, agentA, agentB)
	body := []byte(`{"type":"agent.status","agent_id":"` + agentA + `","status":"waiting","status_text":"aguardando Designer","waiting_for_agent_id":"` + agentB + `","waiting_for_name":"Designer","dedupe_key":"wait-1xxxxx"}`)
	rr := signedPOST(t, srv, body)
	if rr.Code != 202 {
		t.Fatalf("status %d %s", rr.Code, rr.Body.String())
	}
	gr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(gr, httptest.NewRequest(http.MethodGet, "/v1/graph", nil))
	var graph map[string]any
	_ = json.Unmarshal(gr.Body.Bytes(), &graph)
	found := false
	for _, a := range graph["agents"].([]any) {
		am := a.(map[string]any)
		if am["agent_id"] == agentA {
			found = true
			if am["status"] != "waiting" {
				t.Fatalf("status %#v", am)
			}
			if am["status_text"] != "aguardando Designer" {
				t.Fatalf("text %#v", am)
			}
			if am["waiting_for_agent_id"] != agentB {
				t.Fatalf("wait id %#v", am)
			}
			if am["waiting_for_name"] != "Designer" {
				t.Fatalf("wait name %#v", am)
			}
		}
	}
	if !found {
		t.Fatal("agent A missing")
	}
}

func TestEdgePendingAndMessageClearsBoth(t *testing.T) {
	srv := testServer(t, agentA, agentB)
	srv.presence.SetSendingTTL(30 * time.Second)
	srv.presence.SetPendingTTL(30 * time.Minute)

	sendBody := []byte(`{"type":"edge.sending","from_agent_id":"` + agentA + `","to_agent_id":"` + agentB + `","channel_type":"dm","dedupe_key":"pend-send-1"}`)
	if rr := signedPOST(t, srv, sendBody); rr.Code != 202 {
		t.Fatalf("sending %d %s", rr.Code, rr.Body.String())
	}
	pendBody := []byte(`{"type":"edge.pending","from_agent_id":"` + agentA + `","to_agent_id":"` + agentB + `","channel_type":"dm","dedupe_key":"pend-1xxxxx"}`)
	if rr := signedPOST(t, srv, pendBody); rr.Code != 202 {
		t.Fatalf("pending %d %s", rr.Code, rr.Body.String())
	}

	chID := agentA + ":" + agentB
	if _, ok := srv.presence.GetSending(chID, time.Now()); !ok {
		t.Fatal("expected sending")
	}
	if _, ok := srv.presence.GetPending(chID, time.Now()); !ok {
		t.Fatal("expected pending")
	}

	gr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(gr, httptest.NewRequest(http.MethodGet, "/v1/graph", nil))
	var graph map[string]any
	_ = json.Unmarshal(gr.Body.Bytes(), &graph)
	edge := graph["edges"].([]any)[0].(map[string]any)
	if edge["sending"] != true || edge["pending"] != true {
		t.Fatalf("edge flags %#v", edge)
	}
	if edge["pending_from_agent_id"] != agentA {
		t.Fatalf("pending_from %#v", edge)
	}
	if edge["pending_to_agent_id"] != agentB {
		t.Fatalf("pending_to %#v", edge)
	}

	msg := msgBody(agentB, agentA, "reply clears", "clear-both-001")
	if rr := signedPOST(t, srv, msg); rr.Code != 202 {
		t.Fatalf("msg %d %s", rr.Code, rr.Body.String())
	}
	if _, ok := srv.presence.GetSending(chID, time.Now()); ok {
		t.Fatal("sending should clear")
	}
	if _, ok := srv.presence.GetPending(chID, time.Now()); ok {
		t.Fatal("pending should clear")
	}

	gr2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(gr2, httptest.NewRequest(http.MethodGet, "/v1/graph", nil))
	_ = json.Unmarshal(gr2.Body.Bytes(), &graph)
	edge = graph["edges"].([]any)[0].(map[string]any)
	if edge["sending"] != false || edge["pending"] != false {
		t.Fatalf("after clear %#v", edge)
	}
}
