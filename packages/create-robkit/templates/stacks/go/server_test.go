package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/RobertScholey98/robkit/go/guard"
	"github.com/RobertScholey98/robkit/go/session"
)

// visitsInMemory counts visits in a map, in place of the database.
type visitsInMemory map[string]int64

func (v visitsInMemory) record(_ context.Context, viewerID string) error {
	v[viewerID]++
	return nil
}

func (v visitsInMemory) count(_ context.Context, viewerID string) (int64, error) {
	return v[viewerID], nil
}

// answerWith is what routes answers req, as the guard hands it viewer,
// storing visits in visits.
func answerWith(t *testing.T, req *http.Request, viewer guard.Viewer, visits visitsInMemory) *httptest.ResponseRecorder {
	t.Helper()
	page := builtPage(fstest.MapFS{
		"index.html":       {Data: []byte("the page")},
		"assets/style.css": {Data: []byte("the stylesheet")},
	})
	recorder := httptest.NewRecorder()
	routes(page, visits).ServeHTTP(recorder, req.WithContext(session.WithViewer(req.Context(), viewer)))
	return recorder
}

// answer is what routes answers req, as the guard hands it viewer, with no
// visits yet.
func answer(t *testing.T, req *http.Request, viewer guard.Viewer) *httptest.ResponseRecorder {
	t.Helper()
	return answerWith(t, req, viewer, visitsInMemory{})
}

func TestMeSaysWhoIsAskingAndRecordsNothing(t *testing.T) {
	visits := visitsInMemory{"owner-1": 2}

	got := answerWith(t, httptest.NewRequest("GET", "/api/me", nil), guard.Owner{ID: "owner-1"}, visits)

	want := `{"kind":"owner","viewerId":"owner-1","visits":2}` + "\n"
	if got.Code != 200 || got.Body.String() != want {
		t.Errorf("GET /api/me answered %d %q, want 200 %q", got.Code, got.Body, want)
	}
	if visits["owner-1"] != 2 {
		t.Errorf("GET /api/me recorded a visit: the owner has %d, want 2", visits["owner-1"])
	}
}

func TestMeRecordsAVisitAndSaysWhoIsAsking(t *testing.T) {
	guest := guard.Guest{ID: "code-1", Roles: []guard.RoleID{"family"}}

	got := answer(t, httptest.NewRequest("POST", "/api/me", nil), guest)

	want := `{"kind":"guest","viewerId":"code-1","visits":1}` + "\n"
	if got.Code != 200 || got.Body.String() != want {
		t.Errorf("POST /api/me answered %d %q, want 200 %q", got.Code, got.Body, want)
	}
}

func TestMeKeysNobodysVisitsAsNobody(t *testing.T) {
	got := answer(t, httptest.NewRequest("POST", "/api/me", nil), guard.Nobody{})

	want := `{"kind":"nobody","viewerId":"nobody","visits":1}` + "\n"
	if got.Body.String() != want {
		t.Errorf("POST /api/me answered %q, want %q", got.Body, want)
	}
}

func TestServesThePageForAnyPathButItsFilesAndTheAPI(t *testing.T) {
	owner := guard.Owner{ID: "owner-1"}
	for path, want := range map[string]string{
		"/":                 "the page",
		"/recipes/42":       "the page",
		"/assets/style.css": "the stylesheet",
		"/api/nothing":      "404 page not found\n",
	} {
		got := answer(t, httptest.NewRequest("GET", path, nil), owner)

		if got.Body.String() != want {
			t.Errorf("GET %s answered %q, want %q", path, got.Body, want)
		}
	}
}

func TestRefusesToPostToThePage(t *testing.T) {
	got := answer(t, httptest.NewRequest("POST", "/", nil), guard.Nobody{})

	if got.Code != 405 || got.Header().Get("Allow") != "GET, HEAD" {
		t.Errorf("POST / answered %d with Allow %q, want 405 with GET, HEAD", got.Code, got.Header().Get("Allow"))
	}
}
