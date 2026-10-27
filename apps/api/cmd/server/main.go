package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/lfals/magi-bot-panel/apps/api/internal/api"
	"github.com/lfals/magi-bot-panel/apps/api/internal/config"
	"github.com/lfals/magi-bot-panel/apps/api/internal/hub"
	"github.com/lfals/magi-bot-panel/apps/api/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	dir := filepath.Dir(cfg.DatabasePath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Fatalf("mkdir data: %v", err)
		}
	}
	st, err := store.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	srv := api.New(cfg, st, hub.New())
	log.Printf("magi-bot-panel api listening on %s", cfg.BindAddr)
	if err := http.ListenAndServe(cfg.BindAddr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
