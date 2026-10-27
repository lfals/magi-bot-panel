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


func TestListRecentNewestFirst(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "t.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	now := time.Now().UTC()
	toB := "agent-b"
	toC := "agent-c"
	for i, body := range []string{"old", "mid", "new"} {
		to := toB
		if i == 1 {
			to = toC
		}
		in := IngestInput{
			ChannelType: ChannelDM,
			FromAgentID: "agent-a",
			ToAgentID:   &to,
			Body:        body,
			Source:      SourceEmit,
			DedupeKey:   "listrecent" + body + "xx",
			TS:          now.Add(time.Duration(i) * time.Minute).Format(time.RFC3339Nano),
		}
		ev, err := Normalize(in, now)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := st.Insert(ev); err != nil {
			t.Fatal(err)
		}
	}
	items, next, err := st.ListRecent("", nil, nil, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].Body != "new" || items[1].Body != "mid" {
		t.Fatalf("items %#v", items)
	}
	if next == nil {
		t.Fatal("expected next_before")
	}
	items2, next2, err := st.ListRecent("", nil, next, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(items2) != 1 || items2[0].Body != "old" || next2 != nil {
		t.Fatalf("page2 %#v next %#v", items2, next2)
	}
	ch := "agent-a:agent-b"
	filtered, _, err := st.ListRecent(ch, nil, nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered) != 2 {
		t.Fatalf("filter %#v", filtered)
	}
}
