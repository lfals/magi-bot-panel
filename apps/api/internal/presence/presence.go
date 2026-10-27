package presence

import (
	"sync"
	"time"
)

const (
	StatusIdle    = "idle"
	StatusBusy    = "busy"
	StatusOffline = "offline"

	DefaultSendingTTL   = 12 * time.Second
	DefaultOfflineAfter = 5 * time.Minute
)

// Agent is the live projection of a bot node (ADR-002 rev.4).
type Agent struct {
	AgentID     string
	Name        string
	Status      string // idle|busy|offline
	StatusText  string
	LastSeenAt  time.Time
	HasPresence bool // true after any heartbeat/status/message touch
}

// EdgeSending tracks ephemeral "line blinking" per channel.
type EdgeSending struct {
	ChannelID   string
	FromAgentID string
	Until       time.Time
}

// State holds ephemeral agent presence + edge sending flags (in-memory, TTL).
type State struct {
	mu           sync.Mutex
	agents       map[string]*Agent
	sending      map[string]*EdgeSending // channel_id -> sending
	sendingTTL   time.Duration
	offlineAfter time.Duration
}

func New() *State {
	return &State{
		agents:       make(map[string]*Agent),
		sending:      make(map[string]*EdgeSending),
		sendingTTL:   DefaultSendingTTL,
		offlineAfter: DefaultOfflineAfter,
	}
}

func (s *State) SetSendingTTL(d time.Duration) {
	if d > 0 {
		s.sendingTTL = d
	}
}

func (s *State) SetOfflineAfter(d time.Duration) {
	if d > 0 {
		s.offlineAfter = d
	}
}

func (s *State) TouchAgent(agentID, name, status, statusText string, now time.Time) Agent {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.ensureLocked(agentID)
	if name != "" {
		a.Name = name
	}
	if status == "" {
		status = StatusIdle
	}
	a.Status = status
	if statusText == "" {
		statusText = status
	}
	a.StatusText = statusText
	a.LastSeenAt = now.UTC()
	a.HasPresence = true
	return *a
}

func (s *State) Heartbeat(agentID, name string, now time.Time) Agent {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.ensureLocked(agentID)
	if name != "" {
		a.Name = name
	}
	a.LastSeenAt = now.UTC()
	a.HasPresence = true
	if a.Status == "" || a.Status == StatusOffline {
		a.Status = StatusIdle
		a.StatusText = StatusIdle
	}
	return *a
}

func (s *State) SetSending(channelID, fromAgentID string, now time.Time) EdgeSending {
	s.mu.Lock()
	defer s.mu.Unlock()
	es := &EdgeSending{
		ChannelID:   channelID,
		FromAgentID: fromAgentID,
		Until:       now.UTC().Add(s.sendingTTL),
	}
	s.sending[channelID] = es
	a := s.ensureLocked(fromAgentID)
	a.LastSeenAt = now.UTC()
	a.HasPresence = true
	if a.Status == StatusOffline || a.Status == "" {
		a.Status = StatusBusy
	}
	if a.StatusText == "" || a.StatusText == StatusIdle || a.StatusText == StatusOffline {
		a.Status = StatusBusy
		a.StatusText = StatusBusy
	}
	return *es
}

// ClearSending removes sending for channel. Returns (cleared, previous from).
func (s *State) ClearSending(channelID string) (bool, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	es, ok := s.sending[channelID]
	if !ok {
		return false, ""
	}
	from := es.FromAgentID
	delete(s.sending, channelID)
	return true, from
}

// GetSending returns active sending for channel (honours TTL).
func (s *State) GetSending(channelID string, now time.Time) (EdgeSending, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	es, ok := s.sending[channelID]
	if !ok {
		return EdgeSending{}, false
	}
	if !now.Before(es.Until) {
		delete(s.sending, channelID)
		return EdgeSending{}, false
	}
	return *es, true
}

// SweepExpiredSending removes TTL'd sending and returns them for edge.idle fan-out.
func (s *State) SweepExpiredSending(now time.Time) []EdgeSending {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []EdgeSending
	for id, es := range s.sending {
		if !now.Before(es.Until) {
			out = append(out, *es)
			delete(s.sending, id)
		}
	}
	return out
}

// SnapshotAgents returns agents for IDs (creating idle stubs for unknown allowlist IDs).
// Also marks offline when last_seen is stale.
func (s *State) SnapshotAgents(ids []string, names map[string]string, now time.Time) []Agent {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Agent, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		a := s.ensureLocked(id)
		if a.Name == "" {
			if n, ok := names[id]; ok {
				a.Name = n
			}
		}
		out = append(out, s.projectLocked(*a, now))
	}
	return out
}

// AllAgents returns every known presence agent (plus projected offline).
func (s *State) AllAgents(now time.Time) []Agent {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Agent, 0, len(s.agents))
	for _, a := range s.agents {
		cp := s.projectLocked(*a, now)
		out = append(out, cp)
	}
	return out
}

func (s *State) GetAgent(agentID string, now time.Time) (Agent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.agents[agentID]
	if !ok {
		return Agent{}, false
	}
	return s.projectLocked(*a, now), true
}

func (s *State) AllSending(now time.Time) map[string]EdgeSending {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]EdgeSending)
	for id, es := range s.sending {
		if now.Before(es.Until) {
			out[id] = *es
		} else {
			delete(s.sending, id)
		}
	}
	return out
}

func (s *State) ensureLocked(agentID string) *Agent {
	a, ok := s.agents[agentID]
	if !ok {
		a = &Agent{
			AgentID:    agentID,
			Status:     StatusIdle,
			StatusText: StatusIdle,
		}
		s.agents[agentID] = a
	}
	return a
}

func (s *State) projectLocked(a Agent, now time.Time) Agent {
	if a.HasPresence && !a.LastSeenAt.IsZero() && now.Sub(a.LastSeenAt) > s.offlineAfter {
		a.Status = StatusOffline
		if a.StatusText == "" || a.StatusText == StatusIdle || a.StatusText == StatusBusy {
			a.StatusText = StatusOffline
		}
	}
	if a.Status == "" {
		a.Status = StatusIdle
	}
	if a.StatusText == "" {
		a.StatusText = a.Status
	}
	if a.Name == "" {
		a.Name = a.AgentID
	}
	return a
}
