package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDeriveChannelID_DM(t *testing.T) {
	to := "bbb"
	id, err := DeriveChannelID(ChannelDM, "aaa", &to, nil)
	if err != nil {
		t.Fatal(err)
	}
	if id != "aaa:bbb" {
		t.Fatalf("got %q", id)
	}
	to2 := "aaa"
	id2, err := DeriveChannelID(ChannelDM, "zzz", &to2, nil)
	if err != nil {
		t.Fatal(err)
	}
	if id2 != "aaa:zzz" {
		t.Fatalf("got %q", id2)
	}
}

func TestDeriveChannelID_Group(t *testing.T) {
	g := "group-1"
	id, err := DeriveChannelID(ChannelGroup, "a", nil, &g)
	if err != nil {
		t.Fatal(err)
	}
	if id != "group-1" {
		t.Fatalf("got %q", id)
	}
}

func TestInsertDedupe(t *testing.T) {
	dir := t.TempDir()
	st, err := Open(filepath.Join(dir, "t.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	to := "agent-b"
	name := "Backend"
	in := IngestInput{
		ChannelType: ChannelDM,
		FromAgentID: "agent-a",
		FromName:    &name,
		ToAgentID:   &to,
		Body:        "hello",
		Source:      SourceEmit,
		DedupeKey:   "dedupekey1",
	}
	ev, err := Normalize(in, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	e1, dup, err := st.Insert(ev)
	if err != nil || dup {
		t.Fatalf("first insert: dup=%v err=%v", dup, err)
	}
	e2, dup, err := st.Insert(ev)
	if err != nil || !dup {
		t.Fatalf("second insert: dup=%v err=%v", dup, err)
	}
	if e1.EventID != e2.EventID {
		t.Fatalf("event ids differ %s vs %s", e1.EventID, e2.EventID)
	}
}
