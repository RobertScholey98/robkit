package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"testing"

	"github.com/RobertScholey98/robkit/go/guard"
	"github.com/RobertScholey98/robkit/go/session"
)

func TestDevSendsAViteErrorPageWithEachOfTheGuardsHeadersOnce(t *testing.T) {
	// Vite's error pages send nosniff, and might send a framing header.
	vite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		http.Error(w, "Vite couldn't load the module", http.StatusInternalServerError)
	}))
	defer vite.Close()
	target, _ := url.Parse(vite.URL)
	guarded, err := session.Guarded(session.Options{
		App:    "example",
		Access: guard.OpenRule{},
		Core:   "http://core.robkit.localhost:3000",
	})
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()

	guarded(viteProxy(target)).ServeHTTP(recorder, httptest.NewRequest("GET", "http://example.robkit.localhost:3000/src/main.tsx", nil))

	header := recorder.Result().Header
	frame, sniff := header.Values("X-Frame-Options"), header.Values("X-Content-Type-Options")
	if recorder.Code != 500 || !slices.Equal(frame, []string{"SAMEORIGIN"}) || !slices.Equal(sniff, []string{"nosniff"}) {
		t.Errorf("got %d with X-Frame-Options %q and X-Content-Type-Options %q, want 500 with SAMEORIGIN and nosniff once each", recorder.Code, frame, sniff)
	}
}
