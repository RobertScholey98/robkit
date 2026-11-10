package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
	"github.com/RobertScholey98/robkit/go/session"
	"github.com/jackc/pgx/v5/pgxpool"
)

// serve runs the app on HOST and PORT until ctx ends, or until stopped
// sends, which dev uses when Vite exits. The guard answers every request
// first, then the API, then page answers the rest.
func serve(ctx context.Context, page http.Handler, stopped <-chan error) error {
	address, err := listenAddress(os.Getenv)
	if err != nil {
		return err
	}
	// The guard reads the app's slug and core's address, which pnpm dev and
	// robkit deploy set. The rule is the one the owner set for this app in
	// admin.
	guarded, err := session.Guarded(session.Options{})
	if err != nil {
		return err
	}
	databaseURL, err := readDatabaseURL(os.Getenv)
	if err != nil {
		return err
	}
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("can't connect to DATABASE_URL: %w", err)
	}
	defer db.Close()

	server := &http.Server{
		Handler:           guarded(routes(page, visitsIn(db))),
		ReadHeaderTimeout: 10 * time.Second,
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	fmt.Printf("listening on %s\n", address)
	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()
	select {
	case err := <-served:
		return err
	case err := <-stopped:
		server.Close()
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

// recordVisit records a visit by viewerID and counts their visits so far.
type recordVisit func(ctx context.Context, viewerID string) (int64, error)

// routes is the API, under /api, and page for every other GET or HEAD.
func routes(page http.Handler, record recordVisit) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/me", func(w http.ResponseWriter, r *http.Request) {
		viewer := session.ViewerFrom(r.Context())
		id := viewerID(viewer)
		visits, err := record(r.Context(), id)
		if err != nil {
			log.Printf("couldn't record a visit by %s: %v", id, err)
			http.Error(w, "Couldn't record the visit.", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"kind":     viewer.Kind(),
			"viewerId": id,
			"visits":   visits,
		})
	})
	mux.Handle("/api/", http.NotFoundHandler())
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Only GET and HEAD load the page.", http.StatusMethodNotAllowed)
			return
		}
		page.ServeHTTP(w, r)
	})
	return mux
}

// viewerID keys a viewer's data: the owner's id, a guest's code's id, or
// "nobody".
func viewerID(viewer guard.Viewer) string {
	switch viewer := viewer.(type) {
	case guard.Owner:
		return viewer.ID
	case guard.Guest:
		return string(viewer.ID)
	}
	return "nobody"
}

// builtPage serves the page vite build wrote: each file as it is, and
// index.html for any other path, so a link into the page loads it.
func builtPage(files fs.FS) http.Handler {
	server := http.FileServerFS(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if _, err := fs.Stat(files, name); name != "" && err != nil {
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		server.ServeHTTP(w, r)
	})
}

// listenAddress is where the server listens: HOST and PORT, by default
// 127.0.0.1:3000. A container sets HOST to listen beyond loopback.
func listenAddress(getenv func(string) string) (string, error) {
	host, port := getenv("HOST"), getenv("PORT")
	if host == "" {
		host = "127.0.0.1"
	}
	if port == "" {
		port = "3000"
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("PORT is %q, which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000", port)
	}
	return net.JoinHostPort(host, port), nil
}

// readDatabaseURL is DATABASE_URL, which connects as the app's own role.
// Its error never shows the value, which holds a password.
func readDatabaseURL(getenv func(string) string) (string, error) {
	value := getenv("DATABASE_URL")
	if value == "" {
		return "", errors.New("DATABASE_URL is not set. Run the app with pnpm dev, which sets it, or set it to a postgres:// URL")
	}
	if !strings.HasPrefix(value, "postgres://") && !strings.HasPrefix(value, "postgresql://") {
		return "", errors.New("DATABASE_URL isn't a postgres:// URL. Set it to one, such as postgres://user:password@host:5432/database")
	}
	return value, nil
}
