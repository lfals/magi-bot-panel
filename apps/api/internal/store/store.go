package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type ChannelType string

const (
	ChannelDM    ChannelType = "dm"
	ChannelGroup ChannelType = "group"
)

type Source string

const (
	SourceEmit                  Source = "emit"
	SourceTranscriptTail        Source = "transcript_tail"
	SourceReadTranscriptCatchup Source = "readtranscript_catchup"
)

type Event struct {
	EventID     string      `json:"event_id"`
	TS          time.Time   `json:"ts"`
	ChannelType ChannelType `json:"channel_type"`
	ChannelID   string      `json:"channel_id"`
	FromAgentID string      `json:"from_agent_id"`
	FromName    *string     `json:"from_name,omitempty"`
	ToAgentID   *string     `json:"to_agent_id,omitempty"`
	GroupID     *string     `json:"group_id,omitempty"`
	Priority    bool        `json:"priority"`
	Body        string      `json:"body"`
	Source      Source      `json:"source"`
	DedupeKey   string      `json:"dedupe_key"`
}

type IngestInput struct {
	Type        string      `json:"type"` // message (required for typed ingest)
	EventID     string      `json:"event_id"`
	TS          string      `json:"ts"`
	ChannelType ChannelType `json:"channel_type"`
	ChannelID   string      `json:"channel_id"`
	FromAgentID string      `json:"from_agent_id"`
	FromName    *string     `json:"from_name"`
	ToAgentID   *string     `json:"to_agent_id"`
	GroupID     *string     `json:"group_id"`
	Priority    bool        `json:"priority"`
	Body        string      `json:"body"`
	Source      Source      `json:"source"`
	DedupeKey   string      `json:"dedupe_key"`
}

type Channel struct {
	ChannelID    string        `json:"channel_id"`
	ChannelType  ChannelType   `json:"channel_type"`
	Participants []Participant `json:"participants,omitempty"`
	GroupID      *string       `json:"group_id,omitempty"`
	Label        string        `json:"label,omitempty"`
	LastTS       time.Time     `json:"last_ts"`
	LastPreview  string        `json:"last_preview"`
	MessageCount int           `json:"message_count"`
}

type Participant struct {
	AgentID string `json:"agent_id"`
	Name    string `json:"name,omitempty"`
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  from_name TEXT,
  to_agent_id TEXT,
  group_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_events_channel_ts ON events(channel_id, ts);
CREATE TABLE IF NOT EXISTS channels (
  channel_id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,
  group_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  last_ts TEXT NOT NULL,
  last_preview TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  participants_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_channels_last_ts ON channels(last_ts DESC);
`)
	if err != nil {
		return err
	}
	// Soft migrate older drafts missing label column.
	_, _ = s.db.Exec(`ALTER TABLE channels ADD COLUMN label TEXT NOT NULL DEFAULT ''`)
	return nil
}

func DeriveChannelID(ct ChannelType, fromAgentID string, toAgentID, groupID *string) (string, error) {
	switch ct {
	case ChannelDM:
		if toAgentID == nil || strings.TrimSpace(*toAgentID) == "" {
			return "", fmt.Errorf("to_agent_id required for dm")
		}
		a, b := fromAgentID, *toAgentID
		ids := []string{a, b}
		sort.Strings(ids)
		return ids[0] + ":" + ids[1], nil
	case ChannelGroup:
		if groupID == nil || strings.TrimSpace(*groupID) == "" {
			return "", fmt.Errorf("group_id required for group")
		}
		return *groupID, nil
	default:
		return "", fmt.Errorf("invalid channel_type")
	}
}

func NormalizeMessage(in IngestInput, now time.Time) (Event, error) {
	if in.ChannelType != ChannelDM && in.ChannelType != ChannelGroup {
		return Event{}, fmt.Errorf("channel_type must be dm|group")
	}
	if strings.TrimSpace(in.FromAgentID) == "" {
		return Event{}, fmt.Errorf("from_agent_id required")
	}
	if strings.TrimSpace(in.Body) == "" {
		return Event{}, fmt.Errorf("body required")
	}
	if len(in.Body) > 65536 {
		return Event{}, fmt.Errorf("body too large")
	}
	dk := strings.TrimSpace(in.DedupeKey)
	if len(dk) < 8 || len(dk) > 256 {
		return Event{}, fmt.Errorf("dedupe_key length 8..256")
	}
	switch in.Source {
	case SourceEmit, SourceTranscriptTail, SourceReadTranscriptCatchup:
	default:
		return Event{}, fmt.Errorf("invalid source")
	}
	channelID := strings.TrimSpace(in.ChannelID)
	if channelID == "" {
		var err error
		channelID, err = DeriveChannelID(in.ChannelType, in.FromAgentID, in.ToAgentID, in.GroupID)
		if err != nil {
			return Event{}, err
		}
	} else if in.ChannelType == ChannelDM {
		if in.ToAgentID == nil || strings.TrimSpace(*in.ToAgentID) == "" {
			return Event{}, fmt.Errorf("to_agent_id required for dm")
		}
	} else if in.ChannelType == ChannelGroup {
		if in.GroupID == nil || strings.TrimSpace(*in.GroupID) == "" {
			return Event{}, fmt.Errorf("group_id required for group")
		}
	}
	eventID := strings.TrimSpace(in.EventID)
	if eventID == "" {
		eventID = uuid.NewString()
	}
	ts := now.UTC()
	if strings.TrimSpace(in.TS) != "" {
		parsed, err := time.Parse(time.RFC3339Nano, in.TS)
		if err != nil {
			parsed, err = time.Parse(time.RFC3339, in.TS)
			if err != nil {
				return Event{}, fmt.Errorf("invalid ts")
			}
		}
		ts = parsed.UTC()
	}
	return Event{
		EventID:     eventID,
		TS:          ts,
		ChannelType: in.ChannelType,
		ChannelID:   channelID,
		FromAgentID: in.FromAgentID,
		FromName:    in.FromName,
		ToAgentID:   in.ToAgentID,
		GroupID:     in.GroupID,
		Priority:    in.Priority,
		Body:        in.Body,
		Source:      in.Source,
		DedupeKey:   dk,
	}, nil
}

// Normalize is an alias kept for older call sites/tests.
func Normalize(in IngestInput, now time.Time) (Event, error) {
	return NormalizeMessage(in, now)
}

// Insert returns (event, duplicate, error). On duplicate, returns existing event.
func (s *Store) Insert(ev Event) (Event, bool, error) {
	prio := 0
	if ev.Priority {
		prio = 1
	}
	var fromName, toAgent, groupID sql.NullString
	if ev.FromName != nil {
		fromName = sql.NullString{String: *ev.FromName, Valid: true}
	}
	if ev.ToAgentID != nil {
		toAgent = sql.NullString{String: *ev.ToAgentID, Valid: true}
	}
	if ev.GroupID != nil {
		groupID = sql.NullString{String: *ev.GroupID, Valid: true}
	}
	ts := ev.TS.UTC().Format(time.RFC3339Nano)
	tx, err := s.db.Begin()
	if err != nil {
		return Event{}, false, err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.Exec(`
INSERT INTO events(event_id, ts, channel_type, channel_id, from_agent_id, from_name, to_agent_id, group_id, priority, body, source, dedupe_key)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
`, ev.EventID, ts, string(ev.ChannelType), ev.ChannelID, ev.FromAgentID, fromName, toAgent, groupID, prio, ev.Body, string(ev.Source), ev.DedupeKey)
	if err != nil {
		if isUnique(err) {
			existing, gerr := s.getByDedupeTx(tx, ev.DedupeKey)
			if gerr != nil {
				return Event{}, false, gerr
			}
			return existing, true, nil
		}
		return Event{}, false, err
	}

	preview := ev.Body
	if len(preview) > 200 {
		preview = preview[:200]
	}
	mergedParts, err := s.mergeParticipantsTx(tx, ev)
	if err != nil {
		return Event{}, false, err
	}
	_, err = tx.Exec(`
INSERT INTO channels(channel_id, channel_type, group_id, label, last_ts, last_preview, message_count, participants_json)
VALUES(?,?,?,?,?,?,1,?)
ON CONFLICT(channel_id) DO UPDATE SET
  last_ts=excluded.last_ts,
  last_preview=excluded.last_preview,
  message_count=channels.message_count+1,
  participants_json=excluded.participants_json
`, ev.ChannelID, string(ev.ChannelType), groupID, "", ts, preview, mergedParts)
	if err != nil {
		return Event{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return Event{}, false, err
	}
	return ev, false, nil
}

// EnsureChannel upserts a channel shell (for edge.sending before first message).
func (s *Store) EnsureChannel(channelID string, ct ChannelType, fromAgentID string, toAgentID, groupID *string, label string) error {
	if channelID == "" {
		return fmt.Errorf("channel_id required")
	}
	parts := []Participant{{AgentID: fromAgentID}}
	if ct == ChannelDM && toAgentID != nil && *toAgentID != "" {
		parts = append(parts, Participant{AgentID: *toAgentID})
	}
	b, _ := json.Marshal(parts)
	var g sql.NullString
	if groupID != nil && *groupID != "" {
		g = sql.NullString{String: *groupID, Valid: true}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`
INSERT INTO channels(channel_id, channel_type, group_id, label, last_ts, last_preview, message_count, participants_json)
VALUES(?,?,?,?,?,'',0,?)
ON CONFLICT(channel_id) DO NOTHING
`, channelID, string(ct), g, label, now, string(b))
	return err
}

func (s *Store) mergeParticipantsTx(tx *sql.Tx, ev Event) (string, error) {
	var existingJSON string
	err := tx.QueryRow(`SELECT participants_json FROM channels WHERE channel_id=?`, ev.ChannelID).Scan(&existingJSON)
	var existing []Participant
	if err == nil {
		_ = json.Unmarshal([]byte(existingJSON), &existing)
	} else if err != sql.ErrNoRows {
		return "", err
	}
	byID := map[string]Participant{}
	for _, p := range existing {
		byID[p.AgentID] = p
	}
	name := ""
	if ev.FromName != nil {
		name = *ev.FromName
	}
	prev := byID[ev.FromAgentID]
	if name != "" {
		prev.Name = name
	}
	prev.AgentID = ev.FromAgentID
	byID[ev.FromAgentID] = prev
	if ev.ChannelType == ChannelDM && ev.ToAgentID != nil && *ev.ToAgentID != "" {
		if _, ok := byID[*ev.ToAgentID]; !ok {
			byID[*ev.ToAgentID] = Participant{AgentID: *ev.ToAgentID}
		}
	}
	out := make([]Participant, 0, len(byID))
	for _, p := range byID {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AgentID < out[j].AgentID })
	b, _ := json.Marshal(out)
	return string(b), nil
}

func isUnique(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "constraint failed"))
}

func (s *Store) getByDedupeTx(tx *sql.Tx, key string) (Event, error) {
	row := tx.QueryRow(`SELECT event_id, ts, channel_type, channel_id, from_agent_id, from_name, to_agent_id, group_id, priority, body, source, dedupe_key FROM events WHERE dedupe_key=?`, key)
	return scanEvent(row)
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanEvent(row rowScanner) (Event, error) {
	var ev Event
	var ts string
	var ct, src string
	var fromName, toAgent, groupID sql.NullString
	var prio int
	err := row.Scan(&ev.EventID, &ts, &ct, &ev.ChannelID, &ev.FromAgentID, &fromName, &toAgent, &groupID, &prio, &ev.Body, &src, &ev.DedupeKey)
	if err != nil {
		return Event{}, err
	}
	parsed, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, ts)
		if err != nil {
			return Event{}, err
		}
	}
	ev.TS = parsed.UTC()
	ev.ChannelType = ChannelType(ct)
	ev.Source = Source(src)
	ev.Priority = prio != 0
	if fromName.Valid {
		v := fromName.String
		ev.FromName = &v
	}
	if toAgent.Valid {
		v := toAgent.String
		ev.ToAgentID = &v
	}
	if groupID.Valid {
		v := groupID.String
		ev.GroupID = &v
	}
	return ev, nil
}

func (s *Store) ListChannels(limit int, cursor string) ([]Channel, string, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	q := `SELECT channel_id, channel_type, group_id, label, last_ts, last_preview, message_count, participants_json FROM channels`
	args := []any{}
	if cursor != "" {
		q += ` WHERE last_ts < ?`
		args = append(args, cursor)
	}
	q += ` ORDER BY last_ts DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	var items []Channel
	for rows.Next() {
		c, err := scanChannel(rows)
		if err != nil {
			return nil, "", err
		}
		items = append(items, c)
	}
	var next string
	if len(items) > limit {
		next = items[limit-1].LastTS.UTC().Format(time.RFC3339Nano)
		items = items[:limit]
	}
	return items, next, rows.Err()
}

func (s *Store) GetChannel(channelID string) (Channel, bool, error) {
	row := s.db.QueryRow(`SELECT channel_id, channel_type, group_id, label, last_ts, last_preview, message_count, participants_json FROM channels WHERE channel_id=?`, channelID)
	c, err := scanChannel(row)
	if err == sql.ErrNoRows {
		return Channel{}, false, nil
	}
	if err != nil {
		return Channel{}, false, err
	}
	return c, true, nil
}

func scanChannel(row rowScanner) (Channel, error) {
	var c Channel
	var ct, lastTS, partsJSON, label string
	var groupID sql.NullString
	if err := row.Scan(&c.ChannelID, &ct, &groupID, &label, &lastTS, &c.LastPreview, &c.MessageCount, &partsJSON); err != nil {
		return Channel{}, err
	}
	c.ChannelType = ChannelType(ct)
	c.Label = label
	parsed, err := time.Parse(time.RFC3339Nano, lastTS)
	if err != nil {
		parsed, _ = time.Parse(time.RFC3339, lastTS)
	}
	c.LastTS = parsed.UTC()
	if groupID.Valid {
		v := groupID.String
		c.GroupID = &v
	}
	_ = json.Unmarshal([]byte(partsJSON), &c.Participants)
	return c, nil
}

func (s *Store) ChannelExists(channelID string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(1) FROM channels WHERE channel_id=?`, channelID).Scan(&n)
	return n > 0, err
}

func (s *Store) ListMessages(channelID string, since, before *time.Time, limit int) ([]Event, *time.Time, error) {
	if limit < 1 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	q := `SELECT event_id, ts, channel_type, channel_id, from_agent_id, from_name, to_agent_id, group_id, priority, body, source, dedupe_key FROM events WHERE channel_id=?`
	args := []any{channelID}
	if since != nil {
		q += ` AND ts > ?`
		args = append(args, since.UTC().Format(time.RFC3339Nano))
	}
	if before != nil {
		q += ` AND ts < ?`
		args = append(args, before.UTC().Format(time.RFC3339Nano))
	}
	q += ` ORDER BY ts DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var items []Event
	for rows.Next() {
		ev, err := scanEvent(rows)
		if err != nil {
			return nil, nil, err
		}
		items = append(items, ev)
	}
	var nextBefore *time.Time
	if len(items) > limit {
		t := items[limit-1].TS
		nextBefore = &t
		items = items[:limit]
	}
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
	return items, nextBefore, rows.Err()
}

// KnownAgentIDs returns distinct agent IDs seen in channels participants + event from/to.
func (s *Store) KnownAgentIDs() ([]string, map[string]string, error) {
	names := map[string]string{}
	ids := map[string]struct{}{}

	rows, err := s.db.Query(`SELECT participants_json FROM channels`)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			rows.Close()
			return nil, nil, err
		}
		var parts []Participant
		_ = json.Unmarshal([]byte(raw), &parts)
		for _, p := range parts {
			ids[p.AgentID] = struct{}{}
			if p.Name != "" {
				names[p.AgentID] = p.Name
			}
		}
	}
	rows.Close()

	erows, err := s.db.Query(`SELECT DISTINCT from_agent_id, from_name, to_agent_id FROM events`)
	if err != nil {
		return nil, nil, err
	}
	defer erows.Close()
	for erows.Next() {
		var from string
		var fromName, to sql.NullString
		if err := erows.Scan(&from, &fromName, &to); err != nil {
			return nil, nil, err
		}
		ids[from] = struct{}{}
		if fromName.Valid && fromName.String != "" {
			names[from] = fromName.String
		}
		if to.Valid && to.String != "" {
			ids[to.String] = struct{}{}
		}
	}
	out := make([]string, 0, len(ids))
	for id := range ids {
		out = append(out, id)
	}
	sort.Strings(out)
	return out, names, erows.Err()
}
